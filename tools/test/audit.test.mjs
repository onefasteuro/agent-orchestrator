import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, readLog, startSegment, classifyResult, unresolved } from '../lib/audit.mjs';
import { runScenario } from '../lib/fake-worker.mjs';
import { makeRepo, makeBrief } from './helpers.mjs';

function logFile() {
  return join(mkdtempSync(join(tmpdir(), 'sdd-audit-')), 'events.jsonl');
}

test('K-12: append assigns sequence and timestamp and rejects unknown types', () => {
  const f = logFile();
  const a = append(f, { event_type: 'run_started', run_id: 'r1' });
  const b = append(f, { event_type: 'dispatch_intent', run_id: 'r1', task_id: 't1', brief_id: 'b1' });
  assert.equal(a.sequence, 1);
  assert.equal(b.sequence, 2);
  assert.ok(/Z$/.test(b.timestamp_utc));
  assert.throws(() => append(f, { event_type: 'made_up' }));
  const { events, problems } = readLog(f);
  assert.equal(events.length, 2);
  assert.equal(problems.length, 0);
});

test('K-12: intent without receipt and receipt without acceptance are visible', () => {
  const f = logFile();
  append(f, { event_type: 'dispatch_intent', run_id: 'r1', task_id: 't1', brief_id: 'b1' });
  append(f, { event_type: 'dispatch_intent', run_id: 'r1', task_id: 't2', brief_id: 'b2', dispatch_id: 'd2' });
  append(f, { event_type: 'dispatch_started', run_id: 'r1', task_id: 't2', dispatch_id: 'd2' });
  append(f, { event_type: 'result_received', run_id: 'r1', task_id: 't2', dispatch_id: 'd2', result_hash: 'h1' });
  const u = unresolved(readLog(f).events);
  assert.deepEqual(u.intent_without_receipt, ['b1']);
  assert.deepEqual(u.result_without_acceptance, ['d2']);
});

test('K-12: identical replay is ignored, conflict is surfaced, stale dispatch is rejected', () => {
  const f = logFile();
  const { repo, base } = makeRepo();
  const brief = makeBrief({ repo, base });
  append(f, { event_type: 'dispatch_intent', run_id: 'r1', task_id: 't1', dispatch_id: 'd1', brief_id: 'b1' });
  const dup = runScenario('duplicate', { repo, brief, task_id: 't1', dispatch_id: 'd1' }).messages;
  assert.equal(classifyResult(readLog(f).events, { run_id: 'r1', task_id: 't1', dispatch_id: 'd1', result_hash: dup[0].result_hash }), 'new');
  append(f, { event_type: 'result_received', run_id: 'r1', task_id: 't1', dispatch_id: 'd1', result_hash: dup[0].result_hash });
  append(f, { event_type: 'acceptance_recorded', run_id: 'r1', task_id: 't1', dispatch_id: 'd1', result_hash: dup[0].result_hash });
  assert.equal(classifyResult(readLog(f).events, { run_id: 'r1', task_id: 't1', dispatch_id: 'd1', result_hash: dup[1].result_hash }), 'ignored');
  const conflict = runScenario('conflict', { repo, brief, task_id: 't1', dispatch_id: 'd1' }).messages[1];
  assert.equal(classifyResult(readLog(f).events, { run_id: 'r1', task_id: 't1', dispatch_id: 'd1', result_hash: conflict.result_hash }), 'conflict');
  append(f, { event_type: 'dispatch_intent', run_id: 'r1', task_id: 't1', dispatch_id: 'd1-retry', brief_id: 'b1' });
  append(f, { event_type: 'dispatch_started', run_id: 'r1', task_id: 't7', dispatch_id: 'd7', brief_id: 'b7' });
  append(f, { event_type: 'worker_stopped', run_id: 'r1', task_id: 't7', dispatch_id: 'd7' });
  assert.equal(classifyResult(readLog(f).events, { run_id: 'r1', task_id: 't7', dispatch_id: 'd7', result_hash: 'late' }), 'stale', 'a stopped dispatch known only from its start receipt is stale');
  append(f, { event_type: 'dispatch_intent', run_id: 'r1', task_id: 't9', dispatch_id: 'd9', brief_id: 'b9' });
  append(f, { event_type: 'dispatch_intent', run_id: 'r1', task_id: 't9', dispatch_id: 'd9-retry', brief_id: 'b9' });
  assert.equal(classifyResult(readLog(f).events, { run_id: 'r1', task_id: 't9', dispatch_id: 'd9', result_hash: 'x' }), 'stale');
  assert.equal(classifyResult(readLog(f).events, { run_id: 'r1', task_id: 't9', dispatch_id: 'ctx_stale000000', result_hash: 'x' }), 'unknown_dispatch');
});

test('K-12: a crash mid-write leaves a partial line that blocks appends until a linked segment starts', () => {
  const f = logFile();
  const { repo, base } = makeRepo();
  const brief = makeBrief({ repo, base });
  append(f, { event_type: 'run_started', run_id: 'r1' });
  runScenario('crash-midwrite', { repo, brief, task_id: 't1', dispatch_id: 'd1', auditFile: f });
  const r = readLog(f);
  assert.equal(r.events.length, 1);
  assert.ok(r.partial && r.partial.startsWith('{"schema_version"'));
  assert.throws(() => append(f, { event_type: 'error' }), /partial line/);
  const seg = join(f, '..', 'events-2.jsonl');
  const header = startSegment(f, seg, 'crash recovery test');
  assert.equal(header.event_type, 'recovery_reconciled');
  assert.equal(header.partial_line_preserved, true);
  assert.equal(header.sequence, 2);
  assert.ok(readFileSync(f, 'utf8').includes('result_rec'), 'old file untouched');
  assert.ok(existsSync(seg));
  append(seg, { event_type: 'error', note: 'continues' });
  assert.equal(readLog(seg).events.length, 2);
});

test('K-12: intents bound by brief_id and dispatches cited by an acceptance are resolved', () => {
  const f = logFile();
  append(f, { event_type: 'dispatch_intent', run_id: 'r', task_ref: 'T1', brief_id: 'b1' });
  append(f, { event_type: 'dispatch_started', run_id: 'r', task_id: 't1', dispatch_id: 'd1', brief_id: 'b1' });
  append(f, { event_type: 'result_received', run_id: 'r', task_id: 't1', dispatch_id: 'd1', result_hash: 'h' });
  append(f, { event_type: 'dispatch_intent', run_id: 'r', task_ref: 'T1-review', brief_id: 'br' });
  append(f, { event_type: 'dispatch_started', run_id: 'r', task_id: 'tr', dispatch_id: 'dr', brief_id: 'br' });
  append(f, { event_type: 'result_received', run_id: 'r', task_id: 'tr', dispatch_id: 'dr', result_hash: 'h2' });
  append(f, { event_type: 'dispatch_intent', run_id: 'r', task_ref: 'T1', brief_id: 'bad' });
  append(f, { event_type: 'brief_rejected', run_id: 'r', brief_id: 'bad' });
  append(f, { event_type: 'acceptance_recorded', run_id: 'r', task_id: 't1', dispatch_id: 'd1', review: { pass1_dispatch: 'dr' } });
  const u = unresolved(readLog(f).events);
  assert.deepEqual(u, { intent_without_receipt: [], receipt_without_result: [], result_without_acceptance: [] });
});

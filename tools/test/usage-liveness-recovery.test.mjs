import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCodexRollout, parsePiStatusBar, usageRecord, coverage } from '../lib/usage.mjs';
import { decideLiveness } from '../lib/liveness.mjs';
import { writeIndex, readIndex, validateIndex, assertIgnored } from '../lib/recovery.mjs';
import { append, readLog } from '../lib/audit.mjs';
import { runScenario } from '../lib/fake-worker.mjs';
import { makeRepo, makeBrief } from './helpers.mjs';

test('K-13: Codex rollout token_count records are read; Pi status bar is parsed; gaps stay gaps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdd-usage-'));
  const f = join(dir, 'rollout.jsonl');
  writeFileSync(f, [
    JSON.stringify({ timestamp: '2026-10-14T20:19:30Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 10, reasoning_output_tokens: 2, total_tokens: 110 }, model_context_window: 1000 } } }),
    JSON.stringify({ timestamp: '2026-10-14T20:29:41Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 502657, cached_input_tokens: 475264, output_tokens: 1961, reasoning_output_tokens: 85, total_tokens: 504618 }, model_context_window: 258400 } } }),
    '{"partial',
  ].join('\n'));
  const c = parseCodexRollout(f);
  assert.equal(c.status, 'actual');
  assert.equal(c.records, 2);
  assert.equal(c.tokens.input, 502657);
  assert.equal(c.tokens.reasoning, 85);
  const p = parsePiStatusBar('↑13k ↓2.6k R99k CH95.5% $0.007 1.3%/1.0M (auto)   (ollama-cloud) deepseek-v4.1-flash • high');
  assert.equal(p.tokens.input, 13000);
  assert.equal(p.tokens.output, 2600);
  assert.equal(p.tokens.reasoning, 99000);
  assert.equal(p.cost.amount, 0.007);
  assert.equal(p.cost.basis, 'pi-configured-rate-estimate');
  assert.equal(parsePiStatusBar('no usage here').status, 'unavailable');
  const rec = usageRecord({ runtime: 'claude', model: 'opus', effort: 'high', dispatch_id: 'd3', started_at: '2026-10-14T20:00:00Z', ended_at: '2026-10-14T20:02:30Z', measurement: null });
  assert.equal(rec.measurement_status, 'unavailable');
  assert.equal(rec.elapsed_seconds, 150);
  assert.equal(rec.tokens, null, 'never zero-filled');
  const est = usageRecord({ runtime: 'codex', model: 'gpt-6-astra', effort: 'high', dispatch_id: 'd4', measurement: c, rate: { input_per_million: 5, output_per_million: 30, source: 'test-rate' } });
  assert.equal(est.cost.basis, 'estimated');
  assert.equal(est.cost.rate_source, 'test-rate');
});

test('K-13: coverage lists dispatches without usage and token gaps', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'sdd-cov-')), 'events.jsonl');
  append(f, { event_type: 'dispatch_started', run_id: 'r', task_id: 't1', dispatch_id: 'd1', runtime: 'codex' });
  append(f, { event_type: 'dispatch_started', run_id: 'r', task_id: 't2', dispatch_id: 'd2', runtime: 'claude' });
  append(f, { event_type: 'dispatch_started', run_id: 'r', task_id: 't3', dispatch_id: 'd3', runtime: 'pi' });
  append(f, usageRecord({ runtime: 'codex', dispatch_id: 'd1', started_at: '2026-10-14T20:00:00Z', ended_at: '2026-10-14T20:01:00Z', measurement: { status: 'actual', tokens: { input: 1 } } }));
  append(f, usageRecord({ runtime: 'claude', dispatch_id: 'd2', started_at: '2026-10-14T20:00:00Z', ended_at: '2026-10-14T20:01:00Z', measurement: null }));
  const cov = coverage(readLog(f).events);
  assert.equal(cov.dispatches, 3);
  assert.equal(cov.with_time, 2);
  assert.equal(cov.with_tokens, 1);
  assert.deepEqual(cov.missing_usage, ['d3']);
  assert.deepEqual(cov.token_gaps, [{ dispatch_id: 'd2', status: 'unavailable' }]);
});

test('K-14: liveness waits on a pending question, inspects on silence, stops on exit', () => {
  const now = Date.parse('2026-10-14T22:30:00Z');
  const live = { liveness: { verdict: 'live', source: 'agent_status' } };
  assert.equal(decideLiveness({ projection: live, role: 'implementer', now, lastProgressAt: now - 5 * 60000 }).action, 'wait');
  assert.equal(decideLiveness({ projection: live, role: 'implementer', now, lastProgressAt: now - 25 * 60000 }).action, 'inspect');
  assert.equal(decideLiveness({ projection: live, role: 'implementer', now, lastProgressAt: now - 25 * 60000, pendingQuestionCreatedAt: new Date(now - 24 * 60000).toISOString() }).action, 'wait', 'clock paused while asking');
  const { repo, base } = makeRepo();
  const silent = runScenario('silent', { repo, brief: makeBrief({ repo, base }), task_id: 't', dispatch_id: 'd' }).projection;
  assert.equal(decideLiveness({ projection: silent, role: 'reviewer', now, lastProgressAt: now - 10 * 60000 }).action, 'wait');
  assert.equal(decideLiveness({ projection: silent, role: 'reviewer', now, lastProgressAt: now - 16 * 60000 }).action, 'inspect');
  assert.equal(decideLiveness({ projection: { liveness: { verdict: 'exited' } }, role: 'advisor', now, lastProgressAt: now }).action, 'stop');
});

test('K-11: recovery index round-trips and requires the pointer fields; ignore rules are checked', () => {
  const { repo } = makeRepo();
  const data = {
    mode: 'M-2', feature_spec: { path: 'specs/feature-a/spec.md', revision: 'a'.repeat(40), sha256: 'b'.repeat(64) },
    feature_plan: { path: 'specs/feature-a/plan.md', revision: 'a'.repeat(40), sha256: 'c'.repeat(64) },
    approval_ref: 'approval-1', authorization_scope: 'feature-a', role_pack_identity: 'd'.repeat(64),
    orca: { run_id: 'run_x', coordinator_handle: 'term_y', dispatches: [] }, worktrees: { integration: repo, tasks: {} },
    accepted_sha: null, pending_question_ids: [], evidence: {}, next_action: 'dispatch task 1', audit_log: '.agents/orca-sdd/runs/feature-a/events.jsonl',
  };
  writeIndex(repo, data);
  const back = readIndex(repo);
  assert.equal(back.orca.run_id, 'run_x');
  assert.ok(back.updated_at);
  assert.throws(() => writeIndex(repo, { ...data, orca: { run_id: 'run_x' } }), /coordinator_handle/);
  assert.ok(validateIndex({}).length >= 10);
  assert.equal(assertIgnored('.agent-task.md\n.agents/orca-sdd/runs/\n').ok, true);
  assert.equal(assertIgnored('.agents/\n').ok, false, 'blanket-ignoring the pack is not accepted');
});

test('K-5: a feature document change invalidates the pinned identity', async () => {
  const { repo, base } = makeRepo();
  const brief = makeBrief({ repo, base });
  const before = brief.context.feature_spec.sha256;
  writeFileSync(join(repo, 'specs/feature-a/spec.md'), '# Feature A v2\n\n- AC-1 changed.\n');
  const { hashBytes } = await import('../lib/canonical.mjs');
  const { readFileSync } = await import('node:fs');
  const after = hashBytes(readFileSync(join(repo, 'specs/feature-a/spec.md')));
  assert.notEqual(before, after, 'queued briefs pinned to the old hash must be revalidated');
});

test('K-1: prompt rendering is deterministic and the pack hash changes with content', async () => {
  const { renderPrompt, packHash } = await import('../lib/render.mjs');
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { repo, base } = makeRepo();
  const brief = makeBrief({ repo, base });
  const a = renderPrompt({ roleText: '# role\n', brief, briefHash: 'h' });
  const b = renderPrompt({ roleText: '# role\n', brief, briefHash: 'h' });
  assert.equal(a.prompt_hash, b.prompt_hash);
  assert.ok(a.prompt.includes('ASSIGNED PATHS') && a.prompt.includes('src/math.mjs') && a.prompt.includes('npm test'));
  const dir = mkdtempSync(join(tmpdir(), 'sdd-pack-'));
  mkdirSync(join(dir, 'roles'));
  writeFileSync(join(dir, 'roles/x.md'), 'one');
  const h1 = packHash(dir).hash;
  writeFileSync(join(dir, 'roles/x.md'), 'two');
  assert.notEqual(packHash(dir).hash, h1);
});

test('K-13: a usage event may cover several dispatches of one session', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'sdd-cov2-')), 'events.jsonl');
  append(f, { event_type: 'dispatch_started', run_id: 'r', task_id: 't1', dispatch_id: 'p1', runtime: 'codex' });
  append(f, { event_type: 'dispatch_started', run_id: 'r', task_id: 't2', dispatch_id: 'p2', runtime: 'codex' });
  append(f, { event_type: 'usage_recorded', run_id: 'r', dispatch_id: 'p2', covers_dispatches: ['p1', 'p2'], measurement_status: 'actual', elapsed_seconds: 90, tokens: { input: 1 } });
  const cov = coverage(readLog(f).events);
  assert.equal(cov.with_tokens, 2);
  assert.deepEqual(cov.missing_usage, []);
});

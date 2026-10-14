// Append-only JSONL audit log (K-12; appendix C). Single writer by policy.
// Intent before launch, acceptance before release, one accepted result per
// dispatch, partial trailing lines preserved as evidence.

import { appendFileSync, existsSync, openSync, closeSync, fsyncSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashObject } from './canonical.mjs';

export const SCHEMA_VERSION = '1';
export const EVENT_TYPES = new Set([
  'run_started', 'approval_recorded', 'brief_validated', 'brief_rejected', 'brief_amended',
  'dispatch_intent', 'dispatch_started', 'result_received', 'result_ignored',
  'candidate_created', 'candidate_rejected', 'review_pass_one_recorded', 'integration_reverted',
  'usage_recorded', 'acceptance_recorded', 'spec_changed', 'worker_stalled', 'human_takeover',
  'human_handback', 'escalation', 'cancellation_requested', 'worker_stopped', 'recovery_reconciled', 'error',
]);

// Reads the log, tolerating a partial trailing line. Returns {events, partial}.
export function readLog(file) {
  if (!existsSync(file)) return { events: [], partial: null, problems: [] };
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const events = [];
  const problems = [];
  let partial = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      if (i === lines.length - 1 || (i === lines.length - 2 && lines[lines.length - 1] === '')) partial = line;
      else problems.push({ line: i + 1, message: 'unparseable line in the middle of the log' });
    }
  }
  let expected = 1;
  for (const e of events) {
    if (e.sequence !== expected) problems.push({ event_id: e.event_id, message: `sequence ${e.sequence}, expected ${expected}` });
    expected = (typeof e.sequence === 'number' ? e.sequence : expected) + 1;
  }
  return { events, partial, problems };
}

export function append(file, event, opts = {}) {
  if (!event || typeof event !== 'object') throw new Error('event must be an object');
  if (!event.event_type) throw new Error('event_type required');
  if (!EVENT_TYPES.has(event.event_type) && !opts.allowCustom) throw new Error(`unknown event_type ${event.event_type}`);
  const { events, partial } = readLog(file);
  if (partial && !opts.afterPartial) throw new Error('log ends in a partial line; run verify and start a linked segment (K-12)');
  const last = events.length ? events[events.length - 1].sequence : 0;
  const record = {
    schema_version: SCHEMA_VERSION,
    event_id: randomUUID(),
    sequence: last + 1,
    timestamp_utc: new Date().toISOString(),
    ...event,
  };
  mkdirSync(dirname(file), { recursive: true });
  const line = JSON.stringify(record) + '\n';
  appendFileSync(file, line, 'utf8');
  try {
    const fd = openSync(file, 'r');
    fsyncSync(fd);
    closeSync(fd);
  } catch {
    /* fsync best effort */
  }
  return record;
}

// Start a linked segment after a crash left a partial line. The old file is
// never rewritten; the new segment records where it continues from.
export function startSegment(file, newFile, reason) {
  const { events, partial } = readLog(file);
  const last = events.length ? events[events.length - 1] : null;
  const header = {
    schema_version: SCHEMA_VERSION,
    event_id: randomUUID(),
    sequence: (last?.sequence || 0) + 1,
    timestamp_utc: new Date().toISOString(),
    event_type: 'recovery_reconciled',
    continues_from: file,
    last_event_id: last?.event_id || null,
    partial_line_preserved: partial !== null,
    partial_line_hash: partial ? hashObject(partial) : null,
    reason,
  };
  mkdirSync(dirname(newFile), { recursive: true });
  writeFileSync(newFile, JSON.stringify(header) + '\n', 'utf8');
  return header;
}

// Decide what a terminal result means for its dispatch (K-12).
// Returns 'new' | 'ignored' (identical replay) | 'conflict' | 'stale' (superseded dispatch).
export function classifyResult(events, { run_id, task_id, dispatch_id, result_hash }) {
  const same = events.filter((e) => e.dispatch_id === dispatch_id && ['result_received', 'acceptance_recorded'].includes(e.event_type));
  if (same.length) {
    const accepted = same.find((e) => e.event_type === 'acceptance_recorded');
    const prior = accepted || same[same.length - 1];
    return prior.result_hash === result_hash ? 'ignored' : 'conflict';
  }
  const laterForTask = events.filter((e) => e.task_id === task_id && e.event_type === 'dispatch_intent' && e.dispatch_id && e.dispatch_id !== dispatch_id);
  const thisIntent = events.find((e) => e.event_type === 'dispatch_intent' && e.dispatch_id === dispatch_id);
  if (thisIntent && laterForTask.some((e) => e.sequence > thisIntent.sequence)) return 'stale';
  if (!thisIntent) return 'unknown_dispatch';
  return 'new';
}

// Intent-before-launch and acceptance-before-release invariants.
export function unresolved(events) {
  const intents = events.filter((e) => e.event_type === 'dispatch_intent');
  const started = new Set(events.filter((e) => e.event_type === 'dispatch_started').map((e) => e.dispatch_id));
  const received = new Set(events.filter((e) => e.event_type === 'result_received').map((e) => e.dispatch_id));
  const accepted = new Set(events.filter((e) => e.event_type === 'acceptance_recorded').map((e) => e.dispatch_id));
  const stopped = new Set(events.filter((e) => ['worker_stopped', 'candidate_rejected', 'error'].includes(e.event_type)).map((e) => e.dispatch_id));
  return {
    intent_without_receipt: intents.filter((e) => !e.dispatch_id || !started.has(e.dispatch_id)).map((e) => e.brief_id || e.event_id),
    receipt_without_result: [...started].filter((d) => d && !received.has(d) && !stopped.has(d)),
    result_without_acceptance: [...received].filter((d) => !accepted.has(d) && !stopped.has(d)),
  };
}

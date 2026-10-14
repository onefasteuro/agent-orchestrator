// Fake-worker harness (K-18). Produces the same artifacts a real worker would
// leave behind, deterministically and without Orca or a model: edits in a task
// checkout, Orca-shaped messages (worker_done, question, escalation), duplicate
// and conflicting completions, a crash that leaves a partial audit line, and a
// liveness projection for a silent worker. Used to test K-2, K-5, K-6, K-7,
// K-11, K-12 and K-14.

import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { hashObject } from './canonical.mjs';

export const SCENARIOS = [
  'done-clean', 'done-out-of-allowlist', 'done-protected', 'done-failed', 'ask', 'escalation',
  'duplicate', 'conflict', 'crash-midwrite', 'silent', 'done-wrong-dispatch',
];

let counter = 0;
const id = (prefix) => `${prefix}_${(++counter).toString(16).padStart(6, '0')}`;

function workerDone({ task_id, dispatch_id, outcome, body, filesModified = [] , from = 'term_fake'}) {
  const msg = {
    id: id('msg'), type: 'worker_done', from_handle: from, subject: body.slice(0, 60), body,
    payload: JSON.stringify({ taskId: task_id, dispatchId: dispatch_id, outcome, filesModified }),
    created_at: new Date().toISOString(),
  };
  return { ...msg, result_hash: hashObject({ task_id, dispatch_id, outcome, body }) };
}

function edit(repo, rel, content) {
  const file = join(repo, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

// Applies the scenario to the checkout and returns the messages the coordinator
// would receive, in order. `fix` is the content written to the assigned path.
export function runScenario(name, { repo, brief, task_id, dispatch_id, fix = 'export const fixed = true;\n', auditFile = null }) {
  const assigned = brief.workspace.assigned_paths?.[0];
  const messages = [];
  switch (name) {
    case 'done-clean':
      edit(repo, assigned, fix);
      messages.push(workerDone({ task_id, dispatch_id, outcome: 'succeeded', body: 'Applied the fix; checks pass.', filesModified: [assigned] }));
      break;
    case 'done-out-of-allowlist':
      edit(repo, assigned, fix);
      edit(repo, 'notes.md', 'scratch notes\n');
      messages.push(workerDone({ task_id, dispatch_id, outcome: 'succeeded', body: 'Applied the fix and left notes.', filesModified: ['notes.md'] }));
      break;
    case 'done-protected':
      edit(repo, assigned, fix);
      edit(repo, 'AGENTS.md', '# rewritten by worker\n');
      messages.push(workerDone({ task_id, dispatch_id, outcome: 'succeeded', body: 'Applied the fix and updated rules.', filesModified: [assigned, 'AGENTS.md'] }));
      break;
    case 'done-failed':
      messages.push(workerDone({ task_id, dispatch_id, outcome: 'failed', body: 'CHECKS_FAILED: npm test reports 1 failing test after two attempts.' }));
      break;
    case 'ask':
      messages.push({ id: id('msg'), type: 'question', from_handle: `dispatch:${dispatch_id}`, body: 'Should clamp() throw when min > max?', payload: JSON.stringify({ taskId: task_id, dispatchId: dispatch_id, question: 'Should clamp() throw when min > max?', options: [] }), created_at: new Date().toISOString() });
      break;
    case 'escalation':
      messages.push({ id: id('msg'), type: 'escalation', from_handle: `dispatch:${dispatch_id}`, body: 'BLOCKED_CONTEXT: feature spec not present in checkout.', payload: JSON.stringify({ taskId: task_id, dispatchId: dispatch_id }), created_at: new Date().toISOString() });
      break;
    case 'duplicate': {
      edit(repo, assigned, fix);
      const m = workerDone({ task_id, dispatch_id, outcome: 'succeeded', body: 'Applied the fix; checks pass.', filesModified: [assigned] });
      messages.push(m, { ...m, id: id('msg'), created_at: new Date().toISOString() });
      break;
    }
    case 'conflict': {
      edit(repo, assigned, fix);
      messages.push(workerDone({ task_id, dispatch_id, outcome: 'succeeded', body: 'Applied the fix; checks pass.', filesModified: [assigned] }));
      messages.push(workerDone({ task_id, dispatch_id, outcome: 'failed', body: 'CHECKS_FAILED: actually the tests fail.' }));
      break;
    }
    case 'done-wrong-dispatch':
      edit(repo, assigned, fix);
      messages.push(workerDone({ task_id, dispatch_id: 'ctx_stale000000', outcome: 'succeeded', body: 'Late result from a replaced attempt.', filesModified: [assigned] }));
      break;
    case 'crash-midwrite':
      if (!auditFile) throw new Error('crash-midwrite needs auditFile');
      appendFileSync(auditFile, '{"schema_version":"1","event_id":"partial","sequence":999,"event_type":"result_rec', 'utf8');
      break;
    case 'silent':
      return { messages: [], projection: { liveness: { verdict: 'unverifiable', reason: 'missing_status', observedAt: Date.now() }, attention: { categories: ['unverifiable'], requiresAction: false } } };
    default:
      throw new Error(`unknown scenario ${name}`);
  }
  return { messages, projection: { liveness: { verdict: 'live', source: 'agent_status', observedAt: Date.now() } } };
}

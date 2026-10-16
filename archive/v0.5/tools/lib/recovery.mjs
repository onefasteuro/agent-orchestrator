// Recovery index `.agent-task.md` (K-11). Markdown with one fenced JSON block so
// a human can read it and the coordinator can parse it. Git-ignored, integration
// checkout only, coordinator-written.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const REQUIRED = [
  'mode', 'feature_spec', 'feature_plan', 'approval_ref', 'authorization_scope', 'role_pack_identity',
  'orca', 'worktrees', 'accepted_sha', 'pending_question_ids', 'evidence', 'next_action', 'audit_log', 'updated_at',
];

export function indexPath(integrationCheckout) {
  return join(integrationCheckout, '.agent-task.md');
}

export function validateIndex(obj) {
  const errors = [];
  for (const k of REQUIRED) if (obj?.[k] === undefined) errors.push(`${k} missing`);
  if (obj?.orca && (!obj.orca.run_id || !obj.orca.coordinator_handle)) errors.push('orca.run_id and orca.coordinator_handle required (K-20)');
  if (obj?.feature_spec && !(obj.feature_spec.revision && obj.feature_spec.sha256)) errors.push('feature_spec needs revision and sha256');
  if (obj?.feature_plan && !(obj.feature_plan.revision && obj.feature_plan.sha256)) errors.push('feature_plan needs revision and sha256');
  return errors;
}

export function writeIndex(integrationCheckout, data) {
  const obj = { ...data, updated_at: new Date().toISOString() };
  const errors = validateIndex(obj);
  if (errors.length) throw new Error('invalid recovery index: ' + errors.join('; '));
  const md = [
    '# Recovery index (coordinator-owned, Git-ignored)',
    '',
    'Pointers only. Orca owns task status, Git owns revisions, the feature documents own intent (A-3).',
    '',
    '```json',
    JSON.stringify(obj, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(indexPath(integrationCheckout), md, 'utf8');
  return obj;
}

export function readIndex(integrationCheckout) {
  const file = indexPath(integrationCheckout);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const m = text.match(/```json\n([\s\S]*?)\n```/);
  if (!m) throw new Error('recovery index has no JSON block');
  return JSON.parse(m[1]);
}

export function assertIgnored(repoGitIgnoreText) {
  const rules = repoGitIgnoreText.split('\n').map((l) => l.trim());
  const ok = rules.includes('.agent-task.md') && rules.some((r) => r === '.agents/orca-sdd/runs/' || r === '.agents/orca-sdd/runs');
  return { ok, missing: [ok ? null : 'need both `.agent-task.md` and `.agents/orca-sdd/runs/` in .gitignore (never the whole role pack)'].filter(Boolean) };
}

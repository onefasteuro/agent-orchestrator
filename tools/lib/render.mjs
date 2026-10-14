// Deterministic prompt rendering and pack hashing (K-1, C-2).
// The delivered prompt is role text + TASK block rendered from the validated
// envelope. Its bytes are hashed separately from the envelope (appendix A).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hashBytes, hashObject } from './canonical.mjs';

export function packHash(dir) {
  const files = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (name.startsWith('.')) continue;
      if (statSync(p).isDirectory()) walk(p);
      else files[relative(dir, p).split('\\').join('/')] = hashBytes(readFileSync(p));
    }
  };
  walk(dir);
  return { hash: hashObject(files), files: Object.keys(files).length };
}

const list = (a) => (Array.isArray(a) && a.length ? a.map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '- (none)');

export function renderTaskBlock(brief, { briefHash, featureSpecExcerpt = '', featurePlanExcerpt = '' } = {}) {
  const { identity: id, objective: ob, context: cx, workspace: ws, execution: ex, validation: va, delivery: de } = brief;
  const lines = [];
  lines.push('=== TASK ===');
  lines.push(`MODE: ${id.mode}   ROLE: ${id.role}   BRIEF: ${id.brief_id} hash ${briefHash || '(unhashed)'}`);
  lines.push(`RUNTIME: ${ex.runtime} ${ex.model} effort ${ex.effort}   PERMISSIONS: ${ex.permission_recipe}`);
  lines.push('', 'OBJECTIVE', ob.outcome, `Acceptance criteria: ${(ob.ac_ids || []).join(', ') || '(none; provisional question ' + (ob.provisional_question_id || '?') + ')'}`, `Exclusions: ${(ob.exclusions || []).join('; ') || '(none)'}`, `Expected result: ${ob.expected_result}`);
  lines.push('', 'WORKSPACE', `Repository: ${ws.repository}`, `Your checkout: ${ws.worker_checkout}`, `Base commit: ${ws.base_sha}`);
  if (ws.candidate_sha) lines.push(`Candidate commit under review: ${ws.candidate_sha}`);
  if (ws.dirty_state) lines.push(`Transient state you are inspecting: ${ws.dirty_state}`);
  lines.push('', 'ASSIGNED PATHS (the only paths you may change)', list(ws.assigned_paths), 'NEW PATHS (you may create exactly these)', list(ws.new_paths));
  lines.push(`PROTECTED (never change): feature spec and plan, AGENTS.md, CLAUDE.md, .agents/, .claude/, .githooks/, .git/, .gitignore, .gitattributes, .agent-task.md${ws.protected_paths?.length ? ', plus ' + ws.protected_paths.join(', ') : ''}`);
  lines.push('', 'RULES AND CONTEXT', `Project instructions: ${(cx.instructions || []).join(', ') || '(none)'}`, 'Relevant decisions and predecessor conclusions:', list(cx.predecessor_conclusions), `Evidence available in your checkout: ${(cx.evidence || []).join(', ') || '(none)'}`);
  lines.push('', `FEATURE SPEC (${cx.feature_spec.path} at ${cx.feature_spec.revision}, sha256 ${cx.feature_spec.sha256})`, featureSpecExcerpt || '(present in your checkout at the path above)');
  lines.push('', `FEATURE PLAN (${cx.feature_plan.path} at ${cx.feature_plan.revision}, sha256 ${cx.feature_plan.sha256})`, featurePlanExcerpt || (de.pass === 1 ? '(withheld in review pass 1)' : '(present in your checkout at the path above)'));
  lines.push('', 'REQUIRED CHECKS', (va.checks || []).length ? va.checks.map((c) => `- ${c.name}: run \`${c.command}\`, expect: ${c.expected}`).join('\n') : '- (none)', `Setup complete: ${ex.readiness?.setup_complete}   Fixtures only, no secrets.`);
  lines.push('', 'LIMITS', `One session of ${ex.limits.session_minutes} minutes, ${ex.limits.attempts} attempts in total for this task, at most ${ex.limits.max_files} files and ${ex.limits.max_lines} changed lines${va.estimate ? ` (estimate: ${va.estimate.files} files, ${va.estimate.lines} lines)` : ''}. Declared generated paths: ${(va.generated_paths || []).join(', ') || '(none)'}. Scratch: ${(va.scratch_paths || []).join(', ') || '(none)'}.`);
  if (ex.retrieval?.length) lines.push(`Required retrieval methods: ${ex.retrieval.join(', ')}`);
  lines.push('', 'RESULT', `Send one worker_done with: ${(de.result_fields || []).join(', ')}.`, `Escalate when: ${de.escalation_rule}`, `Usage source: ${de.usage_source}   Budget: ${de.budget_ref}`);
  if (de.pass) lines.push(`REVIEW PASS: ${de.pass}.${de.pass === 1 ? ' Withheld in pass 1: ' + (de.pass_one_exclusions || []).join(', ') : ''}`);
  return lines.join('\n') + '\n';
}

export function renderPrompt({ roleText, brief, briefHash, featureSpecExcerpt, featurePlanExcerpt }) {
  const prompt = roleText.replace(/\s+$/, '') + '\n\n' + renderTaskBlock(brief, { briefHash, featureSpecExcerpt, featurePlanExcerpt });
  return { prompt, prompt_hash: hashBytes(Buffer.from(prompt, 'utf8')) };
}

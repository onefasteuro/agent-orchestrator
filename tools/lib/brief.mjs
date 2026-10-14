// Brief envelope schema and preflight validation (K-1, K-2, K-3, K-4; appendix A).
// Pure checks live in validateShape(); checks that touch Git and the filesystem
// live in validateAgainstRepo(). validateBrief() runs both.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { briefHash, hashBytes, SERIALIZATION_VERSION } from './canonical.mjs';
import { SHA_RE, resolveCommit, isAncestor, pathExistsAtRevision, readAtRevision, isSymlinkAtRevision } from './git.mjs';
import { DEFAULT_PROTECTED, normalizeRepoPath, isProtected, escapesViaSymlink, parentOf } from './paths.mjs';

export const SCHEMA_VERSION = '1';
export const ROLES = ['researcher', 'implementer', 'advisor', 'reviewer', 'debugger'];
export const MODES = ['M-1', 'M-2'];
export const RUNTIMES = ['claude', 'codex', 'pi'];
export const SECTIONS = ['identity', 'objective', 'context', 'workspace', 'execution', 'validation', 'delivery'];
export const DEFAULT_LIMITS = { session_minutes: 90, attempts: 3, max_files: 5, max_lines: 300 };
export const AC_RE = /^AC-[A-Za-z0-9]+(\.[0-9]+)?$/;

const WRITING_ROLES = new Set(['implementer']);

function err(errors, field, message) {
  errors.push({ field, message });
}

function req(errors, obj, field, type, path) {
  const v = obj?.[field];
  const full = path ? `${path}.${field}` : field;
  if (v === undefined || v === null) return err(errors, full, 'missing'), false;
  if (type === 'array' ? !Array.isArray(v) : typeof v !== type) return err(errors, full, `expected ${type}`), false;
  if (type === 'string' && v.trim() === '') return err(errors, full, 'empty'), false;
  return true;
}

export function validateShape(brief) {
  const errors = [];
  if (!brief || typeof brief !== 'object') return [{ field: '', message: 'brief is not an object' }];
  if (brief.schema_version !== SCHEMA_VERSION) err(errors, 'schema_version', `expected "${SCHEMA_VERSION}"`);
  for (const s of SECTIONS) if (!brief[s] || typeof brief[s] !== 'object') err(errors, s, 'section missing');
  if (errors.length) return errors;

  const { identity: id, objective: ob, context: cx, workspace: ws, execution: ex, validation: va, delivery: de } = brief;

  req(errors, id, 'brief_id', 'string', 'identity');
  if (!ROLES.includes(id.role)) err(errors, 'identity.role', `expected one of ${ROLES.join(', ')}`);
  if (!MODES.includes(id.mode)) err(errors, 'identity.mode', `expected one of ${MODES.join(', ')}`);
  if (id.orca && (id.orca.task_id || id.orca.dispatch_id)) err(errors, 'identity.orca', 'Orca identities come from receipts and are bound outside the immutable envelope');

  req(errors, ob, 'outcome', 'string', 'objective');
  req(errors, ob, 'ac_ids', 'array', 'objective');
  req(errors, ob, 'expected_result', 'string', 'objective');
  if (Array.isArray(ob.ac_ids)) for (const a of ob.ac_ids) if (!AC_RE.test(String(a))) err(errors, 'objective.ac_ids', `malformed AC id "${a}"`);
  const role = id.role;
  if (Array.isArray(ob.ac_ids) && ob.ac_ids.length === 0) {
    if (role === 'researcher' && typeof ob.provisional_question_id === 'string' && ob.provisional_question_id) {
      /* allowed for pre-approval research (K-3) */
    } else err(errors, 'objective.ac_ids', 'must be nonempty (researcher may use provisional_question_id instead)');
  }

  for (const doc of ['feature_spec', 'feature_plan']) {
    const d = cx[doc];
    if (!d || typeof d !== 'object') { err(errors, `context.${doc}`, 'missing'); continue; }
    req(errors, d, 'path', 'string', `context.${doc}`);
    if (!['draft', 'approved'].includes(d.baseline)) err(errors, `context.${doc}.baseline`, 'expected draft or approved');
    req(errors, d, 'revision', 'string', `context.${doc}`);
    if (!/^[0-9a-f]{64}$/.test(String(d.sha256 || ''))) err(errors, `context.${doc}.sha256`, 'expected 64 hex chars');
    if (role === 'implementer' && d.baseline !== 'approved') err(errors, `context.${doc}.baseline`, 'implementation requires an approved baseline (K-3)');
    if (d.baseline === 'approved' && !SHA_RE.test(String(d.revision))) err(errors, `context.${doc}.revision`, 'approved baseline must be a committed 40-hex revision');
  }
  if (!/^[0-9a-f]{64}$/.test(String(cx.role_pack_hash || ''))) err(errors, 'context.role_pack_hash', 'expected 64 hex chars');

  req(errors, ws, 'repository', 'string', 'workspace');
  req(errors, ws, 'integration_checkout', 'string', 'workspace');
  req(errors, ws, 'worker_checkout', 'string', 'workspace');
  if (!SHA_RE.test(String(ws.base_sha || ''))) err(errors, 'workspace.base_sha', 'expected 40-hex commit');
  if (role === 'reviewer' && !SHA_RE.test(String(ws.candidate_sha || ''))) err(errors, 'workspace.candidate_sha', 'reviewer requires a committed candidate SHA');
  if (role === 'implementer' && ws.candidate_sha) err(errors, 'workspace.candidate_sha', 'implementer has no candidate yet');
  if (['advisor', 'debugger'].includes(role) && ws.candidate_sha && ws.dirty_state) err(errors, 'workspace', 'give either a candidate SHA or a dirty-state description, not both');
  for (const k of ['assigned_paths', 'new_paths', 'protected_paths']) if (ws[k] !== undefined && !Array.isArray(ws[k])) err(errors, `workspace.${k}`, 'expected array');
  if (WRITING_ROLES.has(role) && !(Array.isArray(ws.assigned_paths) && ws.assigned_paths.length + (ws.new_paths?.length || 0) > 0)) err(errors, 'workspace.assigned_paths', 'writer needs at least one assigned or declared new path');
  if (!WRITING_ROLES.has(role) && ((ws.assigned_paths?.length || 0) + (ws.new_paths?.length || 0)) > 0 && role !== 'reviewer') {
    /* read-only roles may list paths to read; not an error */
  }
  const protectedRules = [...DEFAULT_PROTECTED, ...(ws.protected_paths || []), cx.feature_spec?.path, cx.feature_plan?.path].filter(Boolean);
  for (const k of ['assigned_paths', 'new_paths']) {
    for (const p of ws[k] || []) {
      const n = normalizeRepoPath(p);
      if (!n.ok) { err(errors, `workspace.${k}`, `"${p}": ${n.reason}`); continue; }
      if (WRITING_ROLES.has(role) && isProtected(n.path, protectedRules)) err(errors, `workspace.${k}`, `"${p}" is protected and cannot be implementer-owned`);
    }
  }

  if (!RUNTIMES.includes(ex.runtime)) err(errors, 'execution.runtime', `expected one of ${RUNTIMES.join(', ')}`);
  req(errors, ex, 'model', 'string', 'execution');
  req(errors, ex, 'effort', 'string', 'execution');
  req(errors, ex, 'permission_recipe', 'string', 'execution');
  if (!ex.readiness || typeof ex.readiness.setup_complete !== 'boolean') err(errors, 'execution.readiness.setup_complete', 'expected boolean');
  if (!ex.limits || typeof ex.limits !== 'object') err(errors, 'execution.limits', 'missing');
  else for (const k of Object.keys(DEFAULT_LIMITS)) if (typeof ex.limits[k] !== 'number' || ex.limits[k] <= 0) err(errors, `execution.limits.${k}`, 'expected positive number');
  if (role === 'researcher' && !(Array.isArray(ex.retrieval) && ex.retrieval.length)) err(errors, 'execution.retrieval', 'researcher must name its required retrieval methods');

  if (!Array.isArray(va.checks)) err(errors, 'validation.checks', 'expected array');
  else if (WRITING_ROLES.has(role) && va.checks.length === 0) err(errors, 'validation.checks', 'implementer needs at least one named check');
  else for (const c of va.checks) if (!c || !c.name || !c.command || !c.expected) err(errors, 'validation.checks', 'each check needs name, command, expected');
  if (WRITING_ROLES.has(role)) {
    if (!va.estimate || typeof va.estimate.files !== 'number' || typeof va.estimate.lines !== 'number') err(errors, 'validation.estimate', 'implementer needs files and lines estimate');
    else if (ex.limits) {
      const over = va.estimate.files > ex.limits.max_files || va.estimate.lines > ex.limits.max_lines;
      if (over && !(ob.size_exception && typeof ob.size_exception.ref === 'string')) err(errors, 'validation.estimate', `exceeds limits (${ex.limits.max_files} files, ${ex.limits.max_lines} lines) and no objective.size_exception.ref is named (K-4)`);
    }
  }
  if (va.fixture_only !== true) err(errors, 'validation.fixture_only', 'must be true (K-16)');
  for (const k of ['generated_paths', 'scratch_paths']) if (va[k] !== undefined && !Array.isArray(va[k])) err(errors, `validation.${k}`, 'expected array');

  for (const k of ['result_fields', 'reply_route', 'usage_source', 'escalation_rule', 'recovery_ref', 'audit_ref']) {
    if (k === 'result_fields') { if (!Array.isArray(de[k]) || !de[k].length) err(errors, 'delivery.result_fields', 'expected nonempty array'); }
    else req(errors, de, k, 'string', 'delivery');
  }
  if (role === 'reviewer' && de.pass !== 1 && de.pass !== 2) err(errors, 'delivery.pass', 'reviewer brief must say pass 1 or pass 2 (K-9)');
  if (role === 'reviewer' && de.pass === 1 && !(Array.isArray(de.pass_one_exclusions) && de.pass_one_exclusions.length)) err(errors, 'delivery.pass_one_exclusions', 'pass 1 must list withheld material (L-4)');
  return errors;
}

// Repository-backed checks. opts.snapshotRoot resolves draft snapshot revisions.
export function validateAgainstRepo(brief, opts = {}) {
  const errors = [];
  const ws = brief.workspace, cx = brief.context, role = brief.identity.role;
  const repo = ws.worker_checkout;
  if (!existsSync(repo)) return [{ field: 'workspace.worker_checkout', message: 'checkout does not exist' }];

  const base = resolveCommit(repo, ws.base_sha);
  if (!base) err(errors, 'workspace.base_sha', 'does not resolve in the worker checkout');
  if (ws.candidate_sha) {
    const cand = resolveCommit(repo, ws.candidate_sha);
    if (!cand) err(errors, 'workspace.candidate_sha', 'does not resolve in the worker checkout');
    else if (base && !isAncestor(repo, base, cand)) err(errors, 'workspace.candidate_sha', 'is not a descendant of base_sha');
  }

  for (const doc of ['feature_spec', 'feature_plan']) {
    const d = cx[doc];
    if (!d) continue;
    let bytes = null;
    if (d.baseline === 'approved') {
      if (!resolveCommit(repo, d.revision)) { err(errors, `context.${doc}.revision`, 'approved revision does not resolve'); continue; }
      bytes = readAtRevision(repo, d.revision, d.path);
      if (!bytes) { err(errors, `context.${doc}.path`, `not present at revision ${d.revision.slice(0, 8)}`); continue; }
    } else {
      const snapRoot = opts.snapshotRoot || resolve(ws.integration_checkout, '.agents/orca-sdd/runs');
      const file = resolve(snapRoot, d.revision);
      if (!existsSync(file)) { err(errors, `context.${doc}.revision`, `draft snapshot not found under ${snapRoot}`); continue; }
      bytes = readFileSync(file);
    }
    const h = hashBytes(bytes);
    if (h !== d.sha256) err(errors, `context.${doc}.sha256`, `content hash mismatch (actual ${h.slice(0, 12)})`);
    if (doc === 'feature_spec' && bytes) {
      const text = bytes.toString('utf8');
      for (const ac of brief.objective.ac_ids || []) {
        const re = new RegExp(`(^|[^A-Za-z0-9-])${ac.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9]|$)`, 'm');
        if (!re.test(text)) err(errors, 'objective.ac_ids', `${ac} not found in the pinned feature spec`);
      }
    }
  }

  const protectedRules = [...DEFAULT_PROTECTED, ...(ws.protected_paths || []), cx.feature_spec?.path, cx.feature_plan?.path].filter(Boolean);
  const declaredNew = new Set((ws.new_paths || []).map((p) => normalizeRepoPath(p).path).filter(Boolean));
  if (base) {
    for (const p of ws.assigned_paths || []) {
      const n = normalizeRepoPath(p);
      if (!n.ok) continue;
      const rel = n.path.replace(/\/$/, '');
      if (!pathExistsAtRevision(repo, base, rel)) err(errors, 'workspace.assigned_paths', `"${p}" does not exist at base; declare it under new_paths if it is to be created`);
      if (isSymlinkAtRevision(repo, base, rel)) err(errors, 'workspace.assigned_paths', `"${p}" is a symlink at base`);
      if (escapesViaSymlink(repo, rel)) err(errors, 'workspace.assigned_paths', `"${p}" resolves outside the checkout through a symlink`);
    }
    for (const p of ws.new_paths || []) {
      const n = normalizeRepoPath(p);
      if (!n.ok) continue;
      const rel = n.path.replace(/\/$/, '');
      if (pathExistsAtRevision(repo, base, rel)) err(errors, 'workspace.new_paths', `"${p}" already exists at base; list it under assigned_paths`);
      let parent = parentOf(rel);
      let ok = parent === '' || pathExistsAtRevision(repo, base, parent) || declaredNew.has(parent) || declaredNew.has(parent + '/');
      if (!ok) err(errors, 'workspace.new_paths', `"${p}" has no existing or declared parent directory`);
      if (escapesViaSymlink(repo, parent || '.')) err(errors, 'workspace.new_paths', `"${p}" parent resolves outside the checkout through a symlink`);
      if (role === 'implementer' && isProtected(rel, protectedRules)) err(errors, 'workspace.new_paths', `"${p}" is protected`);
    }
  }
  if (brief.execution.readiness?.setup_complete !== true) err(errors, 'execution.readiness.setup_complete', 'setup is not complete; dependent work is withheld (W-2)');
  return errors;
}

export function validateBrief(brief, opts = {}) {
  const shape = validateShape(brief);
  if (shape.length) return { ok: false, errors: shape, stage: 'shape' };
  const repoErrors = opts.skipRepo ? [] : validateAgainstRepo(brief, opts);
  const identities = {
    brief_id: brief.identity.brief_id,
    brief_hash: briefHash(brief),
    serialization: SERIALIZATION_VERSION,
    role: brief.identity.role,
    base_sha: brief.workspace.base_sha,
    candidate_sha: brief.workspace.candidate_sha || null,
    feature_spec: { revision: brief.context.feature_spec.revision, sha256: brief.context.feature_spec.sha256 },
    feature_plan: { revision: brief.context.feature_plan.revision, sha256: brief.context.feature_plan.sha256 },
    role_pack_hash: brief.context.role_pack_hash,
  };
  return { ok: repoErrors.length === 0, errors: repoErrors, stage: repoErrors.length ? 'repo' : 'passed', identities };
}

export function loadBrief(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

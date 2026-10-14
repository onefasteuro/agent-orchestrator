// Mechanical ownership gate and candidate receipt (K-6, K-7; appendix B).
// Compares the complete base-to-candidate change set, or the working tree when
// no candidate exists yet, against the brief's immutable allowlist. Detection
// only: it never modifies the checkout.

import { readFileSync } from 'node:fs';
import { briefHash, hashBytes, hashObject } from './canonical.mjs';
import { diffNameStatus, diffRaw, numstat, workingState, readAtRevision, resolveCommit, git, assertWorktreeOf } from './git.mjs';
import { DEFAULT_PROTECTED, normalizeRepoPath, isProtected, isAllowed } from './paths.mjs';

function norm(list) {
  return (list || []).map((p) => normalizeRepoPath(p)).filter((n) => n.ok).map((n) => n.path);
}

export function allowlistFromBrief(brief) {
  const ws = brief.workspace, va = brief.validation, cx = brief.context;
  return {
    assigned: norm(ws.assigned_paths),
    created: norm(ws.new_paths),
    generated: norm(va.generated_paths),
    scratch: norm(va.scratch_paths),
    protectedRules: [...DEFAULT_PROTECTED, ...norm(ws.protected_paths), cx.feature_spec?.path, cx.feature_plan?.path].filter(Boolean),
  };
}

function classify(path, kind, allow) {
  if (isProtected(path, allow.protectedRules)) return { cls: 'protected', ok: false };
  if (isAllowed(path, allow.scratch)) return { cls: 'scratch', ok: true };
  if (isAllowed(path, allow.generated)) return { cls: 'generated', ok: true };
  if (kind === 'A' && isAllowed(path, allow.created)) return { cls: 'created', ok: true };
  if (kind !== 'A' && isAllowed(path, allow.assigned)) return { cls: 'assigned', ok: true };
  if (kind === 'A' && isAllowed(path, allow.assigned)) return { cls: 'assigned', ok: true }; // allowed dir rule
  if (kind !== 'A' && isAllowed(path, allow.created)) return { cls: 'created', ok: true };
  return { cls: 'undeclared', ok: false };
}

// Inspect base..candidate (committed) or base..working tree (handoff).
export function runGate({ repo, brief, baseSha, candidateSha = null, ignoredBaseline = [] }) {
  const allow = allowlistFromBrief(brief);
  const violations = [];
  const changed = [];
  const identity = assertWorktreeOf(repo, brief.workspace.repository || repo);
  if (!identity.ok) return { ok: false, violations: [{ path: null, reason: `checkout identity: ${identity.reason}` }], receipt: null };
  const base = resolveCommit(repo, baseSha);
  if (!base) return { ok: false, violations: [{ path: null, reason: `base ${baseSha} does not resolve` }], receipt: null };
  let cand = null;
  if (candidateSha) {
    cand = resolveCommit(repo, candidateSha);
    if (!cand) return { ok: false, violations: [{ path: null, reason: `candidate ${candidateSha} does not resolve` }], receipt: null };
  }
  const target = cand || null; // null means working tree

  const diffArgs = target ? [base, target] : [base];
  const nameStatus = target ? diffNameStatus(repo, base, target) : diffNameStatusWorkingTree(repo, base);
  const raw = target ? diffRaw(repo, base, target) : [];
  const stats = target ? numstat(repo, base, target) : numstatWorkingTree(repo, base);
  const modes = new Map(raw.map((r) => [r.path, r]));

  for (const e of nameStatus) {
    const entry = { status: e.status, path: e.path, oldPath: e.oldPath, classes: [] };
    const sides = e.oldPath ? [[e.oldPath, 'D'], [e.path, 'A']] : [[e.path, e.status]];
    for (const [p, kind] of sides) {
      const c = classify(p, kind, allow);
      entry.classes.push({ path: p, ...c });
      if (!c.ok) violations.push({ path: p, reason: c.cls === 'protected' ? 'protected path changed' : 'undeclared path changed', status: e.status });
    }
    const m = modes.get(e.path);
    if (m) {
      entry.oldMode = m.oldMode; entry.newMode = m.newMode;
      if (m.newMode === '160000' || m.oldMode === '160000') violations.push({ path: e.path, reason: 'submodule entry changed' });
      if (m.newMode === '120000') violations.push({ path: e.path, reason: 'symlink introduced' });
      if (m.oldMode !== '000000' && m.newMode !== '000000' && m.oldMode !== m.newMode) entry.modeChanged = true;
    }
    changed.push(entry);
  }

  // Working tree cleanliness. For a committed candidate the tree must still be
  // inspected: leftover changes make the checkout unready for review (W-3).
  const state = workingState(repo);
  const unexpectedIgnored = state.ignored.filter((p) => !ignoredBaseline.includes(p) && !isAllowed(p, allow.scratch) && !isAllowed(p, allow.generated));
  if (target) {
    for (const p of [...state.staged, ...state.unstaged, ...state.untracked]) {
      const c = classify(p, 'M', allow);
      if (!c.ok) violations.push({ path: p, reason: 'uncommitted change outside the allowlist after candidate commit' });
    }
  } else {
    for (const p of state.untracked) {
      const c = classify(p, 'A', allow);
      if (!c.ok) violations.push({ path: p, reason: c.cls === 'protected' ? 'protected path created' : 'undeclared file created', status: '??' });
      changed.push({ status: '??', path: p, classes: [{ path: p, ...c }] });
    }
  }
  for (const p of unexpectedIgnored) violations.push({ path: p, reason: 'unexpected ignored artifact not in setup baseline' });

  // Size against limits, excluding disclosed generated and scratch paths.
  for (const s of stats) if (s.binary && !isAllowed(s.path, allow.generated) && !isAllowed(s.path, allow.scratch)) violations.push({ path: s.path, reason: 'binary or diff-suppressed change; line count unavailable, declare it as generated or remove it' });
  const sized = stats.filter((s) => !isAllowed(s.path, allow.generated) && !isAllowed(s.path, allow.scratch));
  const size = {
    files: new Set(sized.map((s) => s.path)).size,
    lines: sized.reduce((n, s) => n + s.added + s.deleted, 0),
    generated_files: stats.length - sized.length,
    limits: { max_files: brief.execution.limits.max_files, max_lines: brief.execution.limits.max_lines },
  };
  size.within = size.files <= size.limits.max_files && size.lines <= size.limits.max_lines;
  if (!size.within && !brief.objective.size_exception) violations.push({ path: null, reason: `size ${size.files} files / ${size.lines} lines exceeds limits and no exception is named (K-4)` });

  // Protected document hashes must still match the pinned identities.
  const protectedHashes = {};
  for (const doc of ['feature_spec', 'feature_plan']) {
    const d = brief.context[doc];
    if (!d) continue;
    const bytes = target ? readAtRevision(repo, target, d.path) : readWorkingFile(repo, d.path);
    if (bytes) {
      const h = hashBytes(bytes);
      protectedHashes[doc] = { path: d.path, expected: d.sha256, actual: h, match: h === d.sha256 };
      if (h !== d.sha256 && d.baseline === 'approved') violations.push({ path: d.path, reason: `${doc} content differs from the pinned hash` });
    } else protectedHashes[doc] = { path: d.path, expected: d.sha256, actual: null, match: null };
  }

  const receipt = {
    base_sha: base,
    candidate_sha: cand,
    inspected: cand ? 'candidate' : 'working_tree',
    feature_spec: brief.context.feature_spec && { revision: brief.context.feature_spec.revision, sha256: brief.context.feature_spec.sha256 },
    feature_plan: brief.context.feature_plan && { revision: brief.context.feature_plan.revision, sha256: brief.context.feature_plan.sha256 },
    brief_hash: briefHash(brief),
    allowed_path_digest: hashObject({ assigned: allow.assigned, created: allow.created, generated: allow.generated, scratch: allow.scratch }),
    changed_paths: changed,
    cleanliness: { staged: state.staged, unstaged: state.unstaged, untracked: state.untracked, ignored_unexpected: unexpectedIgnored, clean: target ? state.staged.length + state.unstaged.length + state.untracked.length === 0 : null },
    size,
    protected_hashes: protectedHashes,
  };
  return { ok: violations.length === 0, violations, receipt };
}

function diffNameStatusWorkingTree(repo, base) {
  const out = git(repo, ['diff', '--name-status', '-z', '-M', '--no-color', '--no-ext-diff', '--no-textconv', base]);
  const parts = out.split('\0').filter((p, i, a) => !(i === a.length - 1 && p === ''));
  const entries = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    const status = code[0];
    if (status === 'R' || status === 'C') entries.push({ status, oldPath: parts[i++], path: parts[i++] });
    else entries.push({ status, oldPath: null, path: parts[i++] });
  }
  return entries;
}

function numstatWorkingTree(repo, base) {
  const out = git(repo, ['diff', '--numstat', '-z', '-M', '--no-ext-diff', '--no-textconv', base]);
  const lines = out.split('\0').filter(Boolean);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d+|-)\t(\d+|-)\t(.*)$/s);
    if (!m) continue;
    let path = m[3];
    if (path === '') path = lines[++i] + ' -> ' + lines[++i];
    result.push({ added: m[1] === '-' ? 0 : Number(m[1]), deleted: m[2] === '-' ? 0 : Number(m[2]), path, binary: m[1] === '-' });
  }
  return result;
}

function readWorkingFile(repo, path) {
  try {
    return readFileSync(`${repo}/${path}`);
  } catch {
    return null;
  }
}

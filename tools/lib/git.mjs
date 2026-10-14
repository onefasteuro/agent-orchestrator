// Thin git helpers. Every call is explicit about the repository it touches.

import { execFileSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve as resolvePath } from 'node:path';

// Hardening: a worker with shell access can edit the shared .git/config of a
// worktree or add in-tree attributes that change what diff reports. Ignore
// system and global config entirely, and override the repo-local keys that
// influence diff output, hooks and path quoting. Diff commands additionally pass
// --no-ext-diff and --no-textconv.
export const HARDENED_CONFIG = [
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'diff.external=',
  '-c', 'diff.noprefix=false',
  '-c', 'diff.renames=true',
  '-c', 'core.quotePath=false',
  '-c', 'core.attributesFile=/dev/null',
  '-c', 'core.excludesFile=/dev/null',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.sshCommand=/bin/false',
  '-c', 'protocol.allow=never',
];
export const HARDENED_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_EXTERNAL_DIFF: '', GIT_PAGER: 'cat', PAGER: 'cat' };

export function git(repo, args, opts = {}) {
  return execFileSync('git', ['-C', repo, ...HARDENED_CONFIG, ...args], {
    encoding: opts.binary ? 'buffer' : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    env: HARDENED_ENV,
  });
}

// In-tree .gitattributes can assign clean filters and diff drivers that run
// during a working-tree diff; .git/info/attributes and .git/config are shared by
// every worktree and reachable by an unsandboxed worker. The gate fails closed
// when any of them differs from base or from a recorded baseline.
export function metadataDrift(repo, base, baseline = {}) {
  const problems = [];
  const tracked = tryGit(repo, ['ls-tree', '-r', '--name-only', base]);
  const attrAtBase = new Set((tracked.ok ? tracked.out.split('\n') : []).filter((p) => p === '.gitattributes' || p.endsWith('/.gitattributes')));
  const onDisk = tryGit(repo, ['ls-files', '-z', '--others', '--cached', '--', '.gitattributes', '**/.gitattributes', '*/.gitattributes']);
  const names = new Set([...attrAtBase, ...(onDisk.ok ? onDisk.out.split('\0').filter(Boolean) : [])]);
  for (const name of names) {
    const atBase = readAtRevision(repo, base, name);
    let onTree = null;
    try { onTree = readFileSync(resolvePath(repo, name)); } catch { onTree = null; }
    const same = (atBase === null && onTree === null) || (atBase !== null && onTree !== null && Buffer.compare(atBase, onTree) === 0);
    if (!same) problems.push({ path: name, reason: 'attributes file differs from base; diff output cannot be trusted' });
  }
  const common = tryGit(repo, ['rev-parse', '--git-common-dir']);
  if (common.ok) {
    const dir = resolvePath(repo, common.out.trim());
    for (const [file, key] of [['info/attributes', 'info_attributes_sha256'], ['config', 'config_sha256']]) {
      let bytes = null;
      try { bytes = readFileSync(resolvePath(dir, file)); } catch { bytes = null; }
      const actual = bytes ? createHash('sha256').update(bytes).digest('hex') : null;
      if (baseline[key] !== undefined && baseline[key] !== actual) problems.push({ path: `.git/${file}`, reason: `differs from the recorded baseline (expected ${String(baseline[key]).slice(0, 12)}, actual ${String(actual).slice(0, 12)})` });
      if (file === 'info/attributes' && baseline[key] === undefined && actual !== null) problems.push({ path: '.git/info/attributes', reason: 'present but no baseline recorded; record one at setup or remove it' });
    }
  }
  return problems;
}

// The checkout must be a worktree of the repository named in the brief, not an
// arbitrary directory whose .git file points elsewhere.
export function assertWorktreeOf(checkout, repository) {
  const a = tryGit(checkout, ['rev-parse', '--git-common-dir']);
  const b = tryGit(repository, ['rev-parse', '--git-common-dir']);
  if (!a.ok || !b.ok) return { ok: false, reason: 'not a git checkout' };
  const ca = realpathSync(resolvePath(checkout, a.out.trim()));
  const cb = realpathSync(resolvePath(repository, b.out.trim()));
  return ca === cb ? { ok: true } : { ok: false, reason: `checkout belongs to ${ca}, not ${cb}` };
}

export function tryGit(repo, args, opts) {
  try {
    return { ok: true, out: git(repo, args, opts) };
  } catch (err) {
    return { ok: false, err: String(err.stderr || err.message).trim() };
  }
}

export const SHA_RE = /^[0-9a-f]{40}$/;

export function resolveCommit(repo, ref) {
  if (typeof ref !== 'string' || ref.startsWith('-') || /\s/.test(ref)) return null;
  const r = tryGit(repo, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
  return r.ok ? r.out.trim() : null;
}

export function isAncestor(repo, ancestor, descendant) {
  if (!SHA_RE.test(ancestor) || !SHA_RE.test(descendant)) return false;
  const r = tryGit(repo, ['merge-base', '--is-ancestor', '--end-of-options', ancestor, descendant]);
  return r.ok;
}

export function pathExistsAtRevision(repo, revision, path) {
  if (!SHA_RE.test(revision) || path.startsWith('-')) return false;
  const r = tryGit(repo, ['cat-file', '-e', '--end-of-options', `${revision}:${path}`]);
  return r.ok;
}

export function readAtRevision(repo, revision, path) {
  if (!SHA_RE.test(revision) || path.startsWith('-')) return null;
  const r = tryGit(repo, ['show', '--no-color', '--end-of-options', `${revision}:${path}`], { binary: true });
  return r.ok ? r.out : null;
}

// Name-status with rename detection, NUL separated so paths with spaces survive.
// Returns [{status, score, oldPath, path}].
export function diffNameStatus(repo, base, candidate) {
  const out = git(repo, ['diff', '--name-status', '-z', '-M', '--no-color', '--no-ext-diff', '--no-textconv', '--end-of-options', base, candidate, '--']);
  const parts = out.split('\0').filter((p, i, a) => !(i === a.length - 1 && p === ''));
  const entries = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i++];
    const status = code[0];
    const score = code.length > 1 ? Number(code.slice(1)) : null;
    if (status === 'R' || status === 'C') {
      entries.push({ status, score, oldPath: parts[i++], path: parts[i++] });
    } else {
      entries.push({ status, score, oldPath: null, path: parts[i++] });
    }
  }
  return entries;
}

// Raw diff exposes mode changes and submodule entries (mode 160000).
export function diffRaw(repo, base, candidate) {
  const out = git(repo, ['diff', '--raw', '-z', '--no-color', '--no-renames', '--no-ext-diff', '--no-textconv', '--end-of-options', base, candidate, '--']);
  const parts = out.split('\0').filter((p, i, a) => !(i === a.length - 1 && p === ''));
  const entries = [];
  for (let i = 0; i < parts.length; ) {
    const meta = parts[i++];
    const path = parts[i++];
    const m = meta.match(/^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])/);
    if (m) entries.push({ oldMode: m[1], newMode: m[2], status: m[5], path });
  }
  return entries;
}

export function numstat(repo, base, candidate) {
  const out = git(repo, ['diff', '--numstat', '-z', '-M', '--no-ext-diff', '--no-textconv', '--end-of-options', base, candidate, '--']);
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

// Working tree state: staged, unstaged, untracked (all files), ignored (matching).
export function workingState(repo) {
  const out = git(repo, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching']);
  const parts = out.split('\0').filter((p, i, a) => !(i === a.length - 1 && p === ''));
  const state = { staged: [], unstaged: [], untracked: [], ignored: [] };
  for (let i = 0; i < parts.length; i++) {
    const xy = parts[i].slice(0, 2);
    const path = parts[i].slice(3);
    if (xy === '!!') state.ignored.push(path);
    else if (xy === '??') state.untracked.push(path);
    else {
      if (xy[0] !== ' ' && xy[0] !== '?') state.staged.push(path);
      if (xy[1] !== ' ') state.unstaged.push(path);
      if (xy[0] === 'R' || xy[0] === 'C') i++; // skip the rename source entry
    }
  }
  return state;
}

export function isSymlinkAtRevision(repo, revision, path) {
  if (!SHA_RE.test(revision)) return false;
  const r = tryGit(repo, ['ls-tree', '-z', '--end-of-options', revision, '--', path]);
  if (!r.ok || !r.out) return false;
  return r.out.startsWith('120000');
}

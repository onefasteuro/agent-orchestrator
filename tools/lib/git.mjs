// Thin git helpers. Every call is explicit about the repository it touches.

import { execFileSync } from 'node:child_process';

export function git(repo, args, opts = {}) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: opts.binary ? 'buffer' : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
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
  const r = tryGit(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.ok ? r.out.trim() : null;
}

export function isAncestor(repo, ancestor, descendant) {
  const r = tryGit(repo, ['merge-base', '--is-ancestor', ancestor, descendant]);
  return r.ok;
}

export function pathExistsAtRevision(repo, revision, path) {
  const r = tryGit(repo, ['cat-file', '-e', `${revision}:${path}`]);
  return r.ok;
}

export function readAtRevision(repo, revision, path) {
  const r = tryGit(repo, ['show', `${revision}:${path}`], { binary: true });
  return r.ok ? r.out : null;
}

// Name-status with rename detection, NUL separated so paths with spaces survive.
// Returns [{status, score, oldPath, path}].
export function diffNameStatus(repo, base, candidate) {
  const out = git(repo, ['diff', '--name-status', '-z', '-M', '--no-color', base, candidate]);
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
  const out = git(repo, ['diff', '--raw', '-z', '--no-color', '--no-renames', base, candidate]);
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
  const out = git(repo, ['diff', '--numstat', '-z', '-M', base, candidate]);
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
  const r = tryGit(repo, ['ls-tree', '-z', revision, '--', path]);
  if (!r.ok || !r.out) return false;
  return r.out.startsWith('120000');
}

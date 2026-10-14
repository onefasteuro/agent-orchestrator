// Path rules shared by the validator and the ownership gate (K-2, K-7).

import { posix } from 'node:path';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

// Never implementer-owned, whatever the brief says (K-7).
export const DEFAULT_PROTECTED = [
  '.agent-task.md',
  '.agents/orca-sdd/',
  '.claude/',
  '.codex/',
  '.githooks/',
  '.git/',
  '.gitmodules',
  '.gitattributes',
  '.gitignore',
  'AGENTS.md',
  'CLAUDE.md',
];

export function normalizeRepoPath(p) {
  if (typeof p !== 'string' || p.length === 0) return { ok: false, reason: 'empty path' };
  if (p.includes('\0')) return { ok: false, reason: 'NUL in path' };
  if (posix.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) return { ok: false, reason: 'absolute path' };
  if (p.startsWith('-')) return { ok: false, reason: 'path looks like a command option' };
  if (/[\u0000-\u001f]/.test(p)) return { ok: false, reason: 'control character in path' };
  const n = posix.normalize(p.replace(/\\/g, '/'));
  if (n === '.' || n.startsWith('../') || n === '..') return { ok: false, reason: 'path escapes the checkout' };
  if (n.split('/').includes('..')) return { ok: false, reason: 'path escapes the checkout' };
  return { ok: true, path: n.replace(/\/+$/, '') + (p.endsWith('/') ? '/' : '') };
}

// Exact file match or bounded directory prefix (trailing slash). No naive
// string-prefix matching: "src/math.mjs" is not matched by "src/ma".
export function matchesRule(path, rule) {
  if (rule.endsWith('/')) return path === rule.slice(0, -1) || path.startsWith(rule);
  return path === rule;
}

// Git control files are protected wherever they appear in the tree.
export const PROTECTED_BASENAMES = new Set(['.gitattributes', '.gitignore', '.gitmodules', '.git']);

// Case-insensitive and Unicode-normalized comparison: on a case-insensitive or
// normalization-insensitive filesystem (macOS default) "Agents.md" is AGENTS.md.
function fold(p) {
  return p.normalize('NFC').toLowerCase();
}

export function isProtected(path, protectedRules = DEFAULT_PROTECTED) {
  const f = fold(path);
  if (protectedRules.some((r) => matchesRule(f, fold(r)))) return true;
  const base = f.split('/').pop();
  return PROTECTED_BASENAMES.has(base);
}

export function isAllowed(path, allowRules) {
  return allowRules.some((r) => matchesRule(path, r));
}

// A path inside the checkout must not resolve, through symlinks, to a location
// outside it. Only checks what exists on disk.
export function escapesViaSymlink(checkoutDir, relPath) {
  const root = realpathSync(checkoutDir);
  const segments = relPath.split('/').filter(Boolean);
  let cur = root;
  for (const seg of segments) {
    cur = resolve(cur, seg);
    if (!existsSync(cur)) return false;
    let real;
    try {
      real = realpathSync(cur);
    } catch {
      return false;
    }
    if (real !== root && !real.startsWith(root + sep)) return true;
    try {
      if (lstatSync(cur).isSymbolicLink() && (real === root || !real.startsWith(root + sep))) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function parentOf(path) {
  const d = posix.dirname(path.replace(/\/$/, ''));
  return d === '.' ? '' : d;
}

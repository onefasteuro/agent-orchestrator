import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, renameSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, makeBrief, git } from './helpers.mjs';
import { runGate } from '../lib/gate.mjs';
import { runScenario } from '../lib/fake-worker.mjs';

function fresh(opts) {
  const { repo, base } = makeRepo(opts);
  return { repo, base, brief: makeBrief({ repo, base }) };
}

test('K-7: clean handoff within the allowlist passes and the receipt is Git-computed', () => {
  const { repo, base, brief } = fresh();
  runScenario('done-clean', { repo, brief, task_id: 't1', dispatch_id: 'd1' });
  const r = runGate({ repo, brief, baseSha: base });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.deepEqual(r.receipt.changed_paths.map((c) => c.path), ['src/math.mjs']);
  assert.equal(r.receipt.inspected, 'working_tree');
  assert.equal(r.receipt.size.files, 1);
});

test('K-7: undeclared file created by the worker rejects the candidate and is preserved', () => {
  const { repo, base, brief } = fresh();
  runScenario('done-out-of-allowlist', { repo, brief, task_id: 't1', dispatch_id: 'd1' });
  const r = runGate({ repo, brief, baseSha: base });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.path === 'notes.md' && /undeclared/.test(v.reason)));
  assert.ok(git(repo, ['status', '--porcelain']).includes('notes.md'), 'violating work preserved');
});

test('K-7: protected file change is rejected even though it is in the diff', () => {
  const { repo, base, brief } = fresh();
  runScenario('done-protected', { repo, brief, task_id: 't1', dispatch_id: 'd1' });
  const r = runGate({ repo, brief, baseSha: base });
  assert.ok(r.violations.some((v) => v.path === 'AGENTS.md' && /protected/.test(v.reason)));
});

test('K-7: both sides of a rename are checked', () => {
  const { repo, base, brief } = fresh();
  git(repo, ['mv', 'src/math.mjs', 'src/maths.mjs']);
  git(repo, ['commit', '-q', '-m', 'rename']);
  const cand = git(repo, ['rev-parse', 'HEAD']);
  const r = runGate({ repo, brief, baseSha: base, candidateSha: cand });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.path === 'src/maths.mjs'), 'rename destination undeclared');
});

test('K-7: symlink and submodule-like mode changes are flagged', () => {
  const { repo, base, brief } = fresh();
  symlinkSync('/etc/hosts', join(repo, 'src/link'));
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'symlink']);
  const cand = git(repo, ['rev-parse', 'HEAD']);
  const r = runGate({ repo, brief: makeBrief({ repo, base, overrides: { workspace: { new_paths: ['src/link'] } } }), baseSha: base, candidateSha: cand });
  assert.ok(r.violations.some((v) => /symlink introduced/.test(v.reason)), JSON.stringify(r.violations));
});

test('K-6: post-commit revalidation catches a hook-added file; generated declaration makes it pass', () => {
  const { repo, base, brief } = fresh({ withHook: true });
  runScenario('done-clean', { repo, brief, task_id: 't1', dispatch_id: 'd1' });
  const pre = runGate({ repo, brief, baseSha: base });
  assert.equal(pre.ok, true, 'pre-commit view is clean');
  git(repo, ['add', 'src/math.mjs']);
  git(repo, ['commit', '-q', '-m', 't1 brief:abc']);
  const cand = git(repo, ['rev-parse', 'HEAD']);
  const post = runGate({ repo, brief, baseSha: base, candidateSha: cand });
  assert.equal(post.ok, false, 'post-commit view must see the hook-added file');
  assert.ok(post.violations.some((v) => v.path === 'src/generated.mjs'));
  const declared = makeBrief({ repo, base, overrides: { validation: { generated_paths: ['src/generated.mjs'] } } });
  const ok = runGate({ repo, brief: declared, baseSha: base, candidateSha: cand });
  assert.equal(ok.ok, true, JSON.stringify(ok.violations));
  assert.equal(ok.receipt.size.generated_files, 1);
  assert.equal(ok.receipt.size.files, 1, 'generated files do not count toward size');
});

test('K-4: size over limits without an exception is a violation', () => {
  const { repo, base } = makeRepo();
  const brief = makeBrief({ repo, base, overrides: { execution: { limits: { max_lines: 2 } } } });
  writeFileSync(join(repo, 'src/math.mjs'), 'a\nb\nc\nd\ne\nf\n');
  const r = runGate({ repo, brief, baseSha: base });
  assert.ok(r.violations.some((v) => /exceeds limits/.test(v.reason)));
});

test('K-7: protected document hash drift is detected on the candidate', () => {
  const { repo, base, brief } = fresh();
  writeFileSync(join(repo, 'specs/feature-a/spec.md'), '# tampered\n');
  writeFileSync(join(repo, 'src/math.mjs'), 'export const x = 1;\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'tamper']);
  const cand = git(repo, ['rev-parse', 'HEAD']);
  const r = runGate({ repo, brief, baseSha: base, candidateSha: cand });
  assert.ok(r.violations.some((v) => /feature_spec content differs/.test(v.reason)));
  assert.equal(r.receipt.protected_hashes.feature_spec.match, false);
});

test('W-3: leftover uncommitted changes after the candidate commit are reported', () => {
  const { repo, base, brief } = fresh();
  runScenario('done-clean', { repo, brief, task_id: 't1', dispatch_id: 'd1' });
  git(repo, ['add', 'src/math.mjs']);
  git(repo, ['commit', '-q', '-m', 'cand']);
  const cand = git(repo, ['rev-parse', 'HEAD']);
  writeFileSync(join(repo, 'stray.txt'), 'x');
  const r = runGate({ repo, brief, baseSha: base, candidateSha: cand });
  assert.equal(r.receipt.cleanliness.clean, false);
  assert.ok(r.violations.some((v) => v.path === 'stray.txt'));
});

test('hardening: repo-local diff.external and in-tree attributes cannot alter the gate', () => {
  const { repo, base, brief } = fresh();
  git(repo, ['config', 'diff.external', '/bin/false']);
  git(repo, ['config', 'core.hooksPath', '/nonexistent']);
  writeFileSync(join(repo, 'src/math.mjs'), 'export const changed = true;\n');
  const r = runGate({ repo, brief, baseSha: base });
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  assert.deepEqual(r.receipt.changed_paths.map((c) => c.path), ['src/math.mjs']);
  writeFileSync(join(repo, '.gitattributes'), '*.mjs -diff\n');
  const r2 = runGate({ repo, brief, baseSha: base });
  assert.equal(r2.ok, false);
  assert.ok(r2.violations.some((v) => v.path === '.gitattributes' && /metadata:/.test(v.reason)), 'attribute drift fails the gate closed before any diff is trusted');
  rmSync(join(repo, '.gitattributes'));
  const r3 = runGate({ repo, brief, baseSha: base });
  assert.equal(r3.ok, true, 'gate recovers once the attributes file is restored: ' + JSON.stringify(r3.violations));
});

test('hardening: a checkout that is not a worktree of the named repository is refused', () => {
  const { repo, base, brief } = fresh();
  const other = makeRepo().repo;
  const r = runGate({ repo: other, brief, baseSha: base });
  assert.equal(r.ok, false);
  assert.ok(/checkout identity/.test(r.violations[0].reason));
});

test('hardening: in-tree .gitattributes drift or a changed shared config fails the gate closed', () => {
  const { repo, base, brief } = fresh();
  writeFileSync(join(repo, 'src/math.mjs'), 'export const changed = true;\n');
  mkdirSync(join(repo, 'src/sub'), { recursive: true });
  writeFileSync(join(repo, 'src/sub/.gitattributes'), '* filter=evil\n');
  const r = runGate({ repo, brief, baseSha: base });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => /metadata:/.test(v.reason) && v.path === 'src/sub/.gitattributes'), JSON.stringify(r.violations));
  rmSync(join(repo, 'src/sub'), { recursive: true });
  const okRun = runGate({ repo, brief, baseSha: base, metadataBaseline: { config_sha256: 'not-the-real-hash' } });
  assert.ok(okRun.violations.some((v) => v.path === '.git/config'), 'config baseline mismatch is a violation');
  const clean = runGate({ repo, brief, baseSha: base });
  assert.equal(clean.ok, true, JSON.stringify(clean.violations));
});

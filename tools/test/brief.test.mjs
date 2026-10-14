import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, makeBrief, git } from './helpers.mjs';
import { validateBrief, validateShape } from '../lib/brief.mjs';
import { briefHash } from '../lib/canonical.mjs';

const { repo, base } = makeRepo();

test('K-2: a complete implementer brief passes and yields a stable hash', () => {
  const brief = makeBrief({ repo, base });
  const r = validateBrief(brief);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.identities.brief_hash, briefHash(brief));
  assert.equal(validateBrief(makeBrief({ repo, base })).identities.brief_hash, r.identities.brief_hash, 'same content, same hash');
});

test('K-2: Orca identities in the envelope are rejected; receipt-only fields do not change the hash', () => {
  const brief = makeBrief({ repo, base });
  const h = briefHash(brief);
  brief.identity.orca = { task_id: 'task_x', dispatch_id: 'ctx_y' };
  assert.ok(validateShape(brief).some((e) => e.field === 'identity.orca'));
  assert.equal(briefHash(brief), h, 'orca block is excluded from the immutable hash');
});

test('K-2: missing sections and fields are named', () => {
  const brief = makeBrief({ repo, base });
  delete brief.delivery;
  const errs = validateShape(brief);
  assert.ok(errs.some((e) => e.field === 'delivery'));
});

test('K-2: base SHA must resolve, candidate must descend from base', () => {
  const bad = makeBrief({ repo, base, overrides: { workspace: { base_sha: 'f'.repeat(40) } } });
  assert.ok(validateBrief(bad).errors.some((e) => e.field === 'workspace.base_sha'));
  const rev = makeBrief({ repo, base, role: 'reviewer', overrides: { workspace: { candidate_sha: 'e'.repeat(40) }, delivery: { pass: 1, pass_one_exclusions: ['self-report'] } } });
  assert.ok(validateBrief(rev).errors.some((e) => e.field === 'workspace.candidate_sha'));
});

test('K-3: implementer needs approved baseline and nonempty ACs; researcher may use a provisional question', () => {
  const draft = makeBrief({ repo, base, overrides: { context: { feature_spec: { baseline: 'draft' } } } });
  assert.ok(validateShape(draft).some((e) => e.field === 'context.feature_spec.baseline'));
  const noAc = makeBrief({ repo, base, overrides: { objective: { ac_ids: [] } } });
  assert.ok(validateShape(noAc).some((e) => e.field === 'objective.ac_ids'));
  const research = makeBrief({ repo, base, role: 'researcher', overrides: { objective: { ac_ids: [], provisional_question_id: 'q-1' }, execution: { retrieval: ['context7'] }, workspace: { assigned_paths: [] } } });
  assert.equal(validateShape(research).length, 0, JSON.stringify(validateShape(research)));
});

test('K-2: AC IDs must resolve in the pinned feature spec and hashes must match', () => {
  const missing = makeBrief({ repo, base, overrides: { objective: { ac_ids: ['AC-9'] } } });
  assert.ok(validateBrief(missing).errors.some((e) => /AC-9 not found/.test(e.message)));
  const wrongHash = makeBrief({ repo, base, overrides: { context: { feature_plan: { sha256: '0'.repeat(64) } } } });
  assert.ok(validateBrief(wrongHash).errors.some((e) => e.field === 'context.feature_plan.sha256'));
});

test('K-2: path rules reject traversal, protected paths, missing files, undeclared parents', () => {
  const trav = makeBrief({ repo, base, overrides: { workspace: { assigned_paths: ['../outside.txt'] } } });
  assert.ok(validateShape(trav).some((e) => /escapes/.test(e.message)));
  const prot = makeBrief({ repo, base, overrides: { workspace: { assigned_paths: ['AGENTS.md'] } } });
  assert.ok(validateShape(prot).some((e) => /protected/.test(e.message)));
  const spec = makeBrief({ repo, base, overrides: { workspace: { assigned_paths: ['specs/feature-a/spec.md'] } } });
  assert.ok(validateShape(spec).some((e) => /protected/.test(e.message)), 'feature docs are protected');
  const ghost = makeBrief({ repo, base, overrides: { workspace: { assigned_paths: ['src/ghost.mjs'] } } });
  assert.ok(validateBrief(ghost).errors.some((e) => /does not exist at base/.test(e.message)));
  const orphan = makeBrief({ repo, base, overrides: { workspace: { new_paths: ['lib/new/thing.mjs'] } } });
  assert.ok(validateBrief(orphan).errors.some((e) => /no existing or declared parent/.test(e.message)));
  const declared = makeBrief({ repo, base, overrides: { workspace: { new_paths: ['lib/', 'lib/thing.mjs'] } } });
  assert.equal(validateBrief(declared).ok, true, JSON.stringify(validateBrief(declared).errors));
});

test('K-2: symlink escape is detected on disk', () => {
  const { repo: r2, base: b2 } = makeRepo();
  mkdirSync(join(r2, 'vendor'));
  symlinkSync('/tmp', join(r2, 'vendor/out'));
  git(r2, ['add', '-A']);
  git(r2, ['commit', '-q', '-m', 'add symlink']);
  const head = git(r2, ['rev-parse', 'HEAD']);
  const brief = makeBrief({ repo: r2, base: head, overrides: { workspace: { new_paths: ['vendor/out/evil.txt'] } } });
  const errs = validateBrief(brief).errors;
  assert.ok(errs.some((e) => /symlink/.test(e.message)), JSON.stringify(errs));
});

test('K-4: size over limits needs a named exception', () => {
  const big = makeBrief({ repo, base, overrides: { validation: { estimate: { files: 9, lines: 10 } } } });
  assert.ok(validateShape(big).some((e) => e.field === 'validation.estimate'));
  const excused = makeBrief({ repo, base, overrides: { validation: { estimate: { files: 9, lines: 10 } }, objective: { size_exception: { ref: 'plan task 1 exception' } } } });
  assert.equal(validateShape(excused).length, 0);
});

test('W-2: incomplete setup withholds the brief', () => {
  const brief = makeBrief({ repo, base, overrides: { execution: { readiness: { setup_complete: false } } } });
  assert.ok(validateBrief(brief).errors.some((e) => e.field === 'execution.readiness.setup_complete'));
});

test('K-9: reviewer pass 1 must list withheld material', () => {
  const r = makeBrief({ repo, base, role: 'reviewer', overrides: { workspace: { candidate_sha: base, assigned_paths: [] }, delivery: { pass: 1 } } });
  assert.ok(validateShape(r).some((e) => e.field === 'delivery.pass_one_exclusions'));
});

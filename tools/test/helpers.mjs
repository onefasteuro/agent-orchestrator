// Test fixtures: a throwaway git repository shaped like the spike fixture, an
// approved feature spec and plan committed in it, and a valid implementer brief.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hashBytes, hashObject } from '../lib/canonical.mjs';

export function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export function makeRepo({ withHook = false } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'sdd-fixture-'));
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  git(repo, ['config', 'user.email', 'test@local']);
  git(repo, ['config', 'user.name', 'test']);
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'test'), { recursive: true });
  mkdirSync(join(repo, 'specs/feature-a'), { recursive: true });
  writeFileSync(join(repo, 'src/math.mjs'), 'export function clamp(v, min, max) {\n  if (v < min) return min;\n  return v;\n}\n');
  writeFileSync(join(repo, 'test/math.test.mjs'), "import { test } from 'node:test';\n");
  writeFileSync(join(repo, 'AGENTS.md'), '# rules\n');
  writeFileSync(join(repo, 'package.json'), '{"name":"fixture","type":"module","scripts":{"test":"node --test test/"}}\n');
  writeFileSync(join(repo, '.gitignore'), '.agent-task.md\n.agents/orca-sdd/runs/\nnode_modules/\n');
  writeFileSync(join(repo, 'specs/feature-a/spec.md'), '# Feature A\n\n- AC-1 clamp returns max when value > max.\n- AC-2 clamp returns min when value < min.\n');
  writeFileSync(join(repo, 'specs/feature-a/plan.md'), '# Plan A\n\nTask 1: fix clamp in src/math.mjs.\n');
  if (withHook) {
    mkdirSync(join(repo, '.githooks'), { recursive: true });
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    writeFileSync(join(repo, 'scripts/gen.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('src/generated.mjs', 'export const t = 1;\\n');\n");
    writeFileSync(join(repo, '.githooks/pre-commit'), '#!/bin/sh\nnode scripts/gen.mjs && git add src/generated.mjs\n');
    chmodSync(join(repo, '.githooks/pre-commit'), 0o755);
    git(repo, ['config', 'core.hooksPath', '.githooks']);
  }
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'fixture base']);
  const base = git(repo, ['rev-parse', 'HEAD']);
  return { repo, base };
}

export function docIdentity(repo, rev, path) {
  const bytes = Buffer.from(execFileSync('git', ['-C', repo, 'show', `${rev}:${path}`]));
  return { path, baseline: 'approved', revision: rev, sha256: hashBytes(bytes) };
}

export function makeBrief({ repo, base, role = 'implementer', overrides = {} }) {
  const brief = {
    schema_version: '1',
    identity: { brief_id: 'brief_test_001', role, mode: 'M-2' },
    objective: { outcome: 'clamp applies the upper bound', ac_ids: ['AC-1'], exclusions: ['no throw on min > max'], expected_result: 'handoff with 3 passing tests' },
    context: {
      feature_spec: docIdentity(repo, base, 'specs/feature-a/spec.md'),
      feature_plan: docIdentity(repo, base, 'specs/feature-a/plan.md'),
      role_pack_hash: hashObject({ pack: 'test' }),
      instructions: ['AGENTS.md'], evidence: [], predecessor_conclusions: [],
    },
    workspace: { repository: repo, integration_checkout: repo, worker_checkout: repo, base_sha: base, assigned_paths: ['src/math.mjs'], new_paths: [], protected_paths: [] },
    execution: { runtime: 'pi', model: 'ollama-cloud/deepseek-v4.1-flash', effort: 'high', permission_recipe: 'pi-terminal-attach', readiness: { setup_complete: true }, limits: { session_minutes: 90, attempts: 3, max_files: 5, max_lines: 300 }, retrieval: [] },
    validation: { checks: [{ name: 'unit', command: 'npm test', expected: '3 passing' }], estimate: { files: 1, lines: 4 }, generated_paths: [], scratch_paths: [], fixture_only: true },
    delivery: { result_fields: ['outcome', 'changed_paths', 'checks'], reply_route: 'orca:run', usage_source: 'pi-status-bar', budget_ref: 'budget-1', escalation_rule: 'escalate after two failed repairs', recovery_ref: '.agent-task.md', audit_ref: '.agents/orca-sdd/runs/feature-a/events.jsonl' },
  };
  return deepMerge(brief, overrides);
}

function deepMerge(a, b) {
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' ? deepMerge(a[k], v) : v;
  }
  return out;
}

export function read(repo, rel) {
  return readFileSync(join(repo, rel), 'utf8');
}

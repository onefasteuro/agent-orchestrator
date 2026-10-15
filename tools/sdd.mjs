#!/usr/bin/env node
// Single CLI for the P1 utilities. Every command prints one JSON object and
// exits 0 on ok, 1 on a failed check, 2 on usage or runtime error.
//
//   sdd brief-validate <brief.json> [--snapshot-root <dir>] [--skip-repo]
//   sdd gate --brief <brief.json> --repo <checkout> --base <sha> [--candidate <sha>] [--ignored-baseline <file>] [--metadata-baseline <json: {config_sha256, info_attributes_sha256}>]
//   sdd metadata-baseline --repo <checkout>        (prints the json to record at setup)
//   sdd audit-append --log <events.jsonl> --type <event_type> [--json '<fields>'] [--allow-custom]
//   sdd audit-verify --log <events.jsonl>
//   sdd audit-segment --log <events.jsonl> --new <events-2.jsonl> --reason <text>
//   sdd audit-classify --log <events.jsonl> --run <id> --task <id> --dispatch <id> --result-hash <hex>
//   sdd usage-codex --file <rollout.jsonl>
//   sdd usage-pi --text '<status bar line>'
//   sdd usage-coverage --log <events.jsonl>
//   sdd liveness --projection '<json>' --role <role> [--last-progress <iso>] [--pending-question <iso>]
//   sdd recovery-write --checkout <integration> --json '<fields>'
//   sdd recovery-read --checkout <integration>
//   sdd doc-identity --repo <checkout> --revision <sha> --path <file> [--baseline approved|draft]
//   sdd spec-drift --log <events.jsonl> --repo <checkout> [--revision <sha>]   (K-5: briefs whose pinned document hashes differ from the current documents)
//   sdd reconcile --log <events.jsonl> --checkout <integration> --workers <worker-list.json>   (R-2: index, log and live Orca state side by side)
//   sdd integrate --repo <integration-checkout> --candidate <sha> --log <events.jsonl> --run <id> --task <id> --dispatch <id> --brief-hash <hex> --check '<shell command>' --expect '<substring that must appear in the check output>' [--message <text>] [--cites <dispatch ids, comma separated: every result that informed the acceptance>]
//        merges (fast-forward when possible, else a single merge), runs the check, and ONLY THEN appends acceptance_recorded;
//        a failed check reverts the integration commit and appends integration_reverted; exit 1
//   sdd pack-hash --dir <pack>
//   sdd brief-render --brief <brief.json> --role-file <roles/x.md> [--spec-excerpt <file>] [--plan-excerpt <file>] [--out <prompt.txt>]
//   sdd fake-worker --scenario <name> --repo <checkout> --brief <brief.json> --task <id> --dispatch <id> [--audit <file>]

import { readFileSync } from 'node:fs';
import { validateBrief, loadBrief } from './lib/brief.mjs';
import { runGate } from './lib/gate.mjs';
import { append, readLog, startSegment, classifyResult, unresolved } from './lib/audit.mjs';
import { parseCodexRollout, parsePiStatusBar, coverage } from './lib/usage.mjs';
import { decideLiveness } from './lib/liveness.mjs';
import { writeIndex, readIndex } from './lib/recovery.mjs';
import { runScenario, SCENARIOS } from './lib/fake-worker.mjs';
import { packHash, renderPrompt } from './lib/render.mjs';
import { briefHash } from './lib/canonical.mjs';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[k] = true;
      else { args[k] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

function out(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(code);
}

function need(args, keys) {
  for (const k of keys) if (args[k] === undefined || args[k] === true) { out({ ok: false, error: `--${k} required` }, 2); }
}

const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

try {
  switch (cmd) {
    case 'brief-validate': {
      const file = args._[0];
      if (!file) out({ ok: false, error: 'brief file required' }, 2);
      const r = validateBrief(loadBrief(file), { snapshotRoot: args['snapshot-root'], skipRepo: !!args['skip-repo'] });
      out(r, r.ok ? 0 : 1);
    }
    case 'gate': {
      need(args, ['brief', 'repo', 'base']);
      const ignoredBaseline = args['ignored-baseline'] ? readFileSync(args['ignored-baseline'], 'utf8').split('\n').filter(Boolean) : [];
      const metadataBaseline = args['metadata-baseline'] ? JSON.parse(readFileSync(args['metadata-baseline'], 'utf8')) : {};
      const r = runGate({ repo: args.repo, brief: loadBrief(args.brief), baseSha: args.base, candidateSha: args.candidate || null, ignoredBaseline, metadataBaseline });
      out(r, r.ok ? 0 : 1);
    }
    case 'audit-append': {
      need(args, ['log', 'type']);
      const fields = args.json ? JSON.parse(args.json) : {};
      out({ ok: true, record: append(args.log, { event_type: args.type, ...fields }, { allowCustom: !!args['allow-custom'] }) });
    }
    case 'audit-verify': {
      need(args, ['log']);
      const r = readLog(args.log);
      const u = unresolved(r.events);
      const ok = r.problems.length === 0 && r.partial === null;
      out({ ok, events: r.events.length, partial_trailing_line: r.partial !== null, problems: r.problems, unresolved: u }, ok ? 0 : 1);
    }
    case 'audit-segment': {
      need(args, ['log', 'new', 'reason']);
      out({ ok: true, header: startSegment(args.log, args.new, args.reason) });
    }
    case 'audit-classify': {
      need(args, ['log', 'run', 'task', 'dispatch', 'result-hash']);
      const { events } = readLog(args.log);
      const verdict = classifyResult(events, { run_id: args.run, task_id: args.task, dispatch_id: args.dispatch, result_hash: args['result-hash'] });
      out({ ok: verdict === 'new', verdict }, verdict === 'new' ? 0 : 1);
    }
    case 'usage-codex': { need(args, ['file']); out(parseCodexRollout(args.file)); }
    case 'usage-pi': { need(args, ['text']); out(parsePiStatusBar(args.text)); }
    case 'usage-coverage': { need(args, ['log']); out(coverage(readLog(args.log).events)); }
    case 'liveness': {
      need(args, ['projection', 'role']);
      out(decideLiveness({ projection: JSON.parse(args.projection), role: args.role, now: Date.now(), lastProgressAt: args['last-progress'] || null, pendingQuestionCreatedAt: args['pending-question'] || null }));
    }
    case 'recovery-write': { need(args, ['checkout', 'json']); out({ ok: true, index: writeIndex(args.checkout, JSON.parse(args.json)) }); }
    case 'recovery-read': { need(args, ['checkout']); out({ ok: true, index: readIndex(args.checkout) }); }
    case 'metadata-baseline': {
      need(args, ['repo']);
      const { metadataBaseline } = await import('./lib/gate.mjs');
      out({ ok: true, ...metadataBaseline(args.repo) });
    }
    case 'doc-identity': {
      need(args, ['repo', 'revision', 'path']);
      const { readAtRevision, resolveCommit } = await import('./lib/git.mjs');
      const { hashBytes } = await import('./lib/canonical.mjs');
      const rev = resolveCommit(args.repo, args.revision);
      if (!rev) out({ ok: false, error: `revision ${args.revision} does not resolve` }, 1);
      const bytes = readAtRevision(args.repo, rev, args.path);
      if (!bytes) out({ ok: false, error: `${args.path} not present at ${rev.slice(0, 12)}` }, 1);
      out({ ok: true, path: args.path, baseline: args.baseline || 'approved', revision: rev, sha256: hashBytes(bytes), bytes: bytes.length });
    }
    case 'spec-drift': {
      need(args, ['log', 'repo']);
      const { readAtRevision, resolveCommit } = await import('./lib/git.mjs');
      const { hashBytes } = await import('./lib/canonical.mjs');
      const { events } = readLog(args.log);
      // Latest approval per path wins; a superseded approval (named by a later
      // event's supersedes_sequence) is ignored entirely.
      const superseded = new Set(events.filter((e) => e.event_type === 'approval_recorded' && e.supersedes_sequence).map((e) => e.supersedes_sequence));
      const docs = new Map();
      for (const e of events) {
        if (e.event_type !== 'approval_recorded' || superseded.has(e.sequence)) continue;
        for (const k of ['feature_spec', 'feature_plan']) if (e[k]?.path) docs.set(e[k].path, { pinned: e[k].sha256, revision: e[k].revision, approval_sequence: e.sequence });
      }
      const rev = args.revision ? resolveCommit(args.repo, args.revision) : null;
      const current = {};
      for (const [path] of docs) {
        let bytes = null;
        if (rev) bytes = readAtRevision(args.repo, rev, path);
        else { try { bytes = readFileSync(`${args.repo}/${path}`); } catch { bytes = null; } }
        current[path] = bytes ? hashBytes(bytes) : null;
      }
      const changed = [...docs].filter(([p, d]) => current[p] !== d.pinned).map(([p, d]) => ({ path: p, pinned: d.pinned, current: current[p] }));
      const briefs = events.filter((e) => e.event_type === 'brief_validated').map((e) => ({ brief_id: e.brief_id, brief_hash: e.brief_hash, feature_spec_sha256: e.feature_spec_sha256 || null, feature_plan_sha256: e.feature_plan_sha256 || null }));
      const changedHashes = new Set(changed.map((c) => c.pinned));
      const affected = briefs.filter((b) => changedHashes.has(b.feature_spec_sha256) || changedHashes.has(b.feature_plan_sha256) || (!b.feature_spec_sha256 && changed.length));
      const accepted = new Set(events.filter((e) => e.event_type === 'acceptance_recorded').map((e) => e.brief_hash));
      const live = affected.filter((b) => !accepted.has(b.brief_hash));
      out({ ok: changed.length === 0, changed_documents: changed, affected_briefs: live, note: changed.length ? 'append spec_changed, hold dependents, rebrief or cancel each affected brief (K-5)' : 'no drift' }, changed.length ? 1 : 0);
    }
    case 'reconcile': {
      need(args, ['log', 'checkout', 'workers']);
      const idx = readIndex(args.checkout);
      const { events, partial, problems } = readLog(args.log);
      const u = unresolved(events);
      const wl = JSON.parse(readFileSync(args.workers, 'utf8'));
      const rows = (wl.result?.workers || wl.workers || []).map((w) => ({ dispatch_id: w.dispatchId || w.dispatch_id || w.id, liveness: w.projection?.liveness?.verdict || null, reason: w.projection?.liveness?.reason || null, attention: w.projection?.attention?.categories || [] }));
      const live = rows.filter((r) => r.liveness === 'live').map((r) => r.dispatch_id);
      const logged = new Set(events.filter((e) => e.event_type === 'dispatch_started').map((e) => e.dispatch_id));
      const findings = [];
      if (partial) findings.push('audit log ends in a partial line: start a linked segment before appending');
      for (const p of problems) findings.push(`audit: ${p.message}`);
      for (const d of live) if (!logged.has(d)) findings.push(`live dispatch ${d} has no dispatch_started event: unknown worker, inspect before anything else`);
      for (const d of u.receipt_without_result) findings.push(`dispatch ${d} started with no result: ${live.includes(d) ? 'still live, keep waiting' : 'not live, inspect with worker-read then stop per K-15'}`);
      for (const b of u.intent_without_receipt) findings.push(`brief ${b} has intent but no receipt: inspect Orca before any retry`);
      for (const d of u.result_without_acceptance) findings.push(`dispatch ${d} has a result awaiting acceptance or rejection`);
      for (const d of (idx?.orca?.dispatches || [])) if (!rows.some((r) => r.dispatch_id === d.dispatch_id)) findings.push(`recovery index names dispatch ${d.dispatch_id} that Orca does not list`);
      out({ ok: findings.length === 0, index: idx ? { run_id: idx.orca?.run_id, accepted_sha: idx.accepted_sha, next_action: idx.next_action, dispatches: idx.orca?.dispatches } : null, live_dispatches: live, unresolved: u, findings, next: findings.length ? 'resolve every finding before dispatching anything new (R-2)' : 'state consistent; safe to continue' }, findings.length ? 1 : 0);
    }
    case 'integrate': {
      need(args, ['repo', 'candidate', 'log', 'run', 'task', 'dispatch', 'brief-hash', 'check', 'expect']);
      const { execFileSync, execSync } = await import('node:child_process');
      const { resolveCommit } = await import('./lib/git.mjs');
      const repo = args.repo;
      const gitc = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=sdd-coordinator', '-c', 'user.email=sdd-coordinator@local', '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const cand = resolveCommit(repo, args.candidate);
      if (!cand) out({ ok: false, error: 'candidate does not resolve' }, 2);
      if (gitc('status', '--porcelain')) out({ ok: false, error: 'integration checkout is dirty' }, 2);
      const before = gitc('rev-parse', 'HEAD');
      let mode;
      try { gitc('merge', '--ff-only', cand); mode = 'fast-forward'; } catch { gitc('merge', '--no-ff', '-m', args.message || `Integrate candidate ${cand}`, cand); mode = 'merge'; }
      const integrated = gitc('rev-parse', 'HEAD');
      let output = '', passed = false;
      try { output = execSync(args.check, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { output = String(e.stdout || '') + String(e.stderr || ''); }
      passed = output.includes(args.expect);
      if (passed) {
        const cites = args.cites ? String(args.cites).split(',').filter(Boolean) : [];
        const rec = append(args.log, { event_type: 'acceptance_recorded', run_id: args.run, task_id: args.task, dispatch_id: args.dispatch, brief_hash: args['brief-hash'], base_before_integration: before, candidate_sha: cand, integrated_sha: integrated, integration: mode, cites, check: { command: args.check, expect: args.expect, passed: true, output_tail: output.slice(-400) } });
        out({ ok: true, integrated_sha: integrated, integration: mode, sequence: rec.sequence });
      }
      // failed: revert the integration and record it; the Git effect precedes the event
      if (mode === 'fast-forward') gitc('reset', '--hard', before); else gitc('revert', '-m', '1', '--no-edit', integrated);
      const after = gitc('rev-parse', 'HEAD');
      const rec = append(args.log, { event_type: 'integration_reverted', run_id: args.run, task_id: args.task, dispatch_id: args.dispatch, brief_hash: args['brief-hash'], candidate_sha: cand, integration_sha: integrated, revert_sha: after, reverted_by: mode === 'fast-forward' ? 'reset to the pre-integration SHA (no merge commit existed)' : 'git revert -m 1', check: { command: args.check, expect: args.expect, passed: false, output_tail: output.slice(-600) } });
      out({ ok: false, integrated_sha: integrated, reverted_to: after, integration: mode, sequence: rec.sequence, check_output_tail: output.slice(-600) }, 1);
    }
    case 'pack-hash': { need(args, ['dir']); out({ ok: true, ...packHash(args.dir) }); }
    case 'brief-render': {
      need(args, ['brief', 'role-file']);
      const brief = loadBrief(args.brief);
      const r = renderPrompt({ roleText: readFileSync(args['role-file'], 'utf8'), brief, briefHash: briefHash(brief), featureSpecExcerpt: args['spec-excerpt'] ? readFileSync(args['spec-excerpt'], 'utf8') : '', featurePlanExcerpt: args['plan-excerpt'] ? readFileSync(args['plan-excerpt'], 'utf8') : '' });
      if (args.out) { const { writeFileSync } = await import('node:fs'); writeFileSync(args.out, r.prompt, 'utf8'); }
      out({ ok: true, prompt_hash: r.prompt_hash, brief_hash: briefHash(brief), bytes: Buffer.byteLength(r.prompt), out: args.out || null, prompt: args.out ? undefined : r.prompt });
    }
    case 'fake-worker': {
      need(args, ['scenario', 'repo', 'brief', 'task', 'dispatch']);
      if (!SCENARIOS.includes(args.scenario)) out({ ok: false, error: `scenario must be one of ${SCENARIOS.join(', ')}` }, 2);
      out({ ok: true, ...runScenario(args.scenario, { repo: args.repo, brief: loadBrief(args.brief), task_id: args.task, dispatch_id: args.dispatch, auditFile: args.audit || null }) });
    }
    default:
      out({ ok: false, error: `unknown command ${cmd || '(none)'}`, commands: ['brief-validate', 'gate', 'audit-append', 'audit-verify', 'audit-segment', 'audit-classify', 'usage-codex', 'usage-pi', 'usage-coverage', 'liveness', 'recovery-write', 'recovery-read', 'doc-identity', 'spec-drift', 'reconcile', 'integrate', 'pack-hash', 'brief-render', 'metadata-baseline', 'fake-worker'] }, 2);
  }
} catch (err) {
  out({ ok: false, error: String(err.message || err) }, 2);
}

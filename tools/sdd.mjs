#!/usr/bin/env node
// Single CLI for the P1 utilities. Every command prints one JSON object and
// exits 0 on ok, 1 on a failed check, 2 on usage or runtime error.
//
//   sdd brief-validate <brief.json> [--snapshot-root <dir>] [--skip-repo]
//   sdd gate --brief <brief.json> --repo <checkout> --base <sha> [--candidate <sha>] [--ignored-baseline <file>]
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
      const r = runGate({ repo: args.repo, brief: loadBrief(args.brief), baseSha: args.base, candidateSha: args.candidate || null, ignoredBaseline });
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
      out({ ok: false, error: `unknown command ${cmd || '(none)'}`, commands: ['brief-validate', 'gate', 'audit-append', 'audit-verify', 'audit-segment', 'audit-classify', 'usage-codex', 'usage-pi', 'usage-coverage', 'liveness', 'recovery-write', 'recovery-read', 'pack-hash', 'brief-render', 'fake-worker'] }, 2);
  }
} catch (err) {
  out({ ok: false, error: String(err.message || err) }, 2);
}

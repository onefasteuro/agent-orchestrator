# P6 proposal: lean pack

Date: 15 October 2026. Status: draft, awaiting the native single-task test and the user's decision.

## Why

P3 to P5 proved the workflow (10 of 10 tasks accepted, 0 interventions, Pi median 36 s per task) but the machinery around each task is larger than the task. The package re-implements state that Orca already keeps (task, dispatch, message and worktree state; liveness; settlement on the first valid `worker_done`) and adds hashes, schemas and event vocabularies that no run has needed. The native coordinator path (`claude --agent sdd-orchestrator` following `workflow.md`) was only ever exercised for planning; delivery ran through `spike/p5/run-task.sh`, a 155-line zsh script with ten recorded glue mistakes.

Orca's own `/orchestration` skill already gives the three things the user asked for: a brief passed to a fresh session (`worker-start --spec` into a new terminal), results back to the coordinator (`worker_done`, `ask`/`reply`, `send --to dispatch:<id>`, `check --wait`), and worktree placement. The lean pack leans on that in prose and keeps only what Orca cannot do.

## Keep

| Item | Why |
| --- | --- |
| Entrypoint `sdd-orchestrator.md` (21 lines) | Native Claude agent definition; holds the non-negotiable rules |
| `workflow.md` (46 lines) | Order of operations and the exact commands that differ from plain Orca use |
| `task-brief.md` (37 lines) | Prose brief shape, mirrors Orca's five-field task-spec contract plus acceptance criteria and allowlist |
| `launch-recipes.md` (37 lines) | Pi needs `terminal create` with the user's command; Codex and Claude need explicit sandbox flags; Orca's `--agent` launcher cannot express either |
| Five role prompts (139 lines) | Role behaviour and result shape; unchanged apart from removed control ids |
| Ownership check | Pi has no sandbox. `git diff --name-only` against the brief's allowlist, done by the coordinator in shell |
| Blind pass-1 review, detached read-only checkout | Calibration showed it catches seeded defects 15 of 15 times |
| Integration with revert | Plain `git merge --ff-only`, full suite, `git reset --hard` or `git revert -m 1` on failure |
| Runs file `.agents/orca-sdd/runs/<feature>.md` | One ignored Markdown file per feature, appended at each state change; the coordinator's memory across restarts |
| Planning first, one approval, fresh session per dispatch, one writer per checkout | The invariants that matter; now stated in prose instead of as controls |

## Cut

| Item | Replaced by |
| --- | --- |
| Brief JSON envelope, `brief-validate`, `brief-render`, `templates/brief.example.json`, `templates/task-brief.md` mustache | Prose brief per `task-brief.md`; the coordinator reads it back once before dispatch |
| Brief hash, prompt hash, pack hash, `doc-identity`, `spec-drift` | The spec commit SHA named in the brief; a spec edit after approval is a new commit and a rebrief |
| JSONL audit log, 24 event types, `audit-append/verify/segment/classify` | Orca run history plus the runs file plus Git commits with the task id in the message |
| Recovery index `.agent-task.md`, `recovery-write/read`, `reconcile` | Runs file plus `worker-list --run` plus `git log` |
| `liveness` tool and K-14 thresholds | Orca `projection.liveness` and `projection.nextAction` |
| Metadata baseline (hash of `.git/config`), ignored baseline, symlink and submodule classes in the gate | Dropped; Orca writes `branch.*.base` into `.git/config` by design and nothing else has ever fired |
| `fake-worker` harness and the 43 tests | Not needed once the tools are gone |
| Unconditional review pass 2 | Pass 2 only when pass 1 has a finding or could not run a check (0 of 10 pilot verdicts changed in pass 2) |
| `role-map.json` | Bindings live in `launch-recipes.md` only |
| Spec, controls and plan documents (21 controls, 21 decisions, 13 non-claims) | One short README describing the workflow and the evidence; the v0.5 package moves to `archive/v0.5/` |
| Tracked `spike/p5/work` dumps (610 files, 4.1 MB) | Keep the receipts (`spike/*.md`, the events log); ignore or archive the work directories |

Optional, kept out of the pack: `usage-pi` and `usage-codex` parsers if token accounting is wanted later.

## What is lost

- Replay and conflict detection by result hash. Orca settles a dispatch on the first valid `worker_done` and refuses a second; the coordinator still checks the dispatch id.
- Hash-pinned document identity. The brief names a commit SHA instead; workers read the documents at that SHA.
- A machine-verifiable audit chain. The runs file is prose, appended by one writer.
- Automated restart reconciliation. The coordinator reads three sources and decides.

For one local repository with one writer these are acceptable; the plan's integrity thresholds were met without any of them ever rejecting anything.

## Test before cutting

Install the lean pack into the fixture beside the current one, start `claude --agent sdd-lean` inside an Orca terminal in the fixture's main checkout, and deliver one small feature end to end with the coordinator issuing every Orca and Git command itself in prose. Pass: the feature is planned, approved once, implemented by Pi in a task worktree, reviewed blind by Codex in a detached checkout, integrated with the full suite passing, worktrees removed, and the runs file tells the story. Record every place the coordinator fumbled.

Pass means P6 ships the lean pack and the installer copies six files plus five role prompts. Fail means the script path is the product and the lean pack is revised around it.

## Installer (P6 scope after the test)

`install.sh <global|project>`: copies `sdd-orchestrator.md` to `~/.claude/agents/` or `<repo>/.claude/agents/`, and the pack files to `~/.agents/orca-sdd/` or `<repo>/.agents/orca-sdd/`. Preview with `--dry-run`, refuses to overwrite a differing file without `--force`, keeps a `.bak`. Nothing else.

## Test result, 15 October 2026

Run on the fixture with the lean pack installed beside the v0.5 pack (fixture commits 08fbe94, 376dea1). Coordinator: `claude --agent sdd-lean --model claude-opus-5-5 --effort high --permission-mode acceptEdits` in an Orca terminal on `main`, pack via `SDD_PACK_DIR`. Goal: `mode(values)`, one task. The coordinator issued every Orca and Git command itself; no runner script.

**Pass.** Every criterion in "Test before cutting" was met.

| Step | Observed |
| --- | --- |
| Plan | `specs/mode/spec.md` (AC-1 to AC-10, OD-1) and `plan.md` committed as 47197b6, 1 min 41 s, no research dispatch needed, paused once for approval |
| Implement | Pi in Orca worktree `task-1`, dispatched with `worker-start --spec --terminal` in one call; asked one question via `ask`; answered via `reply`; candidate 89b17a5 after an ownership check |
| Review | Blind Codex pass 1 in a detached checkout: REPAIR (MEDIUM untested no-rounding rule, LOW untested 0/-0). Pass 2 ran because findings existed, upheld them. Repair dispatch (fresh Pi, same worktree) gave 63d78c8. New blind review: ACCEPT, no pass 2 |
| Integrate | `git merge --ff-only` to 63d78c8, `npm test` 48 pass 0 fail; task and review worktrees removed through Orca; five dispatches released, zero reclaimable |
| Memory | `.agents/orca-sdd/runs/mode.md`, 30 lines, every id, SHA and verdict; readable without tools |
| Time | 11 min 7 s from approval to done; 5 dispatches |

Fumbles, in order of weight:

1. **Pack error (mine).** `workflow.md` told the coordinator its identity was `caller.orcaSessionId` from `orca status`; for a Claude session that field is absent. The real identity is `$ORCA_TERMINAL_HANDLE`. The coordinator stopped correctly and explained; fixed and committed as 376dea1 mid-run.
2. **Spec error (coordinator).** AC-7's check command ran `node --test` over `test/`, where Node 26 counts file wrappers, so the expected count was wrong. Pi asked; the coordinator reproduced it on the base commit, replied with the corrected command, and committed the spec fix after integration as 05b3ad8, judging it nonmaterial. Reasonable, and the question channel did its job.
3. **Branches left.** Orca `worktree rm --force` deleted `task-1`'s branch itself but `review-1` and `review-1-r1` stayed. Step 11 now says to `git branch -d` them.
4. **Unexplained.** The `spike-codex-ro` and `spike-pi-impl` worktrees disappeared from the Orca workspace during the run. The run log does not mention them and the coordinator's visible scrollback has no reference; `spike-pi-impl`'s unmerged branch (260a5f3) survives, `spike-codex-ro`'s merged branch is gone. Cause not established.

Nothing in the cut list was missed during the run: no hash, audit event, recovery index or liveness tool was needed. Conditional pass 2 triggered exactly when it should.

Decision requested: adopt the lean pack as P6 and archive the v0.5 package and `tools/`.

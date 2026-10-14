# Coordinator workflow

This is the procedure the `sdd-orchestrator` entrypoint follows. The specification (`orchestration-spec.md`) states the rules; the controls document (`orchestration-controls.md`) states the mechanisms; this file is the order of operations with the exact commands. `sdd` below means `node <pack>/../tools/sdd.mjs` until P6 installs it on the path.

## 0. Identity and mode

1. Check whether you are inside an Orca terminal: `ORCA status --json` shows `caller.orcaSessionId`. Without it you may still read, research by yourself and draft documents, but you must not run any `ORCA orchestration` command; before the first dispatch of any kind, stop and tell the user to start the coordinator inside an Orca terminal in the integration checkout (K-20).
2. Load the live Orca contract: `ORCA skills get orchestration --full` and `ORCA skills get orca-cli`. Use that executable for the whole run.
3. Classify the request. **Planning-only** (the user asks for a plan, spec, design, or says planning-only): mode M-1, no implementation, no installation, no dependency setup, no implementation dispatch. **Delivery** (the user asks to build, deliver, implement): mode M-2, which still begins with planning and pauses once for approval. A request to build does not skip planning (M-0).
4. Read the recovery index if it exists (`sdd recovery-read --checkout <integration>`). If it names a Run, reconcile before anything else (section 8).

## 1. Discover

1. Read the project instructions (`AGENTS.md`, `CLAUDE.md`), the existing feature documents if any, and the repository state (`git status`, `git log -5`).
2. List material unknowns. For each that needs documentation or codebase evidence, dispatch a researcher (section 4) with a bounded question. Research runs in the existing checkout; it never creates a task worktree.
3. Before the first research dispatch, write draft feature spec and plan snapshots under `<integration>/.agents/orca-sdd/runs/<feature-id>/snapshots/` containing the goal, constraints and open questions, so research briefs can pin a hash (K-3).

## 2. Specify and plan

1. Draft or validate `specs/<feature>/spec.md` from `templates/feature-spec.md`: behaviour, non-goals, constraints, numbered acceptance criteria `AC-n`, each observable.
2. Draft or validate `specs/<feature>/plan.md` from `templates/feature-plan.md`: interfaces, bounded tasks with assigned paths, dependencies, named checks. Each task fits K-4 (one outcome, five files, 300 lines, one 30 to 90 minute session) or names an exception.
3. Review both documents for gaps against the acceptance criteria. Record open decisions for the user.
4. **M-1 stops here.** Return the documents, the acceptance matrix and the open decisions. Do not create task worktrees, do not dispatch implementers, do not install anything.
5. **M-2 pauses here.** Commit the feature documents, present them, and wait for one explicit approval (D-1). Record `approval_recorded` with both document revisions and hashes, the authorization scope and the user's words. Execute only within that scope afterwards.

## 3. Per task: dispatch an implementer

1. Pick a ready task whose predecessors are accepted. Start it from the accepted integrated SHA.
2. Create the task worktree from that SHA (`ORCA worktree create --repo <id> --name task-<n> --base-branch <ref> --json`), confirm `git rev-parse HEAD` equals the recorded base, run setup with fixtures only (K-16). Never copy `.env` or credentials.
3. Build the brief from `templates/brief.example.json`: pin the feature spec and plan revisions and SHA-256 hashes, the role-pack hash, the base SHA, assigned and new paths, limits, checks, delivery fields. Render the worker prompt as `roles/implementer.md` followed by the TASK block from `templates/task-brief.md`.
4. Preflight: `sdd brief-validate <brief.json>`. On failure append `brief_rejected` and fix the brief; never launch.
5. Append `dispatch_intent` with the brief hash. Create the task: `ORCA orchestration task-create --from <coord> --run <run> --task-title ... --spec "<rendered prompt>" --json`.
6. Launch per `launch-recipes.md`, wait for idle, verify the status line, then `worker-start --terminal`. Append `dispatch_started` with the receipt's task and dispatch IDs. If the start command times out or errors, inspect `worker-show` before any retry; never resend blindly.
7. Record the dispatch, worktree and handle in the recovery index (`sdd recovery-write`).

## 4. Supervise

Loop: `ORCA orchestration check --terminal <coord> --run <run> --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json`.

- A `question`: handle it per section 5 before acknowledging anything. A held unacknowledged delivery is replayed by every `check`, so do not wait on the inbox for anything else while holding it.
- A `worker_done`: classify first: `sdd audit-classify --log <events> --run --task --dispatch --result-hash <sha256 of the message body and payload>`. `ignored` means an identical replay: append `result_ignored`, ack, continue. `conflict` or `stale`: append `error`, ack, investigate; never accept. `new`: append `result_received`, then handle by role (sections 6 and 7). Ack only after the record is appended.
- An `escalation`: append `escalation`, act on the reason code, reply or cancel.
- A timeout: a checkpoint, not a failure. After three empty waits run `worker-list --run <run> --json` and feed each row's `projection` to `sdd liveness --projection ... --role ... --last-progress ...`. `inspect` means `worker-read --dispatch <id>`; `stop` means the verified stop in `launch-recipes.md`, then `worker_stalled` and one failed attempt against the task budget.

Researchers and advisors are handled the same way; their results are findings, not acceptance.

## 5. Advice (Q-1 to Q-4, K-10)

1. Record the question ID and `created_at`. The implementer is now paused; its liveness clock is paused (K-14).
2. Build an advisor brief pinned to the same documents, with the question, the files named, attempts and observations, and `workspace.dirty_state` describing the paused worktree. Dispatch the advisor in that worktree with the Codex read-only recipe. The advisor has no dependency on the implementation task.
3. While holding the question, inspect the advisor with `worker-show --dispatch` and `worker-read --dispatch`, not with another consuming `check`.
4. When the advisor's `worker_done` arrives it is also an inbox delivery behind the held question. Read it with `worker-read`, decide the answer, confirm the implementer dispatch is still current (`worker-show`), then `reply --from <coord> --id <question id> --body "<answer>" --json`, then ack the question delivery, then process and ack the advisor delivery.
5. Advisor failure or timeout becomes an explicit escalation to the user; the question is never left silently pending. The implementer resumes with `ask --resume` on its side; the coordinator does nothing for that.
6. If the answer requires a path outside the implementer's allowlist, amend the brief (K-8): new brief hash, `brief_amended`, verified stop of the current attempt, new dispatch under the same budget.

## 6. Candidate and review (K-6, K-7, K-9)

1. On the implementer's handoff run the gate against the working tree: `sdd gate --brief <brief> --repo <task worktree> --base <base>`. Any violation: append `candidate_rejected`, preserve the work, decide: amend the brief, send the implementer a bounded repair, or escalate. Never reset or delete the violating files to make the gate pass.
2. Stage only the validated assigned and declared paths, commit on the task branch with a neutral message (`<task_id> brief:<hash>`), record the SHA.
3. Re-run the gate on the commit: `sdd gate --brief <brief> --repo <task worktree> --base <base> --candidate <sha>`. Hooks may have re-staged files; if the second gate fails, treat it as step 1. Append `candidate_created` with the receipt.
4. Create a clean detached review checkout at the candidate SHA and confirm it is clean.
5. Pass 1: reviewer brief with `delivery.pass = 1`, `pass_one_exclusions` listing the withheld material (implementer report, claimed checks, advisor output, prior verdicts, plan rationale, recovery and audit files). Dispatch with the Codex read-only recipe. On `worker_done`, append `review_pass_one_recorded` with the full findings before anything else.
6. Pass 2: a second dispatch (same session may resume) with the withheld material added. The final report is the terminal review result. Keep both.
7. Findings go to the implementer as a bounded repair in its task worktree. A repair is a new dispatch and produces a new candidate SHA; affected review evidence is invalidated. After two failed repairs, dispatch the debugger before a third.

## 7. Integrate and accept (W-4, K-8)

1. Integrate the accepted candidate into the integration branch serially (fast-forward or a single merge), run the required checks on the integrated SHA, map results to every acceptance criterion the task claims.
2. A failed integration check: revert the integration commit, append `integration_reverted`, hold downstream, return the task to repair. The repair candidate is a new SHA based on the current accepted integrated SHA and carrying the complete corrected change. Never re-merge the old task-branch head.
3. Append `acceptance_recorded` with the full identity tuple and usage record, then release the terminal (`worker-release --dispatch`), keep the task worktree until the feature is accepted, update the recovery index, and only then start dependent work from the new accepted SHA.
4. Usage: for every dispatch, failed or cancelled included, append `usage_recorded` from the native source (`sdd usage-codex --file`, `sdd usage-pi --text`) or with `measurement_status: unavailable`. Missing is never zero.

## 8. Change, recovery, cancellation

- **Feature document change (K-5):** new revisions and hashes; compare with every queued and in-flight brief; hold dependents; mark each compatible, rebrief or cancel; append `spec_changed`. A material change invalidates the approval: present the change and wait for a new `approval_recorded`.
- **Restart (R-2):** read the recovery index and `sdd audit-verify --log`. If the log ends in a partial line, start a linked segment (`sdd audit-segment`). Reconcile every `dispatch_intent` without receipt and every receipt without acceptance against `worker-list --run` and Git before any new dispatch. Stale results from replaced dispatches cannot satisfy the current assignment.
- **Cancellation (R-3):** stop new dispatch, then for each active dispatch do the verified stop, append `worker_stopped` or report an uncertain state explicitly, resolve or cancel pending questions, keep every worktree and the evidence.
- **Human takeover (K-15):** append `human_takeover`, verified stop, the human edits, hand-back declares paths, `human_handback`, new dispatch under the same budget, then the normal candidate path.

## 9. Report

End every run or pause with: what was achieved against each acceptance criterion, the checks actually run with result lines, unavailable checks as explicit gaps, usage coverage (`sdd usage-coverage --log`), open decisions and limitations. Never present an accepted limitation as a passing check (L-3).

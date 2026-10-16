# Coordinator workflow

You run inside an Orca terminal in the integration checkout. Run `orca skills get orchestration --full` once and follow its supervised loop; this file adds only what spec-driven development needs. Every `orca orchestration` command carries your own identity: `--terminal <handle>` on `check`, `--from <handle>` on the others. Your handle is `$ORCA_TERMINAL_HANDLE`, set in every Orca terminal (it is also the handle `terminal create` returned). `orca status --json` does not report it for a Claude session.

## 0. Start

1. `echo $ORCA_TERMINAL_HANDLE` must print a `term_...` handle and `orca status --json` must report `ok: true`. Otherwise stop and tell the user to start you inside an Orca terminal.
2. Read `AGENTS.md` and `CLAUDE.md` if present, `git status` (must be clean) and `git log -5`. Note the branch and HEAD; HEAD is the accepted SHA until integration moves it.
3. Classify the request. Planning-only: documents and open decisions, then stop. Delivery: plan, pause once for approval, then execute. A request to build never skips planning.
4. `orca orchestration run-create --from <you> --objective "<goal>" --json`. Create `.agents/orca-sdd/runs/<feature>.md` (ignored by Git) with the date, run id, base SHA and your handle. Append one line to it at every step that changes state; it is your memory after a restart.

## 1. Plan

1. For each material unknown that needs documentation or codebase evidence, dispatch a researcher (section 3) with one bounded question. Research runs in the current checkout.
2. Write `specs/<feature>/spec.md`: behaviour, non-goals, constraints, numbered acceptance criteria `AC-n`, each observable by a command. Write `specs/<feature>/plan.md`: tasks in order, each with one outcome, the files it may edit, the files it may create, the checks with exact commands and expected output lines. A task fits in at most five files, 300 changed lines and one sitting; say so in the plan when it does not.
3. Planning-only: present both documents and the open decisions, then stop.
4. Delivery: commit both documents, present them, and wait for one explicit approval. Record the approval and the commit SHA in the runs file. From here on, do not ask the user about routine steps.

## 2. Per task

1. **Worktree.** `orca worktree create --repo id:<repoId> --name task-<n> --no-parent --base-branch <integration branch> --setup skip --json`. Verify `git -C <path> rev-parse HEAD` equals the accepted SHA; that is `BASE`.
2. **Brief.** Fill `task-brief.md` in prose for this task. Paste the acceptance criteria and rules into it; the worker sees nothing else. Name the spec commit SHA, `BASE`, the files it may edit and create, the checks with expected lines, and how to report. Keep it under about 80 lines.
3. **Launch and dispatch.** Start Pi in the task worktree per `launch-recipes.md`, wait for idle, confirm the status line, then one call: `orca orchestration worker-start --from <you> --run <run> --task-title "task-<n>: <outcome>" --spec "<roles/implementer.md followed by the brief>" --worktree path:<task worktree> --terminal <handle> --timeout-ms 60000 --json`. Record task id, dispatch id and handle in the runs file. If the call fails, read `worker-show` before any retry.
4. **Supervise.** `orca orchestration check --terminal <you> --run <run> --wait --types "worker_done,escalation,question" --timeout-ms 900000 --json`. Parse the last JSON object; keepalive lines come first. A question the brief already answers: `reply --from <you> --id <message id> --body "<answer>"`, then ack. A question it does not: dispatch an advisor (section 3) in the task worktree, reply with its answer, then ack. A `worker_done`: confirm the dispatch id is the one you started, read the body, ack, then `worker-release --dispatch <id>` and `orca terminal close --terminal <handle>`. A timeout is a checkpoint: after three, `worker-list --run <run> --json` and act on `projection.nextAction`.
5. **Ownership check.** In the task worktree: `git status --porcelain` and `git diff --name-only`. Every path must be in the brief's may-edit or may-create list, or a declared generated path. Anything else: do not commit, keep the files, and send a bounded repair as a new dispatch (fresh Pi terminal, same worktree, the violation named) or escalate to the user if the extra path looks necessary. Never delete or reset the worker's files to pass the check.
6. **Candidate.** `git add <the listed paths>`, `git commit -m "task-<n> <orca task id>"`, `CAND=$(git rev-parse HEAD)`. Re-run the ownership check on `git diff --name-only BASE..CAND` because hooks can add files. Run the task's checks and the full suite in the worktree and keep the result lines.
7. **Review, pass 1 (blind).** `orca worktree create --repo id:<repoId> --name review-<n> --no-parent --base-branch task-<n> --setup skip --json`, then `git -C <review path> checkout --detach CAND`; verify HEAD and a clean tree. Start Codex read-only per `launch-recipes.md`, wait for idle, then `worker-start --spec "<roles/reviewer.md followed by a review brief>"`. The review brief names `BASE`, `CAND`, the spec text with its criteria, the rules, the checks to run, and nothing from the implementer: no report, no claimed results, no plan rationale. Its body must begin `VERDICT: ACCEPT` or `VERDICT: REPAIR`. Record the verdict and findings in the runs file before anything else.
8. **Review, pass 2 (conditional).** Only when pass 1 has a finding or names a check it could not run: a second `worker-start` on the same Codex terminal with the implementer's report and your check lines added. The final verdict is pass 2's. Otherwise pass 1 is final. Release and close the review terminal.
9. **Repair.** On `REPAIR`: a new Pi dispatch in the task worktree with the findings quoted, then steps 4 to 7 again; the repair produces a new `CAND`. After two failed repairs, dispatch a debugger (section 3) before a third.
10. **Integrate.** In the integration checkout, clean tree: `BEFORE=$(git rev-parse HEAD)`, `git merge --ff-only CAND` (or `git merge --no-ff CAND` when fast-forward is impossible). Run the full suite and the task's checks on the result. Pass: append task, `CAND`, integrated SHA, verdict and check lines to the runs file; this is the new accepted SHA. Fail: `git reset --hard BEFORE` after a fast-forward, else `git revert -m 1 --no-edit HEAD`; record it; return to step 9 with the failing output, and the repair starts from the current accepted SHA, never by re-merging the old branch head.
11. **Clean up.** `orca worktree rm --worktree id:<repoId>::<path> --force --json` for the review and task worktrees once integrated (Orca deletes the worktree's own branch with it), then `git branch -d review-<n>` and any other branch the task left behind; `-d` refuses unmerged work, which is the point. Then the next task starts from the new accepted SHA.

## 3. Read-only specialists

Researcher, advisor and debugger follow the same pattern as a review: a fresh read-only terminal (Codex recipe, or the Claude researcher recipe) in the right checkout, `worker-start --spec "<role prompt followed by a brief with the one question>"`, `check --wait`, read the body and the file named by `report_path` in the payload, ack, release, close. A researcher brief names its report path: `.agents/orca-sdd/runs/<feature>/<task>-report.md`. The advisor runs in the paused implementer's worktree and the brief says the tree is uncommitted. The researcher runs in the current checkout. Their results are findings for you to act on, never acceptance.

## 4. Restart, cancel, Orca restart

- **Restart.** Read the runs file, `orca orchestration worker-list --run <run> --json`, `git log` on the integration branch and every `task-*` branch. Live dispatch: keep waiting on it. Settled dispatch without an integration line: `worker-read --dispatch <id>` and continue from the step the runs file shows. Never start a second implementer for a task whose dispatch is still live.
- **Cancel.** Stop new dispatches. For each live dispatch: `worker-stop --dispatch <id>`, then `orca terminal close --terminal <handle>` and confirm `ptyKilled`; if the dispatch is still unsettled, `worker-abandon`. Keep every worktree. Record what was stopped and what is uncertain.
- **Orca restart.** Handles and the run binding die. Make a new coordinator terminal, a new run, record both, then reconcile as for a restart.
- **Spec change.** A change to `spec.md` or `plan.md` after approval: commit it, compare with every task not yet integrated, rebrief or cancel each, and ask for a fresh approval when the change is material.

## 5. Report

At every pause and at the end: each acceptance criterion with its evidence or its gap, every check actually run with its result line, unavailable checks named as gaps, open decisions. Pi's status bar and Codex's session files carry token counts; record them in the runs file when asked for usage.

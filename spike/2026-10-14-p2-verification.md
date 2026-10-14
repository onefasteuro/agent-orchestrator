# P2 verification receipts

Date: 14 October 2026. Pack at `pack/` (hash `1cc61dc3…` at the time of install) copied into the fixture repository at project scope (`.agents/orca-sdd/`, `.claude/agents/sdd-orchestrator.md`, fixture commit `3a0a153`). Orca Run `run_84e48de5c85f` reused with the spike coordinator terminal.

## AC-10, Claude binding

Claude Code 2.1.300 launched in the `spike-codex-ro` worktree through `terminal create --command` with `--model claude-sonnet-5-5 --permission-mode dontAsk --allowedTools "Read,Grep,Glob,Bash(orca *),mcp__context7__*" --disallowedTools "Edit,Write,NotebookEdit,Bash(git *)"`. First attempt exited because the trust dialog defaults to "No, exit"; second attempt accepted with Up then Enter. Task `task_07b173c5444d`, dispatch `ctx_09274223a2d9`, same research contract as spike row 3. `worker_done` (outcome succeeded) at 23:07:06Z, 16 s after dispatch: Context7 tools available, resolved `/nodejs/node/v25.9.0`, cited `doc/api/test.md` sections for `skip`, `test.skip` and `t.skip()`, stated uncertainty about v26 docs. No edits, no git commands. Status line showed `Sonnet 5.5 (medium)`: effort was not set, so the recipe now passes `--effort high`. Result: PASS. With spike row 3 (Codex), AC-10 is met: the same contract ran on both bindings with only the launch recipe changed.

## AC-1, planning-only request

`claude --agent sdd-orchestrator --model claude-opus-5-5 -p "<planning-only request for a mean() function>"` in the fixture primary checkout, `--permission-mode dontAsk` with reads and `Write(specs/**)` allowed and every `orca orchestration`, `orca worktree` and `orca terminal` command disallowed. 23:07:06Z to 23:09:04Z, 26 turns, $0.62. Output: `specs/mean/spec.md` (behaviour, non-goals, constraints, AC-1 to AC-9, open decisions OD-1 to OD-5) and `specs/mean/plan.md` (one task T1 within K-4, integration steps, verification matrix, risks), both untracked and uncommitted. The run stated it stopped, listed six decisions for the user, ran no implementation, created no worktree (count unchanged at 3) and no dispatch (run `run_84e48de5c85f` unchanged). It reported honestly that no checks ran because shell was denied. It also found two real issues: the entrypoint's tools path pointed at `<pack>/../tools`, which is wrong for the installed layout (fixed to prefer `<pack>/tools`), and the fixture's deliberate `clamp` failure conflicts with "run npm test before reporting". Result: PASS.

## AC-2, goal-only delivery request

Same entrypoint, same restrictions, prompt "Deliver this feature ..." with the product decisions supplied and the instruction to validate the existing drafts. 23:09:46Z to 23:11:41Z, 40 turns, $0.71. The run updated `specs/mean/spec.md` and `plan.md` in place (decisions recorded as settled, `src/generated.mjs` declared as a generated path, base moved to `9e3a140`), then stopped at the approval pause: "Delivery stopped at the approval pause ... I wrote no product code and started no workers." No worktree created (count 3), no dispatch (run dispatch count 6, unchanged since AC-10). It listed what it could not check because shell was denied and asked for one explicit approval. Result: PASS.

Harness note: shell denial in both runs came from my `--allowedTools` patterns (`Bash(git status*)` is not the rule syntax; `Bash(git status:*)` is). The pack is unaffected; the coordinator reported the limitation instead of working around it, which is the behaviour L-3 asks for.

## P2 outcome

AC-1, AC-2 and AC-10 observed on the installed pack. AC-3 to AC-9, AC-11 and AC-12 are covered by the P1 tests and the P0b spike rows; AC-13 (installer) is P6. Two findings fed back into the pack: the entrypoint tools path and the Claude recipe's missing `--effort`. Pack hash after fixes: see `node tools/sdd.mjs pack-hash --dir pack`.

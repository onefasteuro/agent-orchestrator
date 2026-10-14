# Launch recipes (K-21)

Verified on Orca 1.4.224, Codex 0.161.0, Pi 1.0.4, Claude Code 2.1.300 on 14 October 2026 unless marked unverified. A version change re-runs the affected spike rows (K-17). Replace `ORCA` with the executable `orca skills get` was run with. Every orchestration command carries the coordinator's own terminal identity (K-20): `--terminal <handle>` on `check`, `--from <handle>` on everything else.

## Coordinator

Start Claude inside an Orca terminal in the integration checkout:

```sh
claude --agent sdd-orchestrator
```

The coordinator records its handle (`ORCA status --json`, field `caller.orcaSessionId`, or the handle returned when the terminal was created) in the recovery index. Orchestration state is bound to one Run created with `ORCA orchestration run-create --from <handle> --objective "..." --json`.

## Codex read-only (advisor, reviewer, debugger, alternate researcher)

Never `worker-start --agent codex` for these roles unless Orca Settings > Agents > Agent Permissions is confirmed Manual: Orca pre-fills `--dangerously-bypass-approvals-and-sandbox`. Use an explicit launch:

```sh
ORCA terminal create --worktree path:<abs-checkout> --title <role> \
  --command 'codex --sandbox read-only --model gpt-6-astra -c model_reasoning_effort="<high|max>"' --json
ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
ORCA orchestration worker-start --from <coord> --run <run_id> --task <task_id> \
  --worktree path:<abs-checkout> --terminal <handle> --timeout-ms 60000 --json
```

`terminal wait` can return `satisfied: false` with `blockedReason`:

- `agent-update-prompt`: send `2` (Skip) with `terminal send --text 2`; the pinned version stays.
- `agent-trust-workspace`: send Enter with `terminal send --text "" --enter`. Trust is saved per repository root in the user's Codex config, so pre-trust the pilot repository once.

Verify the status line reads the intended model, effort and `Read Only` before dispatch. The start receipt's `launch.effective` is null for attached terminals; the screen capture is the evidence. MCP servers (Context7) run outside the sandbox and work in read-only mode.

Levels (D-15): advisor and debugger `max`; reviewer `high`, escalation to `max` recorded as an event.

## Pi implementer (terminal attach)

Orca's `--model` and `--effort` do not apply to Pi, and `--agent pi` would use Pi's default model. Launch Pi with the user's tested command, verbatim, then attach:

```sh
ORCA terminal create --worktree path:<abs-task-worktree> --title implementer \
  --command 'pi --model ollama-cloud/deepseek-v4.1-flash --thinking high' --json
ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
ORCA orchestration worker-start --from <coord> --run <run_id> --task <task_id> \
  --worktree path:<abs-task-worktree> --terminal <handle> --timeout-ms 60000 --json
```

Check the status line shows `(ollama-cloud) deepseek-v4.1-flash • high`. `turnStart` is `unsupported` for Pi; confirm delivery by reading the terminal. Pi loads Orca's `orca-agent-status` extension, which feeds `projection.liveness`. Pi enforces no filesystem restriction in this launch; the ownership gate (K-7) is the control. Pi's status bar carries usage: `↑<in> ↓<out> R<reasoning> CH<cache%> $<estimate>`.

Pi's first model call fails with `401 Unauthorized` when the provider credential is stale; the same failure reproduces with `pi -p` outside Orca. Fix the credential, close the terminal, launch a fresh one; a running Pi does not pick up a changed environment.

## Claude researcher (verified 14 October 2026, AC-10)

The trust dialog on a new directory defaults to "No, exit": send Up then Enter (`terminal send --text $'\e[A'`, then `--text "" --enter`), or pre-trust the repository once. Orca reports it as `agent-trust-workspace`.

```sh
ORCA terminal create --worktree path:<abs-checkout> --title researcher \
  --command 'claude --model claude-sonnet-5-5 --effort high --permission-mode dontAsk --allowedTools "Read,Grep,Glob,Bash(orca *),mcp__context7__*" --disallowedTools "Edit,Write,NotebookEdit,Bash(git *)"' --json
```

`dontAsk` denies every call that is not pre-approved, so only reads, Context7 and `orca` commands run. `Edit` in the deny list covers all built-in file writers. Without `--effort` the session ran at medium. Verified: the status line shows the model and effort, Context7 resolved and queried documentation inside the restriction, and `worker_done` was delivered with the right task and dispatch IDs (`turnStart` is `unsupported` for Claude, as for Pi). Orca's `worker-start --agent claude` pre-fills `--dangerously-skip-permissions` and is not acceptable for this role.

## Stopping and retrying (K-8, K-15)

For attached terminals `worker-stop` returns `stop_unknown` and takes no process action. Verified stop is:

```sh
ORCA terminal close --terminal <handle> --json        # expect "ptyKilled": true
ORCA orchestration worker-abandon --dispatch <id> --json   # settles the dispatch
ORCA orchestration worker-start --retry-of <id> --task <task_id> --terminal <new handle> --worktree path:<...> --from <coord> --json
```

`--retry-of` is refused until the dispatch is settled. A pending question on the old dispatch is replied to or cancelled first.

# Launch recipes

Verified on Orca 1.4.224, Codex 0.161.0, Pi 1.0.4, Claude Code 2.1.300. Orca's `--agent` launcher is not used for workers: `--agent pi` ignores the model, and `--agent codex` or `--agent claude` pre-fills a permission-bypass flag. Start the process yourself, wait for idle, then attach with `worker-start --terminal`.

## Pi implementer

```sh
orca terminal create --worktree path:<task worktree> --title implementer --command 'pi --model ollama-cloud/deepseek-v4.1-flash --thinking high' --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
```

`orca terminal read` must show `(ollama-cloud) deepseek-v4.1-flash • high` before dispatch. Pi has no filesystem sandbox; the ownership check in `workflow.md` is the control. A `401 Unauthorized` on the first model call means a stale provider credential: fix it, close the terminal, start a fresh one.

## Codex read-only (reviewer, advisor, debugger, researcher)

```sh
orca terminal create --worktree path:<checkout> --title <role> --command 'codex --sandbox read-only --model gpt-6-astra -c model_reasoning_effort="<high|max>"' --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
```

Reviewer `high`; advisor and debugger `max`. The status line must read the model, the effort and `Read Only`. If `terminal wait` returns `satisfied: false` with `blockedReason`: `agent-update-prompt`, send `2` (skip); `agent-trust-workspace`, send Enter. Trust is saved per repository root, so this happens once.

## Claude researcher (alternative)

```sh
orca terminal create --worktree path:<checkout> --title researcher --command 'claude --model claude-sonnet-5-5 --effort high --permission-mode dontAsk --allowedTools "Read,Grep,Glob,Bash(orca status:*),Bash(orca orchestration send:*),Bash(orca orchestration ask:*),Bash(orca orchestration check:*),mcp__context7__*" --disallowedTools "Edit,Write,NotebookEdit,Bash(git:*),Bash(orca terminal:*),Bash(orca worktree:*),Bash(orca orchestration worker-start:*),Bash(orca orchestration dispatch:*),Bash(orca orchestration run-create:*),Bash(orca orchestration task-create:*)"' --json
```

The trust dialog defaults to "No, exit": send Up then Enter, or pre-trust the repository.

## Stopping

`worker-stop` fences but does not kill an attached terminal. Verified stop: `orca terminal close --terminal <handle> --json` and confirm `ptyKilled: true`; closing settles the dispatch as failed. If `worker-show` still says unsettled, `worker-abandon --dispatch <id>`.

## Shell notes

Write `"${VAR}:path"`, never `"$VAR:path"`, in zsh. Parse every Orca result's `ok` field before using an id. `check --wait` prints keepalive lines before the final object.

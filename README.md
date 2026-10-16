# Agentic SDD orchestration

Claude coordinates a spec-driven development loop through [Orca](https://onorca.dev). Pi (DeepSeek) implements in its own worktree, Codex (Astra) reviews, advises and debugs read-only, and every specialist is a fresh Orca worker with a complete brief. Planning always comes first; a delivery request pauses exactly once for approval, then runs without further prompts.

Version 1.0, 16 October 2026. Lean pack adopted after the native single-task test recorded in `docs/p6-proposal.md`. The v0.5 planning package, its controls and its `tools/` CLI are preserved unchanged under `archive/v0.5/`.

## Contents

1. [Prerequisites](#prerequisites)
2. [Skills and connectors](#skills-and-connectors)
3. [Install the pack](#install-the-pack)
4. [Prepare the target repository](#prepare-the-target-repository)
5. [Use](#use)
6. [Monitor, stop and restart](#monitor-stop-and-restart)
7. [Troubleshooting](#troubleshooting)
8. [Update and uninstall](#update-and-uninstall)
9. [Repository layout](#repository-layout)
10. [Evidence](#evidence)

## Prerequisites

The installer only copies Markdown files. Everything below is separate setup and must be in place before the first run.

| Tool | Role | Verified version | Check |
| --- | --- | --- | --- |
| [Orca](https://onorca.dev) desktop app and `orca` CLI | Terminals, worktrees, worker dispatch, inbox | 1.4.224 | `orca --version`, `orca status --json` reports `ok: true` |
| Claude Code (`claude`) | Coordinator, optional researcher | 2.1.300, 2.1.301 | `claude --version` |
| Pi (`pi`) | Implementer | 1.0.4 | `pi --version`, `pi --list-models deepseek` lists `ollama-cloud  deepseek-v4.1-flash` |
| Codex CLI (`codex`) | Reviewer, advisor, debugger, researcher | 0.161.0 | `codex --version`, `codex login status` |
| Git | Worktrees, ownership check, integration | any recent | `git --version` |

Accounts and credentials:

- **Claude Code**: signed in. The coordinator agent definition requests `model: opus`.
- **Pi**: a working `ollama-cloud` provider credential for `deepseek-v4.1-flash`. A `401 Unauthorized` on the first model call means the credential is stale.
- **Codex**: signed in (`codex login`), with access to `gpt-6-astra`.

Orca settings:

- **Settings > Agents > Agent Permissions: Manual.** The pack starts every worker process itself with its own permission flags; Orca's `--agent` launcher is deliberately not used (see `pack/launch-recipes.md`).

## Skills and connectors

**Required: none to install.** The coordinator reads Orca's bundled `orchestration` skill at runtime with `orca skills get orchestration --full`, which prints the guide that matches your installed Orca CLI. Check it is available:

```sh
orca skills list | grep '^orchestration:'
```

Optional, for using Orca from your own interactive Claude or Codex sessions (not needed by the pack):

```sh
orca skills install --skill orchestration --skill orca-cli --dry-run   # show the command
orca skills install --skill orchestration --skill orca-cli             # install globally
```

Optional, for the Claude researcher recipe only:

- **Tavily and TinyFish claude.ai connectors.** These are account connectors: connect them once in claude.ai and every Claude Code session under the same login sees them. Confirm with `claude mcp list`. An `ANTHROPIC_API_KEY` in the environment disables all claude.ai connectors, so keep it out of the shell profile on a machine that runs researchers.
- **Tavily CLI (`tvly`).** Only when the target project's instructions ask for it. The recipe then needs `Bash(tvly search:*),Bash(tvly extract:*)` added to its `--allowedTools` (see `pack/launch-recipes.md`).

## Install the pack

Clone this repository, then run the installer from anywhere. It installs one agent definition and eight pack files (three top-level files plus five role prompts).

```sh
# Into one repository (run inside it, or pass --repo)
/path/to/agent-orchestration/install.sh project --dry-run
/path/to/agent-orchestration/install.sh project
/path/to/agent-orchestration/install.sh project --repo ~/Sites/my-app

# Or once for every repository on this machine
/path/to/agent-orchestration/install.sh global --dry-run
/path/to/agent-orchestration/install.sh global
```

Where the files go:

| Scope | Agent definition | Pack |
| --- | --- | --- |
| `project` | `<repo>/.claude/agents/sdd-orchestrator.md` | `<repo>/.agents/orca-sdd/` |
| `global` | `~/.claude/agents/sdd-orchestrator.md` | `~/.agents/orca-sdd/` |

`<repo>` defaults to the Git root of the current directory.

Options and behaviour:

- `--dry-run` prints what would change and writes nothing.
- `--force` replaces a managed file that differs from the source and keeps the old copy as `<file>.bak`. Without it, a differing file is reported as `DIFFERS` and left alone.
- The installer touches nothing else in the target directories and refuses to write through a symlink anywhere on the managed path.
- Exit codes: `0` complete and identical to the source, `1` a differing file or a symlink blocked the install, `2` usage error.

The coordinator looks for the pack in this order: `$SDD_PACK_DIR`, then `<repo root>/.agents/orca-sdd/`, then `~/.agents/orca-sdd/`. Set `SDD_PACK_DIR` to point at a pack elsewhere (for example this repository's `pack/` while editing it).

## Prepare the target repository

1. **Ignore the runs directory.** The coordinator writes its progress log and researcher reports under `.agents/orca-sdd/runs/`. The installer does not edit `.gitignore`, so add the line yourself and commit it:

   ```sh
   echo '.agents/orca-sdd/runs/' >> .gitignore
   git add .gitignore && git commit -m "Ignore SDD run logs"
   ```

2. **Decide whether to commit the pack.** With a project install, `.claude/agents/sdd-orchestrator.md` and `.agents/orca-sdd/` are ordinary files. Commit them to share the pack with the team, or ignore them to keep it local.
3. **Add the repository to Orca** so `orca worktree create --repo id:<repoId>` can address it.
4. **Make sure the full test suite runs from the command line.** The plan names exact check commands and expected output lines, and every candidate is checked in its worktree and again after integration.
5. **Optional: `AGENTS.md` or `CLAUDE.md`.** The coordinator reads both at start, so put project conventions there.

## Use

### Start the coordinator

Open an Orca terminal in the integration checkout (the branch that receives accepted work), then run the preflight the coordinator also runs:

```sh
echo $ORCA_TERMINAL_HANDLE   # must print a term_... handle
orca status --json           # must report ok: true
git status                   # must be clean
```

Start the coordinator:

```sh
claude --agent sdd-orchestrator
```

The native test in `docs/p6-proposal.md` ran it as `claude --agent <name> --model claude-opus-5-5 --effort high --permission-mode acceptEdits`. The coordinator must run inside an Orca terminal: without `$ORCA_TERMINAL_HANDLE` it stops before the first dispatch.

### State the goal

| You say | What happens | Where it stops |
| --- | --- | --- |
| "Plan this feature: ..." | Optional researchers answer bounded questions, then the coordinator writes the spec and plan | Presents both documents and the open decisions. Nothing is dispatched |
| "Deliver this feature: ..." | Same planning, then the spec and plan are committed | Pauses once for your explicit approval |
| (after you approve) | Per task: worktree, Pi implements, ownership check, candidate commit, blind Codex review, repair if needed, integrate, clean up | Ends with a report: each acceptance criterion with evidence or a gap, every check run with its result line |

After approval the coordinator does not ask about routine steps. It does come back to you for product decisions, scope changes, and an ownership violation where the extra file looks necessary.

### What it produces

| Path | Content | In Git |
| --- | --- | --- |
| `specs/<feature>/spec.md` | Behaviour, non-goals, constraints, numbered acceptance criteria `AC-n` | Committed before approval |
| `specs/<feature>/plan.md` | Ordered tasks, each with its outcome, editable and creatable files, and exact checks | Committed before approval |
| `.agents/orca-sdd/runs/<feature>.md` | One line per state change: run id, base SHA, dispatches, verdicts, integrated SHAs | Ignored |
| `.agents/orca-sdd/runs/<feature>/<task>-report.md` | Researcher reports | Ignored |
| `task-<n>`, `review-<n>` worktrees | Implementation and detached review checkouts | Removed after integration |
| Integration branch | One commit (or merge) per accepted task | Committed |

## Monitor, stop and restart

- **Progress**: `tail -f .agents/orca-sdd/runs/<feature>.md`, or watch the worker terminals in Orca. Pi's status bar and Codex's session files carry token counts; ask the coordinator to record usage if you need it.
- **Cancel**: tell the coordinator to cancel. It stops new dispatches, stops and closes each live worker terminal, keeps every worktree, and records what was stopped.
- **Coordinator restart**: start `claude --agent sdd-orchestrator` again in the same checkout and ask it to resume `<feature>`. It reconciles from the runs file, `orca orchestration worker-list` and the `task-*` branches, and never starts a second implementer for a task whose dispatch is still live.
- **Orca restart**: terminal handles and the run binding are lost. The coordinator creates a new terminal identity and run, records both, then reconciles as above.
- **Spec change after approval**: the coordinator commits the change, rebriefs or cancels each task not yet integrated, and asks for fresh approval when the change is material.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Coordinator says it has no terminal identity | Not started in an Orca terminal. Open one in the integration checkout and start again |
| Coordinator says no pack exists | Run `install.sh`, or set `SDD_PACK_DIR` |
| Pi returns `401 Unauthorized` on the first call | Stale provider credential. Fix it, close the terminal, start a fresh one |
| Pi status line does not show `(ollama-cloud) deepseek-v4.1-flash • high` | Wrong model or provider. Do not dispatch; fix Pi's configuration |
| Codex `terminal wait` returns `blockedReason: agent-update-prompt` | Send `2` (skip) |
| Codex `terminal wait` returns `blockedReason: agent-trust-workspace` | Send Enter. Trust is saved per repository root, so this happens once |
| Claude researcher exits at the trust dialog | The dialog defaults to "No, exit". Send Up then Enter, or pre-trust the repository |
| Claude researcher cannot send `worker_done` | Extra deny rules were added to the recipe. Use the recipe exactly as written |
| Researcher cannot see Tavily or TinyFish | Connector not connected in `claude mcp list`, or `ANTHROPIC_API_KEY` is set in the environment |
| `install.sh` reports `DIFFERS` | Local edits to a managed file. Keep them, or re-run with `--force` (old copy kept as `.bak`) |
| `install.sh` reports `REFUSED ... is a symlink` | A symlink sits on the managed path. Replace it with a real file or directory |

More detail on each worker launch is in `pack/launch-recipes.md`.

## Update and uninstall

**Update**: `git pull` here, then re-run the same `install.sh` command. Unchanged files report `same`; changed files report `DIFFERS` and need `--force`.

**Uninstall**: the installer has no uninstall mode. Delete the files it wrote:

```sh
# project scope
rm <repo>/.claude/agents/sdd-orchestrator.md
rm -r <repo>/.agents/orca-sdd/          # also deletes runs/ logs

# global scope
rm ~/.claude/agents/sdd-orchestrator.md
rm -r ~/.agents/orca-sdd/
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `install.sh` | Installer, `project` or `global` scope |
| `pack/sdd-orchestrator.md` | Claude agent definition: the rules that never bend |
| `pack/workflow.md` | Order of operations and the exact Orca and Git commands |
| `pack/task-brief.md` | Prose brief shape for implementer, reviewer, advisor, debugger, researcher |
| `pack/launch-recipes.md` | How to start Pi and read-only Codex or Claude workers; Orca's `--agent` launcher cannot express either |
| `pack/roles/*.md` | Five role prompts (implementer, reviewer, advisor, debugger, researcher) and their result shapes |
| `docs/p6-proposal.md` | Why the lean pack replaced v0.5, and the native test result |
| `spike/` | Receipts from the P0 spike through the P5 pilot |
| `archive/v0.5/` | The previous package, unchanged |

What Orca provides natively and the pack leans on: `worker-start --spec` into a fresh terminal, `check --wait` inbox, `ask`/`reply`, `worker_done` settlement, worktree placement, liveness. What the coordinator adds in shell: the ownership check (`git diff --name-only` against the brief's allowlist, because Pi has no sandbox), the blind pass-1 review in a detached checkout, and integration with revert.

## Evidence

- `docs/p6-proposal.md`: why the v0.5 package was cut, what was kept, what was lost, and the native test result (one feature, 11 minutes, one repair loop, zero interventions).
- `spike/`: receipts from the P0 spike through the P5 pilot (10 of 10 tasks accepted, 5 of 5 seeded defects caught, 0 false positives under the shipped reviewer prompt).
- Fixture repository: `~/Sites/orca-sdd-fixture`.

Verified versions: Orca 1.4.224, Codex 0.161.0, Pi 1.0.4, Claude Code 2.1.300 and 2.1.301.

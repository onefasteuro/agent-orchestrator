# Agentic SDD orchestration

Claude coordinates a spec-driven development loop through [Orca](https://onorca.dev). Pi (DeepSeek) implements in its own worktree, Codex (Astra) reviews, advises and debugs read-only, and every specialist is a fresh Orca worker with a complete brief. Planning always comes first; a delivery request pauses exactly once for approval, then runs without further prompts.

Version 1.0, 16 October 2026. Lean pack adopted after the native single-task test recorded in `docs/p6-proposal.md`. The v0.5 planning package, its controls and its `tools/` CLI are preserved unchanged under `archive/v0.5/`.

## Install

```sh
./install.sh project            # into the current repository
./install.sh global             # into ~/.claude/agents and ~/.agents/orca-sdd
./install.sh project --dry-run  # show what would change
```

The installer copies one agent definition and nine pack files. It never overwrites a differing file without `--force`, and `--force` keeps a `.bak`. Orca itself, the agent binaries, provider credentials and model defaults are separate setup. Orca Settings > Agents > Agent Permissions should be Manual.

## Use

Open an Orca terminal in the integration checkout and start the coordinator:

```sh
claude --agent sdd-orchestrator
```

Then state the goal. "Plan this feature..." ends at a committed spec and plan plus open decisions. "Deliver this feature..." plans, pauses once for your approval, then implements, reviews, repairs and integrates each task. Progress is in `.agents/orca-sdd/runs/<feature>.md` (ignored by Git), one line per state change.

## Pack

| File | Purpose |
| --- | --- |
| `pack/sdd-orchestrator.md` | Claude agent definition: the rules that never bend |
| `pack/workflow.md` | Order of operations and the exact Orca and Git commands |
| `pack/task-brief.md` | Prose brief shape for implementer, reviewer, advisor, debugger, researcher |
| `pack/launch-recipes.md` | How to start Pi and read-only Codex or Claude workers; Orca's `--agent` launcher cannot express either |
| `pack/roles/*.md` | Five role prompts and their result shapes |

What Orca provides natively and the pack leans on: `worker-start --spec` into a fresh terminal, `check --wait` inbox, `ask`/`reply`, `worker_done` settlement, worktree placement, liveness. What the coordinator adds in shell: the ownership check (`git diff --name-only` against the brief's allowlist, because Pi has no sandbox), the blind pass-1 review in a detached checkout, and integration with revert.

## Evidence

- `docs/p6-proposal.md`: why the v0.5 package was cut, what was kept, what was lost, and the native test result (one feature, 11 minutes, one repair loop, zero interventions).
- `spike/`: receipts from the P0 spike through the P5 pilot (10 of 10 tasks accepted, 5 of 5 seeded defects caught, 0 false positives under the shipped reviewer prompt).
- Fixture repository: `~/Sites/orca-sdd-fixture`.

Verified versions: Orca 1.4.224, Codex 0.161.0, Pi 1.0.4, Claude Code 2.1.300 and 2.1.301.

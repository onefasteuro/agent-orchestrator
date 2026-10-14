# Starting an orchestration task in a repository

**Earlier execution-runbook draft.** Current work is planning-only. Use `orchestration-spec.md` and `orchestration-plan.md` as the draft planning baseline; the execution prompts below remain inactive until implementation is authorized.

Runbook, October 14, 2026. This applies the agreed design: Claude Opus 5.5 coordinates, Pi with the user's tested DeepSeek High configuration implements, Codex handles OpenAI specialist roles, and Orca manages external workers and tasks. The companion `orca-sdd-installer` package now supplies the role files for global or project installation. Live native launch settings and Orca integration still require validation in the target environment.

Once a repository is prepared, starting a feature takes three user actions: open a feature integration worktree in Orca, start Claude with the orchestrator definition, and provide a feature brief. Claude handles task creation, specialist dispatch and the verification loop.

**Prepare the repository once.**

1. Register or open the Git repository in Orca. Confirm the Orca CLI works inside its terminal and that Claude, Codex and Pi are available there. Preserve the user's tested Pi/DeepSeek launch configuration. Use the existing native authentication for each agent.
2. Make Orca's `orca-cli` and `orchestration` skills available to the participating agents. The documented project-local installation is shown below; omit `--local` only if a global installation is intended. Inspect the detected installation targets so the participating agents can find the instructions. Existing installations can be reused.
3. Add the repository's coordinator and role definitions, preserving existing project rules. Configure the native agent launch settings independently from role prompts: read-only behavior must be enforced by supported tool/sandbox controls, not just a role name. Orca documents permission-bypass defaults; set its Agent Permissions to Manual and inspect existing overrides.
4. Record the repository's setup, build, test and lint commands. For new worktrees, require setup readiness before dependent implementation begins; Orca's wait-for-setup policy gates task delivery, while start-immediately can run setup concurrently.
5. Commit the reviewed nonsecret bootstrap files, following the repository's checks, before creating feature worktrees. Newly created worktrees only contain committed content from their starting revision unless additional files are deliberately supplied. Preserve unrelated local changes.

```sh
orca skills install --skill orca-cli --skill orchestration --local
```

The official installer discovers agents and can also target explicit agent identifiers. Its installed skills load commands from the running Orca binary rather than freezing a potentially stale CLI reference. [Orca skills](https://www.onorca.dev/docs/cli/skills), [agent permission settings](https://www.onorca.dev/docs/agents/supported)

Minimal proposed repository structure:

```text
AGENTS.md                          shared project rules
CLAUDE.md                          imports AGENTS.md; Claude-specific guidance
.claude/agents/sdd-orchestrator.md      main Claude role and coordination procedure
.claude/agents/sdd-researcher.md        native Claude researcher
.claude/orca-sdd/roles/implementer.md         Pi task behavior and reporting contract
.claude/orca-sdd/roles/advisor.md             Codex advisory behavior and output contract
.claude/orca-sdd/roles/reviewer.md            Codex independent review contract
.claude/orca-sdd/roles/debugger.md            Codex diagnostic contract
specs/                             feature briefs, specifications and plans
```

The `.claude/orca-sdd/roles/` directory is our convention, not an Orca discovery mechanism. The orchestrator reads the relevant file and includes its actual instructions in each task specification. It also applies the role's runtime, model, effort, permission and worktree settings. Orca's `--agent` chooses a runtime; it has no general `--role` flag. [Worker-start interface](https://github.com/stablyai/orca/blob/main/src/cli/specs/orchestration-worker-specs.ts)

The orchestrator definition must declare `name: sdd-orchestrator` and give the main session the tools needed to maintain documents, invoke Orca and use the native Claude researcher. It contains the role mapping and full lifecycle, so the kickoff prompt can focus on the feature. Use Orca's orchestration procedure for external workers. Create these files before starting Claude. [Claude agent definitions](https://code.claude.com/docs/en/sub-agents)

**Start each new feature.**

1. In Orca, create an integration worktree for the feature from an explicitly selected base containing the bootstrap files. Choose a useful feature name and record the starting commit. Open a terminal in that worktree. Do not infer its Git base from the sidebar parent.
2. Start the native Claude orchestrator using the command below. This requires the role definition from setup; `--agent sdd-orchestrator` selects that definition as the main session.
3. Give Claude the feature goal, observable acceptance criteria, constraints, non-goals and expected deliverable. A ticket or existing specification can supply this information. Use the kickoff prompt below as a starting point.

```sh
claude --agent sdd-orchestrator --model claude-opus-5-5
```

Sources: [Orca worktree starting points](https://www.onorca.dev/docs/model/worktrees), [Claude CLI](https://code.claude.com/docs/en/cli-reference).

Suggested kickoff prompt:

> Coordinate this feature using this repository's SDD workflow and Orca.
>
> Feature: [name]
> Outcome: [what the user should be able to do]
> Acceptance criteria: [observable success conditions]
> Constraints and non-goals: [compatibility, scope and exclusions]
> References: [ticket, existing spec or relevant documents]
>
> Use the repository's configured roles and my tested Pi/DeepSeek High configuration. Start with one implementation writer. Use Codex Astra Max for advisory questions and difficult debugging, and independent Codex review before integration.
>
> Inspect the current Git and Orca state first. Resume a matching active run when appropriate; otherwise create one. Research missing facts, write the specification and plan, prepare self-contained task briefs, and execute through verification and integration. Ask me about material unresolved decisions; otherwise continue within this scope.
>
> Deliver verified changes in this feature's integration branch, acceptance evidence, and any remaining limitations. Maintain the recovery note and preserve incomplete work.

There is no assumed `/orchestrate` command. The native main-agent definition and a normal prompt are sufficient for the initial design.

**The coordinator performs the remaining steps.**

1. **Establish the run.** Inspect Git status, the existing `.agent-task.md` if present, and live Orca state. Load the installed guides, verify the current workspace, then create a Run only if no matching run should be resumed. Save its actual ID, the integration revision and the feature-document paths in the recovery note.

   ```sh
   orca skills get orca-cli
   orca skills get orchestration --full
   orca status --json
   orca orchestration run-create --objective "<feature outcome>" --json
   ```

   These examples use `orca`; the coordinator should use the exact CLI executable resolved by the live skill throughout the run. Run creation provides state and an inbox, not an automatic scheduler. [Official orchestration workflow](https://github.com/stablyai/orca/blob/main/skill-guides/orchestration.md)

2. **Research, specify and plan.** Use the native Claude researcher for bounded unknowns. Create `specs/<feature>/spec.md`, `plan.md` and task briefs. Each brief names its role, target, change, constraints, ownership and observable acceptance, plus relevant decisions, required checks and predecessor outputs. Resolve material ambiguity; continue autonomously when the agreed scope is sufficient.

3. **Make task context available.** Commit the approved nonsecret specification/role changes before branching, or explicitly supply their essential contents to workers. Record the accepted base commit. Create Orca Tasks with real dependencies and self-contained specifications. A task dependency does not transmit the coordinator's conversation. Orca injects coordination instructions followed by the supplied task text. [Task contract](https://github.com/stablyai/orca/blob/main/skill-guides/orchestration.md), [preamble source](https://github.com/stablyai/orca/blob/main/src/main/runtime/orchestration/preamble.ts)

4. **Prepare and dispatch the first implementer.** Create a task worktree from the accepted base and complete its required setup. Launch Pi there with the user's existing working configuration, then attach that terminal with `worker-start --task`, its exact `--worktree` selector and returned `--terminal` handle. Orca injects the role/task payload automatically; do not submit it a second time. Keep Pi as the only writer to the task's source files.

5. **Supervise and unblock.** Claude handles Orca messages while work runs. If Pi requests advice, it pauses edits; Claude starts an independent Codex Astra Max consultation against those current changes and returns the answer through Orca's original question/reply. The advisor must not depend on implementation completion. Preserve question/dispatch identities across timeouts; use the documented inbox handling to avoid waiting on a delivery hidden behind an unacknowledged question. Escalate persistent unclear failures to the debugger with a reproducer.

6. **Review the candidate.** Freeze the implementation candidate and start a fresh Codex reviewer session with the role instructions, specification, exact revision/diff and test evidence. Enforce read-only review settings. Route findings back to the owning implementer and review affected changes again. A successful worker exit is not acceptance.

7. **Integrate and verify.** Integrate accepted task changes serially into the feature branch. Run the required checks there and map results to acceptance criteria. Create dependent implementation worktrees from the newly accepted revision. Keep operational task state in Orca and concise evidence pointers in the recovery note.

8. **Finish or recover explicitly.** Report verified behavior, checks actually run and unresolved gaps. Decide whether each settled worker is reused or released. Preserve worktrees until accepted changes and evidence are safe; terminal release does not delete them. If interrupted, restart in the same integration checkout and reconcile the saved note with actual Orca/Git state before dispatching anything else. [Recovery and cleanup](https://github.com/stablyai/orca/blob/main/skill-guides/orchestration/references/recovery-and-cleanup.md)

The first repository should use a small feature to validate task delivery, an advisory round trip, independent review and interrupted-session recovery. DeepSeek High in Pi is already user-tested; this pilot checks the coordination around it. The commands and lifecycle above were checked against current Context7 and first-party documentation; they have not been executed as a full workflow here.

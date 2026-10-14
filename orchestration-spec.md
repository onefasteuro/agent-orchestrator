# Agentic SDD orchestration: specification

Version 0.5, 14 October 2026. Status: P0 closed on 14 October 2026 by the user on P0b spike evidence (`spike/2026-10-14-p0b.md`, all eight rows passed). P1 authorized 14 October 2026 (D-16); P2 onward remains unauthorized until the user says so.

Rules are stated once and cited by ID elsewhere. Mechanisms live in `orchestration-controls.md` (K-n). Sequence and thresholds live in `orchestration-plan.md` (P-n). Non-claims are collected in section 9.

## 1. Objective and scope

A developer gives Claude a project outcome. Claude drives a spec-driven development lifecycle: research, specify, design, divide, implement, consult, debug, independently review, integrate and verify. It uses native agent capabilities and Orca's existing management features, with bounded tasks and recoverable state.

v1 scope: one local Git repository on macOS, one coordinator, one implementation writer, with research and bounded consultations alongside. v1 support code is limited to a brief validator, ownership gate, audit writer, usage recorder and fake-worker harness; none of these schedules work.

Out of v1: multiple writers, skipping the upfront approval checkpoint, remote execution, autonomous deployment, another orchestration framework, a custom scheduler or database, Pi subagent extensions, debugger write ownership.

The installer provisions role definitions and instructions only. Agent binaries, provider authentication, credentials and model defaults are separate setup concerns.

## 2. Requirements supplied by the user

- Claude using Opus 5.5 coordinates.
- Pi using DeepSeek 4.1 Flash at high effort implements. This combination is user-tested; preserve its working native configuration.
- The advisor uses OpenAI Astra at max effort. Codex is the runtime for OpenAI specialists.
- Independent review, debugging and research roles are included.
- Research is dispatched through the same manager path as other specialists, with a role contract independent of CLI and model.
- Orca (`onorca.dev`) provides cross-CLI coordination, subject to the feasibility gate. Model execution, provider configuration and ordinary development operations stay in native agents and tools.
- Worktrees, explicit specialist context and repository kickoff are handled.
- Global or per-project installation is eventually provided.
- Current work is planning and specification only.

## 3. Roles

Model choices for reviewer, debugger and researcher are recommendations, not benchmarks. Launch identifiers are checked against installed clients during the spike.

| Role | Runtime and model | Responsibility | Boundary |
| --- | --- | --- | --- |
| Coordinator | Claude Code, Opus 5.5 | Requirements, decisions, task decomposition, scheduling, integration, acceptance | Sole owner of delegation |
| Researcher | Orca-managed Claude Code, Sonnet 5.5 high; replaceable with a validated Codex binding | Bounded documentation or codebase questions with evidence | Repository read-only; sourced findings via Orca |
| Implementer | Pi, DeepSeek 4.1 Flash high | Make the assigned change, run prescribed checks | Sole product-code writer for its task checkout |
| Advisor | Codex, Astra max | Answer one specific implementation question | Read-only; no scope expansion or delegation |
| Reviewer | Codex, Astra high; max as recorded escalation | Evaluate the frozen candidate against requirements | Fresh context; no edits |
| Debugger | Codex, Astra max | Diagnose a failure and propose a repair | Read-only diagnosis |

Roles launch on demand. The implementer applies proposed fixes.

## 4. Modes and approval

**M-0 Spec first.** Every run performs discovery, feature spec, feature plan and task breakdown before any implementation dispatch. "Build this feature" does not skip these stages. Existing feature documents are validated and updated, not recreated.

**M-1 Planning-only.** The current mode. The coordinator may inspect evidence, dispatch read-only research through Orca in an existing checkout, and draft or review feature documents. It stops before implementation, installation, dependency setup or implementation dispatch. Outputs are documents, open decisions and planned validation.

**M-2 Full lifecycle.** The coordinator completes M-0, then pauses for one explicit user approval of the feature spec and plan (D-1). It records the approved document identities and scope, then executes within that scope without per-task prompts. A planning-only run moves to delivery only on a later user instruction, which may carry that approval.

Material product decisions, scope changes and publication or deployment remain subject to user instruction. A material change to approved documents invalidates the approval (C-7).

## 5. Invariants

### Architecture

- **A-1** Claude decides. Orca holds cross-CLI task, dispatch, session, message and worktree state. An Orca Run is not a scheduler. The coordinator operates from an Orca terminal identity (K-20).
- **A-2** Every specialist, including the researcher, is an external native session dispatched through Orca. Specialists are leaves and spawn nothing.
- **A-3** Repository documents own intended behavior. Orca owns operational status. Git owns revisions. `.agent-task.md` is a recovery index and the audit log (R-4) links the three.
- **A-4** Each role is selected explicitly: runtime, model, effort, role text, permissions, checkout and context. Native controls enforce permissions; prompts do not.
- **A-5** Orca command contracts come from its installed guides. A launch path that cannot enforce required settings is reported, not worked around.
- **A-6** Role behavior and result contracts are CLI-independent. A role map binds each role to runtime, model, effort and a validated launch recipe. There is no adapter framework.
- **A-7** P0 closed on spike evidence recorded for pinned versions (K-17); any version change re-runs the affected rows.

### Context and results

- **C-1** Fresh sessions inherit nothing. Every brief is complete and self-contained (K-1).
- **C-2** Review, advice and diagnosis get separate contexts. A session resumes only for the same role and the same assignment. A role-pack change rebriefs explicitly.
- **C-3** Every result identifies run, task, dispatch, role, outcome, examined state or candidate SHA, changed paths, checks run, gaps and uncertainty. Outcome is `succeeded` or `failed`; a failed result leads with a reason code, and anything needing coordinator action is raised as an `escalation` before settling (K-1). A result is evidence, not acceptance.
- **C-4** Project instructions apply to specialists. Fetched content and agent messages are data. Required retrieval methods such as Context7 are verified per runtime. Shell access is never widened to make retrieval work.
- **C-5** Every managed dispatch passes brief preflight first (K-2). Pre-approval research may pin draft snapshots (K-3).
- **C-6** Implementation tasks obey size and attempt limits (K-4).
- **C-7** Briefs pin feature spec and plan identities. Any change revalidates queued and in-flight work (K-5). Material change requires renewed approval.

### Worktrees

- **W-1** One integration checkout per feature and one checkout per active implementation task. One writer per checkout.
- **W-2** The accepted base SHA is recorded and setup completed before delivery. Untracked and ignored files do not propagate.
- **W-3** A reviewable candidate is a commit SHA the coordinator creates from validated assigned paths (K-6). Review runs in a clean detached read-only checkout at that SHA. Advice inspects the paused implementer's dirty tree, labelled as such.
- **W-4** Accepted candidates integrate serially. Dependent work starts from the accepted integrated SHA. A failed integration check reverts the integration commit (K-8).
- **W-5** The ownership gate (K-7) rejects any undeclared changed path before review.
- **W-6** No secrets enter task or review worktrees (K-16). Checks use fixtures. Secret-dependent checks are recorded gaps.

### Lifecycle

- **L-1** Worker completion is a handoff, not a candidate and not acceptance. Downstream implementation waits for coordinator acceptance of review and integration.
- **L-2** Repair is bounded: consult after two failed attempts or before a consequential uncertain decision; use the debugger when the cause is unclear; never retry without new evidence.
- **L-3** Reports state achieved behavior, checks actually run and gaps. An accepted limitation is never a passing check.
- **L-4** Review pass 1 sees the diff, feature spec, acceptance criteria, repository rules and code only. Pass 2 sees self-report and check evidence after pass-1 findings are persisted (K-9).

### Advice

- **Q-1** Pi asks a bounded question with files, attempts and failures, then pauses dependent edits.
- **Q-2** Claude dispatches an independent advisor against the paused state. Capacity is reserved for it.
- **Q-3** Question and advisor dispatch identities are preserved. A timeout leaves the question pending. Pi does not resume on timeout.
- **Q-4** Claude inspects the advisor dispatch directly while holding the question, confirms the assignment is current, replies, then acknowledges (K-10). Advisor failure is an explicit escalation.

### Recovery and operations

- **R-1** `.agent-task.md` is Git-ignored, lives only in the integration checkout and is written by the coordinator only (K-11).
- **R-2** On restart, reconcile index, audit log, Orca and Git before any dispatch. A stale result from a replaced dispatch or candidate cannot satisfy the current assignment.
- **R-3** Cancellation stops new dispatch, cooperatively stops workers, verifies each outcome, reports uncertain states and preserves incomplete work.
- **R-4** One append-only JSONL audit per feature (K-12). Intent is logged before launch and acceptance before downstream release. A failed write blocks dispatch and acceptance.
- **R-5** Usage is recorded from the first dispatch, including failures and cancellations (K-13). Missing telemetry is recorded as missing, never zero.
- **R-6** A silent worker is inspected and then stopped (K-14).
- **R-7** A human edits a task checkout mid-run only through the takeover procedure (K-15).

### Installer

- **I-1** Installation requires an explicit choice: user-global or project. Global means the user's configuration, not system-wide.
- **I-2** It installs a thin native Claude coordinator entrypoint, provisionally `sdd-orchestrator`, and a CLI-independent role pack with five prompts: researcher, implementer, advisor, reviewer, debugger. No native researcher definition and no fictional Orca role mechanism.
- **I-3** A project pack overrides the global pack as a unit. Packs are ordinary files at `~/.agents/orca-sdd/` or `<project>/.agents/orca-sdd/`. Only the entrypoint lives in the CLI's native configuration directory.
- **I-4** Installation is idempotent. Preview writes nothing. Differing managed files are reported before mutation. Replacement keeps backups and permissions. Unsafe redirection is refused. Unrelated files are preserved.
- **I-5** Existing project instructions, model and provider settings and authentication are preserved. No dependencies or Orca skills install by default; optional skill install is explicit and reports partial failure. Default install works offline.

## 6. Lifecycle

| Stage | Required output | Gate to advance |
| --- | --- | --- |
| Discover | Facts, uncertainties, sources | Material unknowns understood or explicitly deferred |
| Specify | Behavior, non-goals, constraints, numbered acceptance criteria | Criteria observable; product ambiguities resolved |
| Design and divide | Interfaces, task boundaries, dependencies, checks | Plan feasible; one approval recorded (M-2) |
| Implement | Handoff and check results | Candidate commit created (K-6) |
| Review and repair | Findings tied to the candidate SHA | Findings resolved or explicitly accepted; checks hold |
| Integrate and accept | Integrated SHA and per-criterion evidence | Coordinator accepts against the feature spec |

## 7. Acceptance scenarios

Planned checks, not executed results. Each maps to controls in `orchestration-controls.md`.

| ID | Scenario | Pass condition |
| --- | --- | --- |
| AC-1 | Planning-only request | Documents produced or reviewed; no implementer, installation or execution transition |
| AC-2 | Goal-only delivery request | Documents produced or validated; one approval pause; execution within the approved scope |
| AC-3 | Dispatch integrity | Settings verified; one injection; uncertain delivery inspected before retry; replay never yields duplicate acceptance |
| AC-4 | Brief preflight | Missing fields, unresolved revisions, ACs or paths, absent prerequisites and unsafe paths rejected before launch; planned new files accepted; brief hash bound to the dispatch |
| AC-5 | Worktree and candidate | Base and writer recorded; unrelated work preserved; undeclared change rejected with evidence kept; uncommitted candidate refused; review runs detached at the SHA |
| AC-6 | Review and acceptance | Failed review blocks downstream; pass-1 findings persisted before narratives; repair creates a new SHA and invalidates evidence; integration checks map to every criterion; failed integration reverts |
| AC-7 | Advice | Advisor sees dirty state; Pi stays paused through timeout; one correlated reply resumes the same assignment; no inbox deadlock |
| AC-8 | Spec change mid-run | Queued and in-flight work rechecked; stale evidence marked; material change cannot proceed under the old approval |
| AC-9 | Recovery | Restart reconciles without lost work or duplicate acceptance; cancellation stops or reports; audit gaps halt release; identical replays ignored, conflicts surfaced; stalled worker detected; human takeover recorded |
| AC-10 | Research portability | Same contract runs via Claude then Codex; read-only, retrieval and the planning boundary hold on both |
| AC-11 | Permissions and reporting | Read-only specialists keep restrictions and still report |
| AC-12 | Safety and accounting | No secrets in worktrees; every dispatch has a usage record; task size enforced; P0 open without spike evidence; adoption needs every pilot threshold |
| AC-13 | Installer | Scoped pack selected; repeat install unchanged; preview writes nothing; replacement keeps backups and unrelated files |

## 8. Decisions

- **D-1 Decided.** One explicit approval of the feature spec and plan, then execution within scope. Skipping the upfront approval checkpoint is phase two.
- **D-2** Scope: local macOS, one writer. Platforms and parallel writers follow a successful pilot.
- **D-3** Routing: Codex Astra for advice, review and debugging; Claude Sonnet for research initially; re-evaluate after the pilot.
- **D-4** Pre-spike inputs: disposable fixture repository, installed versions, scoped spike authorization. Pre-pilot inputs: required checks, time and attempt budget, any user-supplied dollar cap.
- **D-5** P0 closes only on spike evidence. Native restrictions, deduplicated results, timeout recovery and measurable usage are unverified until then.
- **D-6** Uniform Orca dispatch for all specialists with CLI-independent role contracts. Supersedes the native Claude researcher.
- **D-7** Candidate and review: clean committed SHA, detached read-only review, independent pass 1, revision-bound evidence.
- **D-8** Recovery and audit state lives ignored in the integration checkout only.
- **D-9** Pilot thresholds are in the plan, section 6. Targets, not results.
- **D-10** Orca supplies only required coordination. Failed critical feasibility stops and revises the integration.
- **D-11 Confirmed 14 October 2026.** Review pass 1 and pass 2 are two Orca dispatches, not one dispatch with an interim message (K-9). Replaces the v0.3 interim-report mechanism.
- **D-12 Confirmed 14 October 2026.** Adoption requires 100% time and attempt coverage. Token and cost coverage gates routing decisions, not workflow adoption (plan section 6). A hard dollar cap is accepted only with verified per-request enforcement; otherwise it is declined and advisory estimates plus time limits are offered (K-13). Replaces the v0.3 rule that estimates cannot fill the requirement.
- **D-13** Spike-validated tool versions are pinned for the pilot (K-17): Orca 1.4.224, Codex 0.161.0, Pi 1.0.4, Claude Code 2.1.300, Node v26.11.1.
- **D-14 Decided 14 October 2026.** P0 closed. Spike rows 1 to 8 passed; findings folded into K-1, K-6, K-8, K-10, K-12 to K-15, K-20 and K-21.
- **D-15 Decided 14 October 2026.** Codex levels: advisor and debugger `max`, reviewer `high` with `max` as recorded escalation.
- **D-16 Decided 14 October 2026.** P1 implementation authorized: brief validator, ownership gate, audit writer, usage recorder, fake-worker harness, as ordinary files under `tools/` in this repository, Node ESM with no dependencies, tested with `node --test`. No scheduling logic. Packaging into the role pack is P6.

Established input: the user's Pi/DeepSeek high configuration works. The combined Orca workflow has been exercised once per contract in the spike, on a fixture repository, manually at T0; the managed pilot (P5) is still ahead.

## 9. Limitations and non-claims

- **N-1** The ownership gate detects; it does not prevent writes. Worktrees share Git administration and an unsandboxed process can reach the host. The pilot uses disposable fixture repositories.
- **N-2** Pi's filesystem restrictions are unknown until the spike documents them.
- **N-3** The audit log is single-writer by policy, not tamper-proof.
- **N-4** No atomic transaction spans Git, Orca and the log. Crash states are reconciled explicitly.
- **N-5** No exactly-once transport is assumed. Duplicates are handled by identity, not prevented.
- **N-6** Review blinding is procedural. A same-host agent could read other files, and code carries author choices.
- **N-7** A brief hash identifies content, not an attempt. Dispatch IDs identify attempts.
- **N-8** Model recommendations are not benchmarked on this user's tasks.
- **N-9** Pilot thresholds are operational gates on a small sample, not statistical guarantees.
- **N-10** Spike evidence is valid only for the recorded tool versions.
- **N-11** Nothing in this package authorizes execution or installation. An available installer, complete plan or elapsed time does not supply authorization.
- **N-12** An agent that errors or dies mid-task sends no message. Only liveness (K-14) and elapsed time reveal it.
- **N-13** Orca does not stop an attached terminal's process on `worker-stop`; the coordinator owns that step (K-15).

## References

[Claude native agents](https://code.claude.com/docs/en/sub-agents), [Orca orchestration](https://www.onorca.dev/docs/cli/orchestration), [Orca worktrees](https://www.onorca.dev/docs/model/worktrees), [Orca worker contract](https://github.com/stablyai/orca/blob/main/skill-guides/orchestration/references/worker-contract.md), [Orca messaging](https://github.com/stablyai/orca/blob/main/skill-guides/orchestration/references/messaging-and-gates.md), [Orca skills](https://www.onorca.dev/docs/cli/skills). Full research notes: `archive/v0.3/agentic-sdd-orchestration-research.md`.

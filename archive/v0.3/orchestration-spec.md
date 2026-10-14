# Agentic SDD orchestration — draft specification

Version: 0.3 · Date: 14 October 2026 · Status: **Draft; P0 remains open pending an authorized feasibility spike. Implementation is deferred.**

This specification defines the intended behavior. `orchestration-plan.md` defines the sequence, feasibility gate and numeric pilot criteria; `orchestration-contracts.md` defines the brief, audit and validation contracts. Earlier research is supporting evidence. The generated installer and execution runbook are unadopted prototypes; their existence does not approve the design or authorize installation.

## 1. Objective and boundaries

Enable a developer to give Claude a project outcome and have it drive a spec-driven development lifecycle: research, specify, design, divide work, implement, consult, debug, independently review, integrate and verify. Use native agent capabilities and Orca's existing management features, with clear task boundaries and recoverable state.

The first version targets a local Git repository on macOS, one active coordinator and one implementation writer. Research and bounded consultations may run alongside it. Multiple writers and automatic continuation past the planning approval are phase-two candidates. Remote execution, autonomous deployment, another orchestration framework, a custom scheduler/database, and Pi subagent extensions are outside the initial scope. A brief validator, candidate ownership check and append-only audit writer are the limited local utilities required for v1; they must not become another task manager.

The installer provisions role definitions and supporting instructions. Installing native agent binaries, authenticating providers, changing credentials, and altering existing model defaults are separate setup concerns.

## 2. Requirements supplied by the user

- Claude using Opus 5.5 coordinates the project.
- Pi using DeepSeek 4.1 Flash at high effort implements. This combination is already tested by the user; preserve its working native configuration.
- The advisor uses OpenAI Astra at max effort. Codex is an acceptable runtime for OpenAI specialists, avoiding dependence on Pi subagents.
- Include independent review, debugging and research roles.
- Dispatch research through the same manager path as other specialists, keeping its role contract independent of the selected CLI/model.
- Use Orca (`onorca.dev`) for the required cross-CLI coordination, subject to the feasibility gate. Keep model execution, provider configuration and ordinary development operations in the native agents and tools.
- Handle worktrees, explicit specialist context and repository kickoff.
- Provide eventual global or per-project installation.
- Current work is planning and specification only. Implementation will happen later.

## 3. Proposed role baseline

Model choices for reviewer, debugger and researcher are recommendations, not comparative benchmark results. Exact launch identifiers must be checked against installed clients during implementation.

| Role | Runtime and proposed model | Responsibility | Boundary |
| --- | --- | --- | --- |
| Coordinator | Claude Code / Opus 5.5 | Own requirements, decisions, task decomposition, scheduling, integration and acceptance | Sole owner of delegation |
| Researcher | Orca-managed Claude Code / Sonnet 5.5 high initially; replaceable with a validated Codex/model binding | Resolve bounded documentation or codebase questions with evidence | Repository read-only; return sourced findings through Orca |
| Implementer | Pi / tested DeepSeek 4.1 Flash high | Make the assigned change and run prescribed checks | Sole product-code writer for its task checkout |
| Advisor | Codex / Astra max | Answer a specific implementation question | Read-only; no task expansion or delegation |
| Reviewer | Codex / Astra high; max for complex reviews | Independently evaluate the frozen candidate against requirements | Fresh role context; no edits |
| Debugger | Codex / Astra max | Diagnose a reproducible or unclear failure and propose a repair | Read-only diagnosis in the first version |

The implementer applies proposed fixes. Transferring writing ownership to the debugger is deferred until there is evidence it is needed. Roles are launched on demand, rather than maintained as six permanent sessions.

## 4. Operating modes and authorization

**M-0 — Specification and planning come first in every development run.** The user supplies a goal, constraints and available references; the orchestrator owns discovery, drafting the specification, developing the plan and dividing it into bounded tasks. Only then may it dispatch implementation. A request such as “build this feature” does not skip these stages. If specifications/plans already exist, validate and update them rather than recreating them unnecessarily. The user is not required to author them beforehand.

**M-1 — Planning-only.** The coordinator may inspect evidence, dispatch bounded researchers through Orca, draft specifications/plans and review those documents. Research uses an existing checkout and requires no implementation worktree or product dependency setup. It must stop before product implementation, installation, dependency setup or dispatch of implementation workers. Outputs include open decisions and planned validation, not claims of delivered functionality. This is the current mode.

**M-2 — Full lifecycle.** The coordinator works through M-0, presents the feature specification and plan, and pauses for one explicit user approval before implementation. Record the approved specification/plan identities and scope. The request to build a feature does not waive this v1 checkpoint. A planning-only request also requires an instruction authorizing its transition to delivery; that instruction may supply the same single approval rather than creating a duplicate prompt.

**D-1 — Decided:** pause for one specification/plan approval. Automatic continuation is a phase-two feature, contingent on pilot evidence and a later user decision. This settles the policy, not approval of the current architecture or authorization to run its spike.

Routine task assignments, read-only investigation and bounded repair should not each create an additional approval gate. Material product decisions, scope changes and separately controlled publication/deployment actions remain subject to the user's instructions.

## 5. Native architecture and authoritative records

**A-1.** Claude decides and supervises. Use Orca for cross-CLI task/dispatch state, session lifecycle, messaging and worktree management. Specification drafting, code/research tools, model/provider settings and ordinary Git operations remain native agent/tool responsibilities. An Orca Run is not an autonomous scheduler; routine tool operations do not need separate managed tasks.

**A-2.** All specialists—including the researcher—are external native sessions dispatched and supervised through Orca. They share the same task/context/result lifecycle and are leaves that do not spawn additional agents. There is no Claude-native researcher exception. Claude remains the selected coordinator for the initial implementation.

**A-3.** Store behavior, accepted design decisions and acceptance criteria in repository documents. Orca owns operational task status. Git owns code revisions. `.agent-task.md` is a recovery index pointing to those records, not a second task queue.

A per-feature append-only JSONL audit links these records through identities, hashes and timestamps. It records observed events and decisions; it neither schedules work nor overrides actual Git/Orca state. See R-4 and the contracts appendix.

**A-4.** Select each role explicitly: runtime, effective model/effort, role text, permissions, worktree and task context. Orca's runtime selection alone does not assign a semantic role. Native controls must enforce read-only specialist restrictions. Pi's actual filesystem restrictions are unverified: the spike must document what it can and cannot enforce. Never present a role prompt or worktree as a sandbox. Irrespective of Pi's native restrictions, W-5 mechanically rejects out-of-assignment candidates before review.

**A-5.** Load current Orca command contracts from its installed official guides. Preserve native permission controls. If the documented launch/attachment path cannot enforce required settings, report the limitation instead of silently weakening them.

**A-6.** Keep role behavior, required capabilities and output contracts independent of CLI/model selection. A small role map binds each role to its runtime, model/effort and documented native launch settings. Swapping a researcher from Claude to Codex changes that binding and its validated launch settings, not the SDD workflow or research task contract. Native tool names, authentication, permission controls and CLI flags remain runtime-specific; do not introduce a universal adapter framework. The coordinator's native startup definition remains Claude-specific in the first version, so replacing the coordinator itself would require separate startup/capability validation.

**A-7 — Feasibility before baseline closure.** P0 cannot close until a separately authorized, at-most-one-working-day spike demonstrates Pi task injection, effective Codex read-only controls, correlated completion with duplicate-safe acceptance, and timeout/resumption of an advisor question on installed versions. It must also characterize Pi restrictions and available native usage telemetry. A failed or inconclusive critical check leaves P0 open and triggers redesign. Planning this spike does not authorize executing it.

For that bounded P0 spike only, manual preflight and manual append-only receipts/usage capture are sufficient. It must not depend on building the automation whose feasibility it tests. Automated C-5/W-5/R-4 checks are required before managed pilot runs; the spike records their cases and observed outcomes directly.

## 6. Specialist context and result contracts

**C-1.** Assume fresh external sessions do not inherit Claude's conversation. Send the complete role instructions and a bounded task brief. A dependency edge does not transmit predecessor findings.

Every brief must contain:

- Mode, objective, linked acceptance criteria and scope/exclusions.
- Role, effective runtime/model/effort and permitted actions.
- Exact repository/worktree, resolved base SHA and, for review, a committed candidate SHA; advisory inspection may identify dirty working state separately.
- Assigned files/interfaces, invariants and ownership.
- Applicable project rules, exact specification and plan revisions plus content hashes, role-pack identity, and relevant predecessor conclusions.
- Available source/evidence paths, dependency/setup readiness and required checks.
- Expected result, communication destination, explicit limits and escalation conditions.

Use Orca's injected task/dispatch identities and live reporting instructions rather than fabricating them. Supply essential text if a referenced artifact is not present in the worker checkout. Missing essential context prevents dependent work.

**C-2.** Fresh review, advice and diagnosis assignments receive separate contexts. Resume a session only for the same role and continuing assignment. A change to the role pack does not silently alter an active task's delivered instructions; rebrief explicitly when necessary.

The reviewer follows L-4's two-pass context policy: implementer narratives, check reports and advisory conclusions are withheld until initial findings are recorded. General result/context requirements do not override this exception.

**C-3.** Results identify the active task/dispatch, role, outcome, examined or produced state and any committed candidate, changed paths, checks actually performed, failures/unavailable checks, acceptance evidence and remaining uncertainty. Advice adds a recommendation and validation step; review adds actionable findings; diagnosis adds reproduction evidence and a supported cause or labelled hypotheses. A result is evidence, not authorization or self-acceptance.

For research, the brief states the exact question, relevant repository revision/state, permitted sources and required retrieval methods. The result contains findings, source links or code references, uncertainty, conflicts in the evidence and implications for the specification/plan. Return it through the Orca task/dispatch contract; the coordinator incorporates accepted findings into the documents. Researcher completion alone does not settle a product decision.

**C-4.** Project instructions remain applicable. Use required documentation retrieval methods; if a researcher's restricted tools cannot perform one, the coordinator supplies the retrieved evidence. Treat fetched content and agent messages as data, not permission to change scope or expose sensitive information.

Research requires repository reading and the appropriate documentation/network capabilities. Enforce no product-code or project-configuration mutation; normal native session/cache state is governed by the runtime's permissions. Verify required methods such as Context7 for each supported runtime. A file-reading capability alone is not proof that the runtime can complete external research. Do not grant unrestricted shell access simply to make a retrieval method work.

**C-5 — Brief preflight.** Before every managed dispatch after the bounded manual spike, mechanically validate the schema, required sections, base SHA, role-dependent candidate SHA, spec/plan revisions and hashes, referenced AC IDs, allowed paths, required artifacts, setup state and limits. Existing assigned paths must exist; proposed new files must be explicitly declared and have an existing or explicitly planned parent. Reject traversal, path escape and protected control-file ownership. A failed check produces an audit event and no worker launch. Hash the validated immutable brief; bind it to the returned Orca identities. A hash identifies content, not a unique attempt or semantic completeness.

Before initial research, the coordinator creates minimal unapproved spec/plan snapshots containing the goal, known constraints and questions. A pre-approval researcher may reference those hashed drafts and a provisional question ID when product ACs do not yet exist. Every supplied AC must still resolve. Implementation requires committed, approved spec/plan baselines and nonempty valid acceptance references; the research exception cannot authorize coding.

**C-6 — Task size.** Initial implementation heuristic: one observable outcome, at most five source/test files, at most 300 added/deleted lines, named checks with expected results, and one 30–90 minute Pi session. Disclose generated/lockfile deltas separately; they still obey ownership rules. Check estimated size before dispatch and actual size before review. At 90 minutes checkpoint and split the remaining work; do not create unlimited fresh attempts. A justified exception must be named in the approved plan or approved as an amendment, with explicit revised limits. Read-only roles use a bounded question and their own time/attempt limits.

**C-7 — Specification drift.** Record immutable spec and plan identities in every brief, including research and review. Any change marks queued briefs as needing revalidation and checkpoints in-flight work before further edits or acceptance. The coordinator assesses every affected task, records compatibility or invalidation, and issues revised briefs/dispatches where needed; do not mutate a live brief silently. Material changes to behavior, acceptance criteria, ownership or scope require renewed approval. Nonmaterial corrections may retain approval only with a recorded rationale and new document identities. Recheck identities before accepting results; old evidence cannot silently satisfy new requirements.

## 7. Worktree contract

**W-1.** Use one feature integration checkout and one checkout per active implementation task. Worktrees belong to tasks, not personas. Only one product-code writer may own a task checkout at a time.

**W-2.** Record the exact accepted base commit and complete required setup before task delivery. A visual parent/child relationship does not establish the Git base. Fresh worktrees need committed instructions/specifications or explicitly supplied equivalents; untracked files and ignored dependencies do not propagate automatically.

**W-3 — Candidate identity.** A reviewable candidate is a commit SHA on the task branch, with its accepted base SHA recorded. Staged, unstaged or nonignored untracked changes make that checkout unready for review; preserve them rather than automatically discarding or committing them. The coordinator checks W-5 before candidate submission. Review takes place in a separate clean, detached checkout at the candidate SHA with read-only native controls, never against a moving branch name. Dependencies and declared scratch output must not silently supply uncommitted source. A repair creates a new SHA and invalidates affected review/check evidence.

The implementer hands off its working changes and pauses. After ownership inspection, the coordinator explicitly stages only validated assigned paths and creates the candidate commit as the prescribed lifecycle step. It never commits arbitrary changes merely to obtain a clean status. The coordinator owns staging, task-branch candidate commits and integration; direct changes to Git configuration, hooks or shared administrative files remain prohibited to workers. A repair handoff uses a new dispatch and produces a new candidate SHA.

The implementation task retains its writing checkout through repair. The read-only detached review checkout is an inspection of the task's immutable candidate, not another writing owner. Advice is deliberately different: pause Pi and let the advisor inspect its dirty/new files, identifying that transient state explicitly.

The researcher normally reads the existing integration or relevant task checkout without receiving writing ownership. Identify the revision and any relevant uncommitted state so its findings are tied to the evidence it examined; a separate researcher process does not require a separate worktree.

**W-4.** Integrate accepted task changes serially, then start dependent work from the accepted integrated revision. Preserve incomplete work and evidence. Releasing a terminal is separate from removing a worktree; cleanup must not discard unintegrated changes.

**W-5 — Mechanical ownership gate.** Compare the complete base-to-candidate change set and current working state against the coordinator-owned, immutable assignment. Any undeclared changed path rejects the candidate before reviewer dispatch. Inspect additions, deletions, mode changes, symlinks, submodules and both sides of renames, plus staged/unstaged/untracked state and unexpected ignored artifacts. Exact path rules and protected exclusions take precedence over broad directory permissions. SPEC/PLAN documents, project instructions, role packs, recovery/audit files and Git administration are never implementer-owned. Setup/check caches require explicit bounded declarations; they cannot hide changed source. Recheck protected integration documents against their recorded hashes. Preserve violating work and report it; do not silently reset it to pass.

This is a detection/acceptance control, not prevention of every filesystem write. Worktrees share Git administration, and an unsandboxed process may access the host or other checkouts. The spike must expose those limits; the initial pilot uses disposable fixture-only repositories. Do not claim that this gate protects against a hostile process with the same host privileges.

**W-6 — Secrets and checks.** Do not copy, write, symlink or mount secrets, real `.env` files or production/staging credentials into task or review worktrees. Setup uses synthetic fixtures and nonsecret example configuration. Existing native provider authentication stays in its approved store outside the repository; never forward it into test processes, briefs or logs. Required pilot checks run with fixtures and no live service credentials. If a required acceptance check needs a secret-backed system, mark it unmet and defer it to a separately authorized environment; do not relabel it as passing.

## 8. Lifecycle and acceptance

| Stage | Required output | Gate to advance |
| --- | --- | --- |
| Discover | Relevant facts, uncertainties and source references | Material unknowns are understood or explicitly deferred |
| Specify | Behavior, non-goals, constraints and numbered acceptance criteria | Criteria are observable; product ambiguities are resolved |
| Design and divide | Interfaces, task boundaries, dependencies and checks | Plan is feasible; execution authorization follows the chosen policy |
| Implement | Bounded candidate and check results | Candidate is identifiable and ready for independent review |
| Review/repair | Findings or no-findings report tied to the candidate | Findings are resolved or explicitly accepted; required checks hold |
| Integrate/accept | Integrated result and criterion-by-criterion evidence | Coordinator confirms acceptance against the specification |

**L-1.** A successful worker exit or Orca completion supplies an outcome/handoff; it neither creates a reviewable commit by itself nor accepts the work. The coordinator validates ownership and creates the candidate commit before review. Downstream implementation remains blocked until the required review/integration outcome has been accepted by Claude. The implementation must map this gate onto supported Orca task/dependency behavior.

**L-2.** Repair is bounded. Proposed initial rule: consult before a consequential uncertain design decision or after two unsuccessful repair attempts; use the debugger when the cause remains unclear. Repeated failure without new evidence requires a new diagnosis or a surfaced blocker, not indefinite retries.

**L-3.** Report achieved behavior, checks actually run and limitations. Unavailable checks remain explicit gaps. Human acceptance of a limitation must not be represented as a passing check.

**L-4 — Independent first review pass.** Supply the clean base/candidate diff, pinned specification and ACs, plus neutral checkout/role metadata and applicable repository rules needed to inspect the code. Withhold implementer self-report, claimed checks, advisor conclusions, previous verdicts and plan rationale until the reviewer records initial findings/no-findings tied to the SHA. The reviewer may inspect source and tests at that SHA. The first-pass report is interim; the coordinator persists it before providing the withheld evidence for pass two. Only the final combined report is the terminal dispatch result. Retain both records. Avoid leaking narratives through the prompt, commit-message summaries, injected context, recovery note or audit log. This is procedural separation, not a guarantee that a same-host agent cannot access other files.

## 9. Advice during an active task

**Q-1.** Pi asks the coordinator a bounded question with relevant files, attempted approaches and observed failures, then pauses dependent edits.

**Q-2.** Claude starts an independent Codex Astra max consultation against the paused task's actual state. The advisor has no dependency on implementation completion, and capacity must remain available for it.

**Q-3.** Preserve the original question and advisor-dispatch identifiers. An ask timeout leaves the question pending and does not permit Pi to resume. Avoid duplicate questions, prompts and dispatches when delivery is uncertain.

**Q-4.** While holding the original unacknowledged question, inspect the advisor dispatch directly instead of expecting another consuming inbox check to skip the held delivery. Confirm the implementation assignment is still current, reply to the original question, then acknowledge the delivery. Advisor failure must become an explicit failure/escalation outcome.

“Mid-turn” means consultation at a supported tool/message boundary within the ongoing task, not interruption of a model's hidden reasoning.

## 10. Recovery and cancellation

**R-1.** The recovery index records mode, specification/plan reference, authorization scope, selected role pack, Orca run and dispatch/session identifiers, worktree locations, accepted revision, pending question IDs, evidence pointers and next action.

It is ignored and lives only at `<integration-checkout>/.agent-task.md`; it is never committed or copied into task/review worktrees. Record its absolute path and the integration checkout in the Orca run record or supported run note, and in the dispatch envelope (withhold recovery content from review pass one). The coordinator writes it. Verify the ignore rule before the first run and preserve this checkout/state before cleanup.

**R-2.** On restart, reconcile the index with actual Git and Orca state before dispatching. Identify active workers and pending messages first. A stale result from a replaced dispatch or different candidate cannot satisfy the current assignment.

**R-3.** On cancellation, stop further dispatch and cooperatively cancel or stop active workers through supported mechanisms. Verify each outcome and report any worker whose stopping state remains uncertain. Resolve or cancel outstanding consultations and retain incomplete work. Do not assume stopping one terminal also cancels every task or removes its checkout.

**R-4 — Append-only audit.** Store one JSONL event log per feature under the ignored `<integration-checkout>/.agents/orca-sdd/runs/<feature-id>/events.jsonl`. Ignore only the runtime subtree, not the versioned role pack. Every dispatch intent/receipt, brief hash, result, rejection/acceptance decision, revision change, usage update, cancellation and recovery action carries an event ID, sequence and UTC timestamp, with the relevant run/task/dispatch/document/candidate identities. The coordinator is the sole writer by policy; this is not tamper-proof storage.

Persist intent before launching and the acceptance/usage record before releasing dependent work. A failed audit write stops new dispatch or acceptance. There is no atomic transaction across Git, Orca and the log: reconcile missing receipts and incomplete trailing records explicitly after a crash, preserving evidence. Transport may replay; accept at most one terminal result per dispatch, verify its full identity tuple, and record identical replays as ignored. Conflicting duplicates or stale results require investigation. A replacement attempt has a new dispatch identity even when its brief hash matches. Receipt, task completion and acceptance are separate events.

**R-5 — Usage from the first dispatch.** Instrument the feasibility spike and every subsequent dispatch, including failures/cancellations and coordinator usage attributable to the run. Record runtime/model/effort, start/end times, elapsed time, attempts, native usage source and token/cache/reasoning categories when exposed, plus cost basis. Preserve actual, estimated and unavailable values distinctly; missing cost is not zero. Store limits before dispatch and measured final usage afterwards. If a native stream cannot expose usable token or actual-cost telemetry, record the gap and block cost-based adoption; do not silently omit that role from totals.

Cost records are required even where billing is subscription-based; use measured tokens and a clearly labelled configured-rate estimate when actual marginal cost is unavailable. The pilot cannot pass with unaccounted dispatches or unmeasurable role usage. Enforce available time/attempt limits during missing telemetry and stop new dispatch at an exhausted budget; verify active-worker stopping state. Dollar ceilings are a pre-run user budget input, not an invented universal price. Astra high remains the routine reviewer; max review is an explicitly recorded escalation, and advice/debugging are on demand.

## 11. Installer specification

**I-1.** Require an explicit choice between user-global installation and installation in an existing project. Global means the current user's configuration, not system-wide privileges.

**I-2.** Install a thin native Claude coordinator definition, provisionally named `sdd-orchestrator`, and a CLI-independent role/workflow pack. The pack includes `researcher.md` alongside implementer, advisor, reviewer and debugger prompts. No native `sdd-researcher` definition is required. All specialist role text is supplied through Orca; the installer does not create a fictional Orca role-selection mechanism.

**I-3.** Project definitions override matching global definitions as a complete pack, without a custom deep-merge scheme. Global references resolve independently of the current repository; project references remain portable across worktrees. A project-local pack must be available in the chosen base or explicitly provided to workers.

Proposed neutral pack locations are `~/.agents/orca-sdd/` globally and `<project>/.agents/orca-sdd/` locally. These are ordinary instruction files, not an assumed native discovery mechanism. Only the coordinator's entrypoint belongs in the selected CLI's native configuration directory; its references select the matching scoped pack.

**I-4.** Installation is idempotent. Preview performs no writes or external installation. Differing existing managed files are reported before mutation; deliberate replacement preserves recoverable backups and existing private permissions. Refuse unsafe destination redirection and preserve unrelated files.

**I-5.** Preserve existing project instructions, native model/provider settings and authentication. Install neither dependencies nor official Orca skills by default. Optional Orca skill installation must be explicit, use the correct executable/scope, and report partial failure accurately. Default role installation must work offline from the package.

## 12. Acceptance scenarios for the future implementation

These are planned checks, not executed end-to-end results.

| ID | Scenario | Observable pass condition |
| --- | --- | --- |
| AC-01 | Planning-only request | Produces/reviews documents; launches no implementer and performs no installation or execution transition |
| AC-02 | Fresh role dispatch | Verify intended settings and one intentional task injection; inspect uncertain delivery before retry; any replay must not cause duplicate accepted results—no exactly-once transport guarantee is assumed |
| AC-03 | Missing context/setup | Brief validator rejects missing fields, unresolved revisions/ACs/paths or absent prerequisites before any worker is launched |
| AC-04 | Worktree isolation | Exact base and writer are recorded; unrelated work is preserved; specialist reuse does not create competing writers |
| AC-05 | Advice with dirty/new files and timeout | Advisor sees the relevant state; Pi stays paused; one correlated reply resumes the same assignment without inbox deadlock |
| AC-06 | Successful worker, failed review | Downstream implementation remains undispatched until repair, review and integration meet acceptance |
| AC-07 | Candidate or dispatch changes | Identity checks and audit evidence show that stale or duplicate results cannot accept the replacement candidate or assignment |
| AC-08 | Coordinator restart | Ignored integration-only state, event log, live workers and Git are reconciled without lost work or duplicate accepted execution |
| AC-09 | Cancellation during active implementation | New dispatch stops; active workers stop or uncertain termination is reported explicitly; outstanding work is accounted for and unfinished changes remain recoverable |
| AC-10 | Global plus project installation | Correct scoped pack is selected; repeat installation is unchanged; preview writes nothing; replacement preserves backups and unrelated files |
| AC-11 | Integration | Required checks run on the integrated result and evidence maps to every acceptance criterion |
| AC-12 | Native permission and reporting compatibility | Read-only specialists retain intended restrictions while producing usable results; any communication limitation is resolved without disabling those restrictions |
| AC-13 | Full-lifecycle request with only a goal | Orchestrator produces or validates the specification, plan, task boundaries and acceptance criteria before dispatching implementation; it applies the chosen human-approval policy separately |
| AC-14 | Research backend substitution during planning | The same bounded research contract runs through Orca with Claude and then Codex by changing only routing/native launch settings; both preserve project read-only restrictions, required retrieval capabilities, sourced result delivery and the planning-only boundary |
| AC-15 | Out-of-scope Pi changes | A modification to a protected control file, undeclared file, rename destination/source or unexpected artifact rejects the candidate before reviewer launch, preserving the evidence |
| AC-16 | Immutable review candidate | An uncommitted candidate is refused; a clean task-branch commit is inspected in a detached read-only checkout at its recorded SHA |
| AC-17 | Independent first review pass | Initial SHA-bound findings are recorded before implementer/check/advisor narratives are revealed; both passes remain available |
| AC-18 | Mid-run spec/plan change | Queued and in-flight tasks are rechecked; affected briefs/evidence become stale; material changes cannot proceed under the old approval |
| AC-19 | Audit failure and replay | Missing/partial audit writes halt dependent release; restart reconciles receipts; identical results are ignored after first acceptance and conflicting duplicates are surfaced |
| AC-20 | Brief identity and new paths | Validator accepts explicitly planned new files, rejects malformed/unsafe references, and binds the immutable brief hash to each actual dispatch without confusing content with attempt identity |
| AC-21 | Secret-free worktree setup | Setup/checks use fixtures; no real secret is copied/mounted into task or review worktrees; secret-dependent unmet checks are reported as gaps |
| AC-22 | First-dispatch telemetry | Every attempt, including failed/cancelled work, has correlated usage and cost-basis records; absent actual/estimated measurements cannot appear as zero or disappear from pilot totals |
| AC-23 | Task sizing | Estimated and actual file/line limits and explicit checks are checked; oversize work is split or covered by a named approved exception; the session time limit produces a checkpoint |
| AC-24 | Feasibility and pilot closure | P0 stays open without spike evidence; adoption requires every numeric pilot gate, including seeded-defect recall, false positives, recoverability and intervention limits |

## 13. Decisions and evidence status

- **Confirmed lifecycle:** the orchestrator works through discovery, specification and planning before implementation; the user need not provide finished documents.
- **D-1, decided:** after preparing the spec/plan, pause for one explicit approval; autonomous continuation is deferred to phase two. Routine bounded work thereafter does not require repeated prompts.
- **D-2, proposed scope:** local macOS, one writer initially; other platforms/parallel writers follow a successful pilot.
- **D-3, proposed routing:** Codex Astra for advice/review/debugging, externally dispatched Claude Sonnet for research initially; evaluate quality/cost after the pilot. The researcher contract permits a validated Codex/model replacement.
- **D-4, pre-spike input:** select a disposable fixture-only repository, installed versions and scoped spike authorization. Before managed runs, record required checks and an explicit time/attempt budget plus any dollar ceiling; do not infer a price limit.
- **D-5, P0 closure gate:** the one-day Orca spike must establish required native contracts or P0 stays open. Native restrictions, correlated/deduplicated results, timeout recovery and measurable usage remain unverified.
- **D-6, architecture direction:** uniform Orca dispatch for all specialists, with CLI-independent role contracts and separate native runtime bindings. This supersedes the earlier native-Claude-researcher proposal; it does not alter the initial Claude coordinator choice.
- **D-7, candidate/review policy:** clean committed SHA, detached read-only review, independent first pass before self-report, and revision-bound evidence.
- **D-8, recovery/audit location:** ignored state lives only in the integration checkout; no task-branch pollution or assumed worktree propagation.
- **D-9, proposed initial pilot thresholds:** 10 ordinary implementation tasks, zero lost work/duplicate accepted results/accepted ownership violations, all recovery drills passing, at least 4/5 seeded defects caught including every high/critical seed, at most one false positive over five clean controls, and at most two unplanned human interventions. Full definitions and telemetry gates are in the plan; these are targets, not observed results.
- **D-10, manager scope:** Orca supplies only the required coordination capabilities. Failed critical feasibility means stop and revise the integration before further implementation.

Established input: the user's Pi/DeepSeek high configuration works. Research-backed capabilities are distinct from D-5 integration checks, which remain untested. Model recommendations have not been benchmarked on this user's tasks.

Primary references from the prior research: [Claude native agents](https://code.claude.com/docs/en/sub-agents), [Orca orchestration](https://www.onorca.dev/docs/cli/orchestration), [Orca worktrees](https://www.onorca.dev/docs/model/worktrees), [Orca worker contract](https://github.com/stablyai/orca/blob/main/skill-guides/orchestration/references/worker-contract.md), [Orca messaging](https://github.com/stablyai/orca/blob/main/skill-guides/orchestration/references/messaging-and-gates.md), [Orca skills](https://www.onorca.dev/docs/cli/skills).

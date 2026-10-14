# Orchestration contracts — draft v0.3

Date: 14 October 2026 · Status: **Specification only. No validator, logger or live spike is implemented by this document.**

These are local conventions to implement after feasibility, not native Orca APIs. Keep them in a few small utilities. Orca remains the task manager; this contract adds preflight validation, correlated evidence and acceptance checks.

The separately authorized P0 spike uses a manual checklist and manually appended measured receipts/usage, with the same correlation principles. Automation is not a prerequisite to that spike; the managed pilot requires the mechanical controls implemented afterwards.

## 1. Immutable brief

Use a versioned JSON envelope plus role/task prose. Render the worker prompt from the validated envelope and the selected role text. Persist the exact envelope and delivered role/prompt content as ignored run artifacts in the integration checkout, with hashes; do not rely on a mutable path as identity.

| Required section | Fields and validation |
| --- | --- |
| `identity` | Schema version, unique `brief_id`, role and operating mode. Orca task/dispatch IDs come from actual receipts and are bound externally; they are not invented before creation. |
| `objective` | One observable outcome, referenced AC IDs, exclusions, acceptance/result expectations. Every AC ID resolves to the pinned spec. Pre-approval research may instead use a provisional question ID when ACs do not yet exist; implementation requires nonempty valid AC references. |
| `context` | Spec/plan paths, baseline kind (`draft` or `approved`), draft snapshot identities or Git revisions, and exact file SHA-256 hashes; role-pack/role-text hash; applicable instructions and available evidence. Identities must resolve and bytes match. Implementation approval references the same committed baseline. |
| `workspace` | Repository, integration-checkout and worker-checkout paths; base commit SHA; review candidate SHA when applicable; transient-state description for dirty-tree advice; exact assigned existing/new paths; protected exclusions. |
| `execution` | Native runtime/model/effort, verified permission recipe, readiness/prerequisites, dependency conclusions, session/attempt limits and research retrieval capabilities where applicable. |
| `validation` | Named checks and expected outcomes, file/line estimate, declared generated changes and bounded scratch/output locations; secret-free fixture setup. |
| `delivery` | Required result fields, supported Orca reply/reporting route supplied at dispatch, usage/cost source, budget references, escalation rule, recovery/audit path references. Review-pass-one content exclusions apply. |

Spec and plan content must be committed before implementation dispatch; an approved Git blob/revision plus its content hash pins each file even when later code commits include unchanged copies. Before initial research, the coordinator creates minimal draft spec/plan snapshots recording known goals, constraints and questions. Research may use those versioned snapshots, explicitly marked unapproved and never sufficient to authorize implementation. A changed document means new identities and revalidation, even if the filename and AC labels stay the same.

Hash canonical UTF-8 JSON serialization of the envelope (stable key ordering/encoding), and separately hash delivered role/prompt bytes. Record the serialization version. Exclude transient timestamps and receipt-only IDs from the immutable envelope. A new attempt may intentionally reuse a brief hash; its actual dispatch ID distinguishes the attempt. The log binds run, task, dispatch, brief, prompt and document identities.

## 2. Preflight result and limits

The validator returns pass/fail with field-specific errors and the identities it checked. Failure appends `brief_rejected` and starts no worker. Passing checks syntax/references/declared boundaries; the coordinator still owns semantic completeness and adequate context.

Validate role-dependent requirements: an implementer has no candidate SHA yet; a reviewer must have one; an advisor may inspect identified dirty state. Existing assigned files must exist. New paths must be explicitly declared, normalized, inside the checkout and have an existing or explicitly planned parent. Check both rename paths. Reject `..` escapes, symlink escapes and protected paths; exact matching or explicitly bounded directory rules replace naive string-prefix checks.

Each implementation brief defaults to one outcome, five source/test files or fewer, 300 added/deleted lines or fewer, named checks and a 30–90 minute session. Generated/lockfile changes are separately disclosed, never invisible to ownership checks. One budget covers all attempts for the task; restarting a worker does not reset it. At most two failed repair attempts precede a different diagnosis. Splitting a task creates explicit child scope and consumes the remaining run budget rather than creating unlimited retries.

Required pre-run limits include task time/attempt allowance and the run's budget policy. A missing dollar cap is an explicit unset policy, not free spending or a fabricated value; measured time/attempt controls still apply. Record the available native usage source before first dispatch. A provider with no measurable tokens or actual cost must be resolved during feasibility before it can support pilot cost evaluation.

## 3. Candidate and ownership receipt

Before review, the implementer hands off and pauses; the coordinator checks ownership, stages only the validated assigned paths and deliberately commits the candidate on its task branch. Workers do not stage/commit in v1 or change shared Git administration. The coordinator then produces a receipt containing base SHA, task candidate SHA, spec/plan identities, brief hash, allowed-path digest, changed paths, cleanliness result, size result and protected-artifact hashes. Compute it from actual Git/filesystem state, not the implementer's summary.

Compare the full base-to-candidate change set: additions, deletions, mode/type changes, submodules and both ends of renames. Inspect staged/unstaged/nonignored untracked state, and unexpected ignored artifacts against the pre-dispatch setup baseline and explicit scratch declarations. Dependencies/cache output do not exempt source or control files. Any undeclared candidate path or protected-file change rejects submission before reviewer launch. Uncommitted source is not reviewable. Preserve rejected work and receipts.

The clean detached review checkout must resolve to the same candidate SHA and approved source content. Check setup inputs for nonsecret fixture-only behavior. Do not copy a dirty task tree into review. Advisor inspection of dirty state is separately labelled and cannot count as candidate acceptance.

Every terminal result carries the actual run/task/dispatch identities, brief hash, spec/plan identities, outcome, observed state, checks and gaps. The implementer's handoff may have no candidate SHA yet: identify its working diff/state, then bind the coordinator-created SHA to that handoff in a `candidate_created` event after inspection. A reviewer result must identify its exact candidate SHA. Research/advice results identify the inspected state and their evidence; no invented commit is needed for a dirty-state consultation.

The first review packet contains base/candidate identities, diff, pinned specification/ACs, repository rules and code access. It excludes implementation narratives, claimed check results, advisor conclusions, previous verdicts and coordinator approval rationales. Save interim first-pass findings before supplying those materials for pass two; emit the terminal result only after pass two. Restrict automatic reading of audit/recovery files and narrative commit summaries; repository code itself necessarily contains author choices, so this is not laboratory blinding.

## 4. Append-only event envelope

One coordinator-owned log per feature: `<integration-checkout>/.agents/orca-sdd/runs/<feature-id>/events.jsonl`. Both this runtime subtree and the integration-root `.agent-task.md` are ignored. Verify ignore rules explicitly; do not blanket-ignore the role pack. A single coordinator appends records, avoiding worker append races. This policy is not protection from another same-user process.

Every JSONL object has:

| Field group | Requirement |
| --- | --- |
| Event identity | `schema_version`, unique `event_id`, increasing per-log `sequence`, `timestamp_utc`, `event_type`, feature/local-run identifier |
| Correlation | Actual Orca run/task/dispatch IDs when available; `brief_id`, `brief_hash`, delivered prompt hash; later receipts link back to the intent event |
| Baselines | Spec/plan revisions and hashes, role-pack identity, base SHA and candidate SHA when applicable |
| Outcome | Status, decision/reason code, result hash and pointer to a sanitized artifact; human approval reference where applicable |
| Usage | Usage/cost record or correlated usage-event reference, runtime/model/effort, limits and measurement status |

Unavailable identities are explicitly null with a lifecycle reason, never fabricated. Typical events are `run_started`, `approval_recorded`, `brief_validated`, `brief_rejected`, `dispatch_intent`, `dispatch_started`, `result_received`, `result_ignored`, `candidate_rejected`, `review_pass_one_recorded`, `usage_recorded`, `acceptance_recorded`, `spec_changed`, `cancellation_requested`, `worker_stopped`, `recovery_reconciled` and `error`. This is a documented vocabulary, not another workflow engine.

Persist dispatch intent before launch; after a returned receipt append the real IDs. If the launch outcome is uncertain, inspect Orca before retrying. Log result receipt separately from validation and acceptance. Acceptance references the full run/task/dispatch/brief/spec/plan/candidate tuple and recorded review/usage evidence. Persist acceptance before dispatching downstream work. An append failure blocks further release.

Accept at most one terminal result for a dispatch; a byte-identical replay is logged as ignored. A different result under the same terminal identity is a conflict to investigate, not an overwrite. A fresh repair attempt has a new dispatch. Content hashes alone cannot detect stale work without the recorded attempt and approved-baseline identities.

After a crash, validate complete records and reconcile against Git/Orca. Detect a partial trailing JSON line, preserve it as recovery evidence and start a linked new log segment if necessary; do not silently rewrite history or treat the fragment as success. Intent without receipt and receipt without acceptance are both unresolved states. No atomic transaction across tools is claimed. Retain the ignored log/artifacts before deleting the integration checkout.

## 5. Usage and calibration evidence

Every dispatch, including failures and cancellations, gets usage lifecycle records from first launch: runtime/model/effort, start/end times, duration, attempts, native source/session identifier, available token categories, measurement status and budget state. For coordinator work, record attributable session deltas or dedicated run-session totals; do not double count worker and coordinator tokens. If only a cumulative native counter exists, record baselines and deltas for the isolated assignment.

For each cost figure record currency, actual/estimated/unavailable status, rate source/version where estimated, and subscription/billing caveats. Actual token telemetry with an explicit rate estimate can support comparison; it is not an actual invoice. Native usage absent after a failed session remains a missing measurement and blocks the pilot's completeness gate. Log gaps rather than guessing zero. During the spike, a manual append of measured native output is acceptable; automate that same verified collection path before the pilot. Do not invent instrumentation when a CLI cannot expose it.

Seeded-review calibration uses separate synthetic candidate commits and clean controls, each with pinned spec/ACs and a withheld ground-truth defect list. Never inject defects into live feature candidates or merge calibration commits. Spread five seeded defects and five clean controls across start, midpoint and end of the pilot; the reviewer uses the normal two-pass process and cannot see labels/ground truth before completing review. Score primary catch/false-positive thresholds on persisted first-pass findings; record additional valid pass-two findings separately. A human adjudicates defect matches, severity and disputed findings. A genuine unseeded defect is a valid finding; a supposedly clean control containing one must be corrected/replaced transparently, not scored as a false positive. Report counts and denominators; five seeds are a small operational check, not a statistical quality guarantee. Repeat calibration after a material reviewer model/prompt change.

All log and evidence content must be sanitized before append. Store source references, hashes, numeric metrics and minimal summaries, not raw secrets or unrestricted terminal dumps. Hashing a low-entropy secret is not sanitization. No credentials or live customer data belong in briefs, calibration fixtures, logs or worktrees.

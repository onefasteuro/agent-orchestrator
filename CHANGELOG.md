# Changelog

## v0.5, 14 October 2026

P0 closed by the user on P0b spike evidence (D-14). All eight spike rows passed on Orca 1.4.224, Codex 0.161.0, Pi 1.0.4, Claude Code 2.1.300. Receipts: `spike/2026-10-14-p0b.md`.

**Controls changed on evidence**

- K-1, C-3: outcome taxonomy. `worker_done` is `succeeded` or `failed`; failed bodies lead with a reason code; `escalation` precedes settlement when the coordinator must act.
- K-6: implementer `filesModified` is advisory (Pi omitted its main edit); the Git-computed receipt stands.
- K-8, K-15, N-13: `worker-stop` on an attached terminal returns `stop_unknown` and stops nothing; verified stop is `terminal close` with `ptyKilled`, then `worker-abandon` before `--retry-of`.
- K-10: the coordinator gets no ask-timeout signal; it computes elapsed time from the question's `created_at`. Workers resume with `ask --resume`.
- K-12: Orca delivers an identical duplicate `worker_done` as a new message and rejects conflicting ones with `inactive_dispatch`.
- K-13: telemetry sources named per runtime (Codex session rollout, Pi status bar and session, Orca none).
- K-14, N-12: liveness comes from `projection.liveness`; no heartbeats; a dead or erroring agent sends nothing.
- New K-20: coordinator must hold an Orca terminal identity (`--terminal` on `check`, `--from` elsewhere).
- New K-21: launch recipes for Codex (explicit `--sandbox read-only`, prompt handling, no `--agent codex` for read-only roles unless Agent Permissions is Manual) and Pi (terminal attach, `turnStart` unsupported).
- D-13: versions pinned. D-15: Codex advisor and debugger `max`, reviewer `high`.
- README: coordinator runs inside an Orca terminal; Codex launch example added.

## v0.4, 14 October 2026

Restructure for brevity. Guarantees preserved; mechanisms moved to a tiered controls table. Package reduced from six documents to four plus archive.

**Structure**

- `orchestration-contracts.md` merged into `orchestration-controls.md` appendices.
- Research notes and the earlier kickoff runbook moved to `archive/v0.3/`. They predate v0.3 decisions and still describe a native Claude researcher, `.claude/orca-sdd/roles/` and debugger ownership transfer. All superseded.
- Every rule stated once; other documents cite IDs.
- Inline disclaimers consolidated into spec section 9.
- Acceptance scenarios regrouped from 24 to 13.

**AC mapping, v0.3 to v0.4**

| v0.4 | v0.3 |
| --- | --- |
| AC-1 | 01 |
| AC-2 | 13 |
| AC-3 | 02, 07 |
| AC-4 | 03, 20 |
| AC-5 | 04, 15, 16 |
| AC-6 | 06, 11, 17 |
| AC-7 | 05 |
| AC-8 | 18 |
| AC-9 | 08, 09, 19 |
| AC-10 | 14 |
| AC-11 | 12 |
| AC-12 | 21, 22, 23, 24 |
| AC-13 | 10 |

**Decisions changed, need confirmation**

- D-11: two-pass review is two dispatches, not one dispatch with an interim non-terminal message. Removes an Orca feasibility dependency and fits the one-result-per-dispatch rule.
- D-12: adoption gate requires 100% time and attempt coverage; token and cost coverage gates routing decisions only. v0.3 blocked adoption on 100% actual token telemetry, which could never pass if Pi exposes no counters.

**Additions**

- K-8 allowlist amendment via the ask channel; integration failure reverts.
- K-14 worker liveness; spike row for Orca idle state.
- K-15 human takeover procedure.
- K-17 version pinning; D-13.
- K-18 fake-worker harness in P1.
- K-6 neutral candidate commit message, so pass-1 review is not leaked through `git log`.
- Spike row: Context7 under the Codex read-only profile.
- Pilot row: human time budget.
- Terminology: "feature spec" and "feature plan" for per-feature product documents.

**Codex independent review, 14 October 2026, all five findings accepted**

- K-6: ownership, size and cleanliness are re-run against the committed SHA, since commit hooks can modify and re-stage files after the pre-commit gate.
- K-8: repair after an integration revert produces a new candidate based on the current accepted SHA carrying the complete change; the old branch head is never re-merged. New pilot drill.
- K-8, K-15: an amended brief or human hand-back closes the current attempt and issues a new dispatch under the same task budget. New event `human_handback`.
- K-14: liveness clock pauses while the dispatch has an unanswered `ask`. New pilot drill.
- K-13, D-12: a dollar cap is refused or replaced by a stated conservative bound when any role lacks cost telemetry.

**Codex follow-up review, 14 October 2026, all four points accepted**

- K-8, K-15: closing a dispatch requires a verified process stop or idle state before a human edits or a replacement dispatch starts; a pending question is resolved before its terminal is reused. Orca releasing ownership does not stop a live writer.
- K-13, D-12: a hard dollar cap is accepted only with verified per-request enforcement; otherwise it is declined and advisory estimates plus time limits are offered. Removes the "conservative bound" fallback.
- README: worktree example passes `--base-branch` and confirms the SHA.
- D-1 and scope wording: "skipping the upfront approval checkpoint is phase two" replaces "automatic continuation".

**14 October 2026:** D-11 and D-12 confirmed by the user. P0b spike authorized, capped at 8 hours, fixture repository `~/Sites/orca-sdd-fixture`. Spike executed the same day: all eight rows pass; receipts and the recommended P0c decision are in `spike/2026-10-14-p0b.md`. Package changes it implies (coordinator terminal identity, attached-terminal stop semantics, Git-computed receipts, liveness without heartbeats, telemetry sources, Codex levels max/high) are not yet applied.

## v0.3, 14 October 2026

Added feasibility gate (P0a to P0c), D-1 decided, mechanical ownership gate, committed candidate SHA with detached review, two-pass review, spec drift handling, ignored recovery location, secrets rule, usage from first dispatch, task size heuristic, numeric pilot thresholds, brief preflight, append-only audit, reviewer calibration. Added `orchestration-contracts.md`.

## v0.2, 14 October 2026

Initial specification and plan. Uniform Orca dispatch for all specialists including research (D-6).

# Changelog

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

## v0.3, 14 October 2026

Added feasibility gate (P0a to P0c), D-1 decided, mechanical ownership gate, committed candidate SHA with detached review, two-pass review, spec drift handling, ignored recovery location, secrets rule, usage from first dispatch, task size heuristic, numeric pilot thresholds, brief preflight, append-only audit, reviewer calibration. Added `orchestration-contracts.md`.

## v0.2, 14 October 2026

Initial specification and plan. Uniform Orca dispatch for all specialists including research (D-6).

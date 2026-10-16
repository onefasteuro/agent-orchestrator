# Result contract (C-3, K-1)

Every specialist ends with exactly one `worker_done` carrying the preamble's task and dispatch IDs and `--outcome succeeded` or `--outcome failed`. A failed body starts with one reason code:

| Code | Meaning |
| --- | --- |
| `BLOCKED_CONTEXT` | Required file, revision or information was missing from the checkout and the brief |
| `BLOCKED_PERMISSION` | A required action or tool was refused by the native sandbox |
| `CHECKS_FAILED` | Required checks ran and failed after the allowed attempts |
| `CHECKS_UNAVAILABLE` | A required check could not run |
| `OUT_OF_BUDGET` | Session time or attempts exhausted |
| `CANCELLED` | Coordinator cancelled the assignment |
| `OTHER` | Anything else, explained in the next sentence |

When the coordinator must act before the task can settle, the worker sends an `escalation` message first, with the same reason codes.

Body fields by role, in order:

| Role | Required body |
| --- | --- |
| implementer | Changed paths as Git shows them; each required check with its result line; questions asked, answers received, timeouts; uncertainty and gaps |
| reviewer | Candidate SHA inspected; pass number; per-criterion verdicts; findings with severity, file and line, consequence, verification step; checks run; uncertainty |
| advisor | Question as understood; recommendation; verification step; evidence examined; uncertainty |
| debugger | Reproduction result with commands; supported cause or ranked hypotheses; proposed repair and verification; evidence; uncertainty |
| researcher | Sourced answer; retrieval method availability and errors; revision examined; conflicts; implications as suggestions |

A result is evidence. Acceptance is recorded by the coordinator only after the ownership gate, review and integration checks.

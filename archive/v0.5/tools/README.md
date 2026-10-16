# P1 utilities

Node ESM, no dependencies, one CLI: `node tools/sdd.mjs <command>`. Every command prints one JSON object. Exit 0 means the check passed, 1 means it failed, 2 means usage or runtime error. These are local conventions after feasibility (controls K-2, K-6, K-7, K-11, K-12, K-13, K-14, K-18). They schedule nothing; Orca stays the task manager.

| Command | Control | Purpose |
| --- | --- | --- |
| `brief-validate <brief.json>` | K-2, K-3, K-4 | Shape, role rules, base and candidate SHAs, pinned document hashes, AC IDs, path rules, limits, readiness. Returns the brief hash on pass |
| `gate --brief --repo --base [--candidate]` | K-6, K-7 | Full change set versus the allowlist, cleanliness, size, protected hashes. Returns the receipt (appendix B) |
| `audit-append`, `audit-verify`, `audit-segment`, `audit-classify` | K-12 | Append-only JSONL with sequence and UTC timestamp; partial-line detection; new linked segment after a crash; new, ignored, conflict or stale verdict for a result |
| `usage-codex --file`, `usage-pi --text`, `usage-coverage --log` | K-13 | Token counts from the Codex session rollout or the Pi status bar; coverage report with gaps listed, never zero-filled |
| `liveness --projection --role` | K-14 | wait, inspect or stop from Orca's `projection.liveness`, the role interval and a pending question |
| `recovery-write`, `recovery-read` | K-11 | `.agent-task.md` with the required pointer fields |
| `fake-worker --scenario` | K-18 | Scripted worker outcomes against a checkout for deterministic tests |

Run the tests with `npm test`. They build throwaway Git repositories under the system temp directory and never touch a real checkout.

Brief envelope fields are defined in `tools/lib/brief.mjs` and mirror controls appendix A. The hash is over the canonical JSON of the envelope minus `identity.orca` and timestamps (`cjson-1`).

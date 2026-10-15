# pilot: plan

Status: approved 2026-10-15 (D-20). Tasks in order; each starts from the accepted integrated SHA of its predecessor.

| Task | Outcome | AC | Assigned paths | New paths | Depends on | Checks |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | `min` | AC-1, AC-11 | `src/math.mjs`, `test/math.test.mjs` | none | none | `^min` tests pass; `npm test` counts per brief |
| T2 | `max` | AC-2, AC-11 | same | none | T1 | `^max` |
| T3 | `range` | AC-3, AC-11 | same | none | T2 | `^range`; the implementer asks one question first (drill) |
| T4 | `product` | AC-4, AC-11 | same | none | T3 | `^product` |
| T5 | fix `clamp` upper bound | AC-5, AC-11 | `src/math.mjs` only | none | T4 | existing clamp tests; `npm test` has 0 failures from here on |
| T6 | fix `variance` (divide by n) | AC-6, AC-11 | `src/math.mjs`, `test/math.test.mjs` | none | T5 | `^variance` |
| T7 | fix `stddev` single element | AC-7, AC-11 | same | none | T6 | `^stddev`; asks one question first (drill) |
| T8 | integration tests | AC-8, AC-11 | none | `test/stats.integration.test.mjs` | T7 | `^integration` |
| T9 | regression tests | AC-9, AC-11 | none | `test/regression.test.mjs` | T8 | `^regression` |
| T10 | `src/index.mjs` barrel | AC-10, AC-11 | `test/math.test.mjs` | `src/index.mjs` | T9 | `^index` |

Every task fits K-4. Integration: fast-forward when `main` has not moved, else a single merge; `npm test` on the integrated SHA with the counts stated in the brief.

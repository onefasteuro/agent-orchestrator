# pilot: specification

Status: approved 2026-10-15 (D-20). Ten bounded tasks on the fixture statistics module. Revision and hash pinned in every brief.

## Goal

`src/math.mjs` gains `min`, `max`, `range`, `product`, an `index.mjs` barrel, fixed `clamp`, `variance` and `stddev`, plus integration and regression tests, delivered one task at a time through the full workflow.

## Shared rules

- R-1: every new function validates like `mean`: plain array (`Array.isArray`), nonempty, every element a finite number; otherwise `TypeError` for shape and element problems, `RangeError` for an empty array.
- R-2: no function mutates its input.
- R-3: existing functions and existing test cases stay byte-identical except where a task names them; the only permitted edit to an existing test line is the import on line 3.
- R-4: no new dependencies. `src/generated.mjs` is hook-generated and declared in every brief.
- R-5: tests for a task are named with the task's function prefix so `--test-name-pattern` isolates them.

## Acceptance criteria

| ID | Task | Criterion | Check |
| --- | --- | --- | --- |
| AC-1 | T1 | `min([3, 1, 2])` is `1`; validation per R-1; no mutation | `min` tests ok |
| AC-2 | T2 | `max([3, 1, 2])` is `3`; validation per R-1; no mutation | `max` tests ok |
| AC-3 | T3 | `range([3, 1, 2])` is `2` (max minus min); `range([5])` is `0`; validation per R-1 | `range` tests ok |
| AC-4 | T4 | `product([2, 3, 4])` is `24`; validation per R-1 (empty throws RangeError); no mutation | `product` tests ok |
| AC-5 | T5 | `clamp(15, 0, 10)` is `10`; lower bound unchanged; the existing clamp tests pass unchanged | `clamp respects upper bound` ok; full suite has no failures from clamp |
| AC-6 | T6 | `variance([2, 4, 4, 4, 5, 5, 7, 9])` is `4` (population variance, divide by n); `variance([5])` is `0`; validation per R-1 | `variance` tests ok |
| AC-7 | T7 | `stddev([2, 4, 4, 4, 5, 5, 7, 9])` is `2`; `stddev([5])` is `0` | `stddev` tests ok |
| AC-8 | T8 | `test/stats.integration.test.mjs` exercises at least four functions together (for example mean of range values, median versus mean on a skewed set) and passes | `integration` tests ok |
| AC-9 | T9 | `test/regression.test.mjs` pins `median([Number.MAX_VALUE, Number.MAX_VALUE])` finite and `clamp` bounds on both sides | `regression` tests ok |
| AC-10 | T10 | `src/index.mjs` re-exports every public function; `import * as stats from '../src/index.mjs'` exposes them all; a test proves it | `index` tests ok |
| AC-11 | all | `npm test` on the integrated SHA has the pass and fail counts the task brief states; after T5 the suite has zero failures | `npm test` |

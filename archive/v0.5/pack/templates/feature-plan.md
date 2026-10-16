# <Feature name>: plan

Status: draft | approved (approval reference, date). Pinned with the spec in every brief.

## Design

Interfaces, data shapes, invariants, and the decisions already made with their reasons.

## Tasks

Each task fits K-4: one outcome, at most five files and 300 changed lines, one 30 to 90 minute session, named checks. A larger task names an exception here.

| Task | Outcome | Acceptance criteria | Assigned paths | New paths | Depends on | Checks | Exception |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | | AC-1 | `src/...` | | none | `npm test` expects ... | |
| T2 | | | | | T1 | | |

Dependencies are real ordering only. Dependent work starts from the accepted integrated SHA of its predecessor, never from a worker completion.

## Integration

Branch convention, how candidates integrate (fast-forward or single merge), and the checks that run on the integrated SHA.

## Verification matrix

| AC | Task | Check | Evidence location |
| --- | --- | --- | --- |

## Risks and open decisions

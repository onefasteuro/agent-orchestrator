# Role pack (draft, P2)

Ordinary instruction files read explicitly by the coordinator. No native discovery is assumed except for the single Claude entrypoint. Installed to `~/.agents/orca-sdd/` or `<project>/.agents/orca-sdd/` in P6; until then the entrypoint can be pointed here with `SDD_PACK_DIR`.

| File | Purpose | Spec reference |
| --- | --- | --- |
| `entrypoint/sdd-orchestrator.md` | Claude agent definition for the coordinator; the only file that goes into `.claude/agents/` | I-2, A-1 |
| `workflow.md` | Order of operations with the exact Orca and `sdd` commands | lifecycle, K-series |
| `role-map.json` | Role to runtime, model, effort, permission recipe, checkout policy, progress interval | A-6, K-21, D-15 |
| `launch-recipes.md` | Verified launch commands and prompt handling per runtime; stop and retry procedure | K-21, K-15 |
| `roles/*.md` | Five CLI-independent specialist prompts with boundaries and result contracts | C-1, C-3 |
| `templates/brief.example.json` | Brief envelope shape (appendix A) | K-1, K-2 |
| `templates/task-brief.md` | TASK block rendered from the envelope | K-1 |
| `templates/result.md` | Outcome codes and required body per role | C-3 |
| `templates/feature-spec.md`, `templates/feature-plan.md` | Per-feature document templates with the AC table and task table | M-0, K-4 |

Pack hash: SHA-256 over the canonical JSON of `{path: sha256(bytes)}` for every file in the pack, computed by the coordinator at run start and pinned in every brief as `role_pack_hash`. A changed pack never silently alters a live brief (C-2).

Project scope overrides the global pack as a whole directory (I-3). No merging.

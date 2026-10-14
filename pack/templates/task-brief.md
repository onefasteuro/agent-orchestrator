# TASK block template

Rendered after the role prompt and after Orca's injected preamble. Every field comes from the validated brief envelope (`brief.example.json`); nothing is typed in by hand. Keep the headings; workers are told to read them in this order.

```
=== TASK ===
MODE: {{identity.mode}}   ROLE: {{identity.role}}   BRIEF: {{identity.brief_id}} hash {{brief_hash}}
RUNTIME: {{execution.runtime}} {{execution.model}} effort {{execution.effort}}   PERMISSIONS: {{execution.permission_recipe}}

OBJECTIVE
{{objective.outcome}}
Acceptance criteria: {{objective.ac_ids}} (see FEATURE SPEC below)
Exclusions: {{objective.exclusions}}
Expected result: {{objective.expected_result}}

WORKSPACE
Repository: {{workspace.repository}}
Your checkout: {{workspace.worker_checkout}}
Base commit: {{workspace.base_sha}}
{{#candidate_sha}}Candidate commit under review: {{workspace.candidate_sha}}{{/candidate_sha}}
{{#dirty_state}}Transient state you are inspecting: {{workspace.dirty_state}}{{/dirty_state}}

ASSIGNED PATHS (the only paths you may change)
{{workspace.assigned_paths}}
NEW PATHS (you may create exactly these)
{{workspace.new_paths}}
PROTECTED (never change): feature spec and plan, AGENTS.md, CLAUDE.md, .agents/, .claude/, .githooks/, .git/, .gitignore, .gitattributes, .agent-task.md, plus {{workspace.protected_paths}}

RULES AND CONTEXT
Project instructions: {{context.instructions}}
Relevant decisions and predecessor conclusions:
{{context.predecessor_conclusions}}
Evidence available in your checkout: {{context.evidence}}

FEATURE SPEC ({{context.feature_spec.path}} at {{context.feature_spec.revision}}, sha256 {{context.feature_spec.sha256}})
{{feature_spec_excerpt}}

FEATURE PLAN ({{context.feature_plan.path}} at {{context.feature_plan.revision}}, sha256 {{context.feature_plan.sha256}})
{{feature_plan_excerpt}}

REQUIRED CHECKS
{{#validation.checks}}- {{name}}: run `{{command}}`, expect: {{expected}}{{/validation.checks}}
Setup complete: {{execution.readiness.setup_complete}}   Fixtures only, no secrets.

LIMITS
One session of {{execution.limits.session_minutes}} minutes, {{execution.limits.attempts}} attempts in total for this task, at most {{execution.limits.max_files}} files and {{execution.limits.max_lines}} changed lines (estimate: {{validation.estimate.files}} files, {{validation.estimate.lines}} lines). Declared generated paths: {{validation.generated_paths}}. Scratch: {{validation.scratch_paths}}.

RESULT
Send one worker_done with: {{delivery.result_fields}}.
Escalate when: {{delivery.escalation_rule}}
Usage source: {{delivery.usage_source}}   Budget: {{delivery.budget_ref}}
{{#pass}}REVIEW PASS: {{delivery.pass}}. Withheld in pass 1: {{delivery.pass_one_exclusions}}{{/pass}}
```

Supply the feature spec and plan excerpts inline when the files are not present in the worker checkout (C-1). For a reviewer pass 1, the excerpt is the spec and acceptance criteria only; the plan rationale is withheld.

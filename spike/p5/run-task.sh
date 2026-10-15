#!/bin/zsh
# P5 pilot task runner. One full cycle for one task: worktree, brief, Pi dispatch,
# supervision (questions, timeouts), gate, candidate, two-pass Codex review,
# integration via `sdd integrate`. Every Git or Orca effect is checked before
# the matching audit event is appended. Exits non-zero at the first failure and
# prints where it stopped; nothing is retried blindly.
#
# usage: run-task.sh <task-spec.json>
#   task-spec.json: {"id":"T1","title":"...","outcome":"...","ac_ids":[...],"assigned":[...],"new":[...],
#                    "checks":[{"name","command","expected"}],"full_expect":"pass 16 fail 1","ask":false,
#                    "ask_answer":"...","conclusions":[...],"estimate":{"files":2,"lines":60},"prefix":"min"}
set -u
SPEC=$(cd "$(dirname "${1:?task spec}")" && pwd)/$(basename "$1"); S=/Users/oliverharoun/Sites/agent-orchestration/spike; P5=$S/p5; T=/Users/oliverharoun/Sites/agent-orchestration/tools/sdd.mjs; F=$HOME/Sites/orca-sdd-fixture
C=$(cat $S/.coordinator-handle); LOG=$(cat $S/.p3-log); RUN=$(cat $S/.p5-run); REPO=id:e39c9174-87d1-44c6-9cb0-fa6488a7a3c4; PACK=$F/.agents/orca-sdd
ID=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$SPEC"); W=$P5/work/$ID; mkdir -p "$W"
die(){ echo "STOP [$ID] $1"; echo "$1" > "$W/STOPPED"; exit 1; }
ev(){ node "$T" audit-append --log "$LOG" --type "$1" --json "$2" | python3 -I -c 'import json,sys; print("  event", json.load(sys.stdin)["record"]["sequence"], sys.argv[1])' "$1" || die "audit append $1 failed"; }
js(){ python3 -I -c "import json,sys; d=json.load(open(sys.argv[1])); print($2)" "$1"; }
parse_check(){ python3 -I - "$1" <<'EOF'
import json,sys
raw=open(sys.argv[1]).read(); i=raw.find('{\n  "id"'); d=json.JSONDecoder(strict=False).raw_decode(raw[i:])[0] if i>=0 else {}
r=d.get("result") or {}; m=(r.get("messages") or [None])[0]
print(json.dumps({"ok":d.get("ok"),"deliveryId":r.get("deliveryId"),"timedOut":r.get("timedOut"),"error":(d.get("error") or {}).get("message"),"type":m and m.get("type"),"id":m and m.get("id"),"body":m and m.get("body"),"payload":m and m.get("payload"),"created_at":m and m.get("created_at")}))
EOF
}
wait_inbox(){ orca orchestration check --terminal "$C" --run $RUN --wait --types "worker_done,escalation,question" --timeout-ms ${1:-420000} --json > "$W/inbox-raw.txt" 2>&1; parse_check "$W/inbox-raw.txt" > "$W/inbox.json"; }
ack(){ orca orchestration check --terminal "$C" --run $RUN --ack "$1" --timeout-ms 1000 --json | grep -q '"acknowledged"' || die "ack $1"; }
term_idle(){ local h=$1; for i in 1 2 3 4 5; do local b; b=$(orca terminal wait --terminal "$h" --for tui-idle --timeout-ms 45000 --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); w=d["result"]["wait"]; print("idle" if w.get("satisfied") else (w.get("blockedReason") or "unknown"))'); case "$b" in idle) return 0;; agent-update-prompt) orca terminal send --terminal "$h" --text "2" --json >/dev/null;; agent-trust-workspace) orca terminal send --terminal "$h" --text "" --enter --json >/dev/null;; *) sleep 3;; esac; done; return 1; }
mkterm(){ orca terminal create --worktree "path:$1" --title "$2" --command "$3" --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["terminal"]["handle"] if d.get("ok") else "")'; }
dispatch(){ # $1 brief.json $2 role-file $3 title $4 terminal $5 worktree $6 role $7 plan-excerpt("" to withhold) -> writes $W/last-dispatch (task dispatch brief_hash prompt_hash)
  node "$T" brief-validate "$1" > "$W/validate.json" || { cat "$W/validate.json"; die "brief invalid: $1"; }
  local BH PH TK DP BID; BH=$(js "$W/validate.json" 'd["identities"]["brief_hash"]'); BID=$(js "$1" 'd["identity"]["brief_id"]')
  ev brief_validated "{\"run_id\":\"$RUN\",\"task_ref\":\"$3\",\"brief_id\":\"$BID\",\"brief_hash\":\"$BH\",\"role\":\"$6\",\"feature_spec_sha256\":\"$SPEC_H\",\"feature_plan_sha256\":\"$PLAN_H\"}"
  if [ -n "$7" ]; then node "$T" brief-render --brief "$1" --role-file "$2" --spec-excerpt "$W/spec.md" --plan-excerpt "$7" --out "$W/prompt.txt" > "$W/render.json" || die render; else node "$T" brief-render --brief "$1" --role-file "$2" --spec-excerpt "$W/spec.md" --out "$W/prompt.txt" > "$W/render.json" || die render; fi
  PH=$(js "$W/render.json" 'd["prompt_hash"]')
  ev dispatch_intent "{\"run_id\":\"$RUN\",\"task_ref\":\"$3\",\"brief_id\":\"$BID\",\"brief_hash\":\"$BH\",\"prompt_hash\":\"$PH\",\"role\":\"$6\",\"worker_checkout\":\"$5\"}"
  TK=$(orca orchestration task-create --from "$C" --run $RUN --task-title "$3" --spec "$(cat "$W/prompt.txt")" --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); r=d.get("result",d); t=r.get("task",r); print(t.get("id") if d.get("ok") else "")'); [ -n "$TK" ] || die "task-create"
  orca orchestration worker-start --from "$C" --run $RUN --task "$TK" --worktree "path:$5" --terminal "$4" --timeout-ms 60000 --json > "$W/start.json" 2>&1 || true
  DP=$(python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["result"]["dispatchId"] if d.get("ok") else "")' "$W/start.json"); [ -n "$DP" ] || { head -c 400 "$W/start.json"; die "worker-start"; }
  ev dispatch_started "{\"run_id\":\"$RUN\",\"task_id\":\"$TK\",\"dispatch_id\":\"$DP\",\"brief_id\":\"$BID\",\"brief_hash\":\"$BH\",\"prompt_hash\":\"$PH\",\"role\":\"$6\",\"terminal\":\"$4\",\"started_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  echo "$TK $DP $BH $PH" > "$W/last-dispatch"; echo "  dispatched $BID as $DP"
}
receive(){ # $1 expected dispatch id, $2 label -> $W/result-$2.json ; handles questions for the implementer
  while :; do wait_inbox; local TYPE DEL MID; TYPE=$(js "$W/inbox.json" 'd["type"]'); DEL=$(js "$W/inbox.json" 'd["deliveryId"]'); MID=$(js "$W/inbox.json" 'd["id"]')
    [ "$TYPE" = None ] && { [ "$(js "$W/inbox.json" 'd["timedOut"]')" = True ] && { echo "  wait timed out; checking liveness"; continue; }; die "inbox: $(cat "$W/inbox.json" | head -c 300)"; }
    local PD; PD=$(js "$W/inbox.json" 'json.loads(d["payload"] or "{}").get("dispatchId","")')
    if [ "$TYPE" = question ]; then
      [ "$PD" = "$1" ] || { echo "  question from another dispatch $PD; ignoring and acking"; ev result_ignored "{\"run_id\":\"$RUN\",\"dispatch_id\":\"$PD\",\"message_id\":\"$MID\",\"reason\":\"question from a dispatch that is not current\"}"; ack "$DEL"; continue; }
      ev escalation "{\"run_id\":\"$RUN\",\"dispatch_id\":\"$1\",\"kind\":\"question_held\",\"question_id\":\"$MID\",\"question_created_at\":\"$(js "$W/inbox.json" 'd["created_at"]')\"}"
      if [ "$ASK" = true ]; then echo "  holding the question past the worker's 60 s timeout (drill)"; sleep 75; fi
      orca orchestration reply --from "$C" --run $RUN --id "$MID" --body "$ASK_ANSWER" --json | grep -q '"ok": true' || die reply
      ev escalation "{\"run_id\":\"$RUN\",\"dispatch_id\":\"$1\",\"kind\":\"question_answered\",\"question_id\":\"$MID\",\"answer_source\":\"brief-settled decision\"}"; ack "$DEL"; continue
    fi
    if [ "$TYPE" = worker_done ]; then
      local RH V; RH=$(python3 -I -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1]).read().encode()).hexdigest())' "$W/inbox.json")
      V=$(node "$T" audit-classify --log "$LOG" --run $RUN --task x --dispatch "$PD" --result-hash "$RH" | js /dev/stdin 'd["verdict"]' 2>/dev/null || echo unknown)
      if [ "$PD" != "$1" ] || [ "$V" != new ]; then echo "  result for $PD classified $V; ignoring"; ev result_ignored "{\"run_id\":\"$RUN\",\"dispatch_id\":\"$PD\",\"message_id\":\"$MID\",\"result_hash\":\"$RH\",\"verdict\":\"$V\"}"; ack "$DEL"; continue; fi
      cp "$W/inbox.json" "$W/result-$2.json"; ev result_received "{\"run_id\":\"$RUN\",\"dispatch_id\":\"$1\",\"message_id\":\"$MID\",\"result_hash\":\"$RH\",\"outcome\":\"$(js "$W/inbox.json" 'json.loads(d["payload"]).get("outcome")')\",\"label\":\"$2\"}"; ack "$DEL"; return 0
    fi
    echo "  escalation from $PD: $(js "$W/inbox.json" 'd["body"][:200]')"; ev escalation "{\"run_id\":\"$RUN\",\"dispatch_id\":\"$PD\",\"message_id\":\"$MID\",\"body\":$(js "$W/inbox.json" 'json.dumps(d["body"])')}"; ack "$DEL"; die "worker escalated"
  done
}
# ---------- 0. state ----------
cd "$F" || die cd; [ -z "$(git status --porcelain)" ] || die "integration checkout dirty"
BASE=$(git rev-parse HEAD); SPEC_H=$(node "$T" doc-identity --repo "$F" --revision "$BASE" --path specs/pilot/spec.md | js /dev/stdin 'd["sha256"]'); PLAN_H=$(node "$T" doc-identity --repo "$F" --revision "$BASE" --path specs/pilot/plan.md | js /dev/stdin 'd["sha256"]'); PACK_H=$(node "$T" pack-hash --dir "$PACK" | js /dev/stdin 'd["hash"]')
git show "${BASE}:specs/pilot/spec.md" > "$W/spec.md"; git show "${BASE}:specs/pilot/plan.md" > "$W/plan.md"
ASK=$(js "$SPEC" 'str(d.get("ask",False)).lower()'); ASK_ANSWER=$(js "$SPEC" 'd.get("ask_answer","")'); PREFIX=$(js "$SPEC" 'd["prefix"]'); FULL_EXPECT=$(js "$SPEC" 'd["full_expect"]')
echo "[$ID] base $BASE"
if [ "${RESUME_FROM:-}" = review ]; then
  read WT RV < "$W/paths"; read TK DP BH PHH < "$W/impl-dispatch"; CAND=$(cat "$W/candidate"); cd "$WT" || die cd
  CH=$(node --test --test-name-pattern="^$PREFIX" test/ 2>&1 | grep -E '^ℹ (pass|fail)' | tr -d 'ℹ' | tr -s ' \n' ' '); FULL=$(npm test 2>&1 | grep -E '^ℹ (pass|fail)' | tr -d 'ℹ' | tr -s ' \n' ' ')
  echo "  resuming at review: candidate $CAND, checks $CH| full: $FULL"; case "$FULL" in *"$FULL_EXPECT"*) ;; *) die "full suite on candidate: $FULL";; esac
  git -C "$RV" checkout -q --detach "$CAND" || die "review detach"
else
# ---------- 1. task worktree ----------
WT=$(orca worktree create --repo $REPO --name "pilot-$ID" --no-parent --base-branch main --setup skip --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["worktree"]["path"] if d.get("ok") else "")'); [ -n "$WT" ] || die "worktree create"; [ "$(git -C "$WT" rev-parse HEAD)" = "$BASE" ] || die "worktree base"
RV=$(orca worktree create --repo $REPO --name "review-$ID" --no-parent --base-branch "pilot-$ID" --setup skip --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["worktree"]["path"] if d.get("ok") else "")'); [ -n "$RV" ] || die "review worktree create"
node "$T" metadata-baseline --repo "$WT" > "$W/metadata-baseline.json" || die baseline
echo "$WT $RV" > "$W/paths"; echo "  worktrees $WT and $RV; metadata baseline recorded after both exist"
# ---------- 2. implementer brief ----------
python3 -I - "$SPEC" "$F" "$WT" "$BASE" "$SPEC_H" "$PLAN_H" "$PACK_H" "$LOG" > "$W/brief-impl.json" <<'EOF' || exit 1
import json,sys
t=json.load(open(sys.argv[1])); F,WT,BASE,SPEC_H,PLAN_H,PACK_H,LOG=sys.argv[2:9]
concl=list(t.get("conclusions",[]))+["The existing test 'clamp respects upper bound' "+("has been fixed; the full suite must have 0 failures." if t.get("clamp_fixed") else "fails by design until task T5; report it as a known baseline failure, never as a pass.")]
if t.get("ask"): concl.insert(0,"REQUIRED ORDER OF WORK. Step 1: write a first draft. Step 2: ask the coordinator exactly one blocking question using the ask command from your preamble with --timeout-ms 60000, with this exact text: '"+t["ask_question"]+"' Then stop editing. If the ask times out, resume the same question with --resume <message_id> and keep waiting; do not edit until the answer arrives. Step 3: after the answer, finish, run the required checks, send worker_done.")
concl.append("src/generated.mjs is written by the pre-commit hook during the coordinator's commit; never create or edit it.")
b={"schema_version":"1","identity":{"brief_id":"brief_pilot_"+t["id"]+"_a1","role":"implementer","mode":"M-2"},
 "objective":{"outcome":t["outcome"],"ac_ids":t["ac_ids"],"exclusions":t.get("exclusions",["Do not change functions or tests the task does not name.","No new dependencies."]),"expected_result":"A handoff where "+"; ".join(c["name"]+": "+c["expected"] for c in t["checks"])+"."},
 "context":{"feature_spec":{"path":"specs/pilot/spec.md","baseline":"approved","revision":BASE,"sha256":SPEC_H},"feature_plan":{"path":"specs/pilot/plan.md","baseline":"approved","revision":BASE,"sha256":PLAN_H},"role_pack_hash":PACK_H,"instructions":["AGENTS.md"],"evidence":["specs/pilot/spec.md (shared rules R-1 to R-5, acceptance criteria)","src/math.mjs (mean shows the validation shape)"],"predecessor_conclusions":concl},
 "workspace":{"repository":F,"integration_checkout":F,"worker_checkout":WT,"base_sha":BASE,"candidate_sha":None,"dirty_state":None,"assigned_paths":t["assigned"],"new_paths":t.get("new",[]),"protected_paths":["scripts/","package.json"]},
 "execution":{"runtime":"pi","model":"ollama-cloud/deepseek-v4.1-flash","effort":"high","permission_recipe":"pi-terminal-attach","readiness":{"setup_complete":True},"limits":{"session_minutes":90,"attempts":3,"max_files":5,"max_lines":300},"retrieval":[]},
 "validation":{"checks":t["checks"],"estimate":t.get("estimate",{"files":2,"lines":60}),"generated_paths":["src/generated.mjs"],"scratch_paths":[],"fixture_only":True},
 "delivery":{"result_fields":["changed paths as git status shows them","each required check with its result line","questions asked and answers received, with any timeout","remaining uncertainty"],"reply_route":"Orca run inbox via the injected preamble","usage_source":"pi-status-bar","budget_ref":"pilot-"+t["id"],"escalation_rule":"ask before any decision the brief does not settle, after two failed attempts at the same problem, or if a required path is outside your allowlist","recovery_ref":".agent-task.md (coordinator only)","audit_ref":LOG}}
print(json.dumps(b,indent=1))
EOF
PH=$(mkterm "$WT" "pilot-$ID-pi" 'pi --model ollama-cloud/deepseek-v4.1-flash --thinking high'); [ -n "$PH" ] || die "pi terminal"; term_idle "$PH" || die "pi not idle"
orca terminal read --terminal "$PH" --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); l=[x for x in d["result"]["terminal"]["tail"] if "deepseek-v4.1-flash" in x]; sys.exit(0 if l else 1)' || die "pi status line"
START=$(date -u +%Y-%m-%dT%H:%M:%SZ); dispatch "$W/brief-impl.json" "$PACK/roles/implementer.md" "pilot $ID implement" "$PH" "$WT" implementer "$W/plan.md"; read TK DP BH PHH < "$W/last-dispatch"; cp "$W/last-dispatch" "$W/impl-dispatch"
if [ "${RECONCILE_DRILL:-}" = 1 ]; then sleep 5; orca orchestration worker-list --run $RUN --json > "$W/workers.json"; node "$T" reconcile --log "$LOG" --checkout "$F" --workers "$W/workers.json" > "$W/reconcile.json"; echo "  restart drill: $(js "$W/reconcile.json" 'json.dumps(d["findings"])')"; ev recovery_reconciled "{\"run_id\":\"$RUN\",\"task_id\":\"$TK\",\"dispatch_id\":\"$DP\",\"kind\":\"restart_drill\",\"findings\":$(js "$W/reconcile.json" 'json.dumps(d["findings"])'),\"live\":$(js "$W/reconcile.json" 'json.dumps(d["live_dispatches"])')}"; fi
receive "$DP" impl
BAR=$(orca terminal read --terminal "$PH" --json | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print([l for l in d["result"]["terminal"]["tail"] if "deepseek" in l][-1].strip())'); U=$(node "$T" usage-pi --text "$BAR")
ev usage_recorded "$(python3 -I -c 'import json,sys; u=json.loads(sys.argv[1]); print(json.dumps({"run_id":sys.argv[2],"task_id":sys.argv[3],"dispatch_id":sys.argv[4],"runtime":"pi","model":"ollama-cloud/deepseek-v4.1-flash","effort":"high","started_at":sys.argv[5],"ended_at":sys.argv[6],"elapsed_seconds":int((__import__("datetime").datetime.fromisoformat(sys.argv[6].replace("Z","+00:00"))-__import__("datetime").datetime.fromisoformat(sys.argv[5].replace("Z","+00:00"))).total_seconds()),"attempts":1,"measurement_status":u["status"],"source":u.get("source"),"tokens":u.get("tokens"),"cost":u.get("cost")}))' "$U" $RUN "$TK" "$DP" "$START" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
orca orchestration worker-release --dispatch "$DP" --json >/dev/null; orca terminal close --terminal "$PH" --json >/dev/null
# ---------- 3. gate and candidate ----------
node "$T" gate --brief "$W/brief-impl.json" --repo "$WT" --base "$BASE" --metadata-baseline "$W/metadata-baseline.json" > "$W/gate-wt.json" || { js "$W/gate-wt.json" 'd["violations"]'; ev candidate_rejected "{\"run_id\":\"$RUN\",\"task_id\":\"$TK\",\"dispatch_id\":\"$DP\",\"stage\":\"working_tree\",\"violations\":$(js "$W/gate-wt.json" 'json.dumps(d["violations"])')}"; die "gate(working tree)"; }
cd "$WT" || die cd; git add -- $(js "$SPEC" '" ".join(d["assigned"]+d.get("new",[]))') || die "git add"; git -c user.name=sdd-coordinator -c user.email=sdd-coordinator@local commit -q -m "$TK brief:$BH" || die "commit"; CAND=$(git rev-parse HEAD); echo "$CAND" > "$W/candidate"
node "$T" gate --brief "$W/brief-impl.json" --repo "$WT" --base "$BASE" --candidate "$CAND" --metadata-baseline "$W/metadata-baseline.json" > "$W/gate-cand.json" || { js "$W/gate-cand.json" 'd["violations"]'; ev candidate_rejected "{\"run_id\":\"$RUN\",\"task_id\":\"$TK\",\"dispatch_id\":\"$DP\",\"stage\":\"candidate\",\"candidate_sha\":\"$CAND\",\"violations\":$(js "$W/gate-cand.json" 'json.dumps(d["violations"])')}"; die "gate(candidate)"; }
ev candidate_created "$(python3 -I -c 'import json,sys; r=json.load(open(sys.argv[1]))["receipt"]; print(json.dumps({"run_id":sys.argv[2],"task_id":sys.argv[3],"dispatch_id":sys.argv[4],"brief_hash":sys.argv[5],"base_sha":r["base_sha"],"candidate_sha":r["candidate_sha"],"receipt":r}))' "$W/gate-cand.json" $RUN "$TK" "$DP" "$BH")"
echo "  candidate $CAND: $(js "$W/gate-cand.json" 'str(d["receipt"]["size"]["files"])+" files "+str(d["receipt"]["size"]["lines"])+" lines"')"
CH=$(node --test --test-name-pattern="^$PREFIX" test/ 2>&1 | grep -E '^ℹ (pass|fail)' | tr -d 'ℹ' | tr -s ' \n' ' '); FULL=$(npm test 2>&1 | grep -E '^ℹ (pass|fail)' | tr -d 'ℹ' | tr -s ' \n' ' '); echo "  checks: $CH| full: $FULL"; case "$FULL" in *"$FULL_EXPECT"*) ;; *) die "full suite on candidate: $FULL (expected $FULL_EXPECT)";; esac
git -C "$RV" checkout -q --detach "$CAND" || die "review detach"; [ "$(git -C "$RV" rev-parse HEAD)" = "$CAND" ] || die "review HEAD"
fi
# ---------- 4. two-pass review ----------
XH=$(mkterm "$RV" "pilot-$ID-review" 'codex --sandbox read-only --model gpt-6-astra -c model_reasoning_effort="high"'); [ -n "$XH" ] || die "codex terminal"; term_idle "$XH" || die "codex not idle"; RSTART=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkreview(){ # $1 pass $2 extra-json ("" for pass 1)
python3 -I - "$SPEC" "$F" "$RV" "$BASE" "$CAND" "$SPEC_H" "$PLAN_H" "$PACK_H" "$LOG" "$1" "${2:-}" "$FULL_EXPECT" <<'EOF'
import json,sys
t=json.load(open(sys.argv[1])); F,RV,BASE,CAND,SPEC_H,PLAN_H,PACK_H,LOG,PASS,EXTRA,FULL=sys.argv[2:13]; p=int(PASS)
pre=["Clamp: "+("fixed in T5; the full suite must have 0 failures." if t.get("clamp_fixed") else "'clamp respects upper bound' fails by design until task T5; not a finding unless the candidate changed clamp."),"src/generated.mjs is hook-generated and declared; not an implementer change.","Your worker_done body MUST start with exactly one of these lines: 'VERDICT: ACCEPT' (no findings, or only low findings the coordinator may accept) or 'VERDICT: REPAIR' (at least one medium or higher finding). Then the per-criterion verdicts, findings, checks run, uncertainty."]
ev=["git diff "+BASE[:12]+".."+CAND[:12]+" (run it yourself; read-only git commands are permitted)"]
if p==2:
    x=json.load(open(EXTRA)); pre=pre+x["conclusions"]; ev=ev+[x["pass1"]]
b={"schema_version":"1","identity":{"brief_id":"brief_pilot_"+t["id"]+"_review_p"+PASS,"role":"reviewer","mode":"M-2"},
 "objective":{"outcome":("Independent pass-1 review" if p==1 else "Pass-2 review reconciling your persisted pass-1 findings with the supplied evidence")+" of candidate "+CAND[:12]+" for task "+t["id"]+" ("+t["outcome"]+") against specs/pilot/spec.md "+", ".join(t["ac_ids"])+" and shared rules R-1 to R-5.","ac_ids":t["ac_ids"],"exclusions":["No edits."]+(["Do not read .agents/, .agent-task.md, audit logs or any implementer narrative."] if p==1 else ["Do not retract a pass-1 finding because the implementer says it is fine."]),"expected_result":"VERDICT line first, then per-criterion verdicts with file and line, findings with severity and verification step, checks run with result lines."},
 "context":{"feature_spec":{"path":"specs/pilot/spec.md","baseline":"approved","revision":BASE,"sha256":SPEC_H},"feature_plan":{"path":"specs/pilot/plan.md","baseline":"approved","revision":BASE,"sha256":PLAN_H},"role_pack_hash":PACK_H,"instructions":["AGENTS.md"],"evidence":ev,"predecessor_conclusions":pre},
 "workspace":{"repository":F,"integration_checkout":F,"worker_checkout":RV,"base_sha":BASE,"candidate_sha":CAND,"dirty_state":None,"assigned_paths":[],"new_paths":[],"protected_paths":[]},
 "execution":{"runtime":"codex","model":"gpt-6-astra","effort":"high","permission_recipe":"codex-read-only","readiness":{"setup_complete":True},"limits":{"session_minutes":30,"attempts":1,"max_files":5,"max_lines":300},"retrieval":[]},
 "validation":{"checks":t["checks"]+[{"name":"full suite","command":"npm test","expected":FULL}],"estimate":{"files":0,"lines":0},"generated_paths":["src/generated.mjs"],"scratch_paths":[],"fixture_only":True},
 "delivery":{"result_fields":["VERDICT line","candidate SHA inspected","pass number","per-criterion verdicts","findings","checks run","remaining uncertainty"],"reply_route":"Orca run inbox via the injected preamble (worker_done once)","usage_source":"codex-session-rollout","budget_ref":"pilot-"+t["id"]+"-review","escalation_rule":"BLOCKED_CONTEXT if HEAD is not the candidate SHA","recovery_ref":".agent-task.md (coordinator only)","audit_ref":LOG,"pass":p,**({"pass_one_exclusions":["implementer self-report","claimed check results","advisor output","prior verdicts","plan rationale","recovery and audit files"]} if p==1 else {})}}
print(json.dumps(b,indent=1))
EOF
}
mkreview 1 > "$W/brief-r1.json" || die "review brief 1"; dispatch "$W/brief-r1.json" "$PACK/roles/reviewer.md" "pilot $ID review pass 1" "$XH" "$RV" reviewer ""; read RT1 RD1 RBH1 RPH1 < "$W/last-dispatch"; receive "$RD1" r1
ev review_pass_one_recorded "$(python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); print(json.dumps({"run_id":sys.argv[2],"task_id":sys.argv[3],"dispatch_id":sys.argv[4],"candidate_sha":sys.argv[5],"verdict_line":(d["body"] or "").split("\n")[0][:40],"report":d["body"]}))' "$W/result-r1.json" $RUN "$RT1" "$RD1" "$CAND")"
python3 -I - "$W/result-r1.json" "$W/result-impl.json" "$W/gate-cand.json" "$CH" "$FULL" > "$W/r2-extra.json" <<'EOF'
import json,sys
r1=json.load(open(sys.argv[1]))["body"]; impl=json.load(open(sys.argv[2])); g=json.load(open(sys.argv[3]))["receipt"]
print(json.dumps({"pass1":"Your own pass-1 report (persisted as review_pass_one_recorded): "+r1,"conclusions":["Implementer self-report: "+(impl["body"] or "")[:1500]+" (filesModified payload: "+json.loads(impl["payload"]).get("filesModified",[]).__repr__()+"; the Git-computed receipt is authoritative)","Gate receipt on the candidate: changed "+json.dumps([(c["status"],c["path"],[x["cls"] for x in c["classes"]]) for c in g["changed_paths"]])+"; size "+json.dumps({k:g["size"][k] for k in ("files","lines","within")})+"; clean after commit; pinned document hashes match.","Coordinator checks on the candidate: task tests "+sys.argv[4].strip()+"; full suite "+sys.argv[5].strip()+"."]}))
EOF
mkreview 2 "$W/r2-extra.json" > "$W/brief-r2.json" || die "review brief 2"; dispatch "$W/brief-r2.json" "$PACK/roles/reviewer.md" "pilot $ID review pass 2" "$XH" "$RV" reviewer "$W/plan.md"; read RT2 RD2 RBH2 RPH2 < "$W/last-dispatch"; receive "$RD2" r2
CF=$(find ~/.codex/sessions -name '*.jsonl' -newer "$W/brief-r1.json" | xargs ls -t 2>/dev/null | head -1); UC=$(node "$T" usage-codex --file "$CF")
ev usage_recorded "$(python3 -I -c 'import json,sys; u=json.loads(sys.argv[1]); print(json.dumps({"run_id":sys.argv[2],"task_id":sys.argv[3],"dispatch_id":sys.argv[4],"covers_dispatches":[sys.argv[5],sys.argv[4]],"runtime":"codex","model":"gpt-6-astra","effort":"high","started_at":sys.argv[6],"ended_at":sys.argv[7],"elapsed_seconds":int((__import__("datetime").datetime.fromisoformat(sys.argv[7].replace("Z","+00:00"))-__import__("datetime").datetime.fromisoformat(sys.argv[6].replace("Z","+00:00"))).total_seconds()),"attempts":1,"measurement_status":u["status"],"source":u.get("source"),"tokens":u.get("tokens"),"cost":None}))' "$UC" $RUN "$RT2" "$RD2" "$RD1" "$RSTART" "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
for d in $RD1 $RD2; do orca orchestration worker-release --dispatch "$d" --json >/dev/null; done; orca terminal close --terminal "$XH" --json >/dev/null
VERDICT=$(js "$W/result-r2.json" '(d["body"] or "").split("\n")[0].strip()'); echo "  final review: $VERDICT"
case "$VERDICT" in "VERDICT: ACCEPT"*) ;; *) echo "$VERDICT" > "$W/REPAIR-NEEDED"; die "review verdict requires repair; see $W/result-r2.json";; esac
# ---------- 5. integrate ----------
cd "$F" || die cd; node "$T" integrate --repo "$F" --candidate "$CAND" --log "$LOG" --run $RUN --task "$TK" --dispatch "$DP" --brief-hash "$BH" --check "npm test 2>&1 | grep -E '^ℹ (pass|fail)' | tr -d 'ℹ' | tr -s ' \n' ' '" --expect "$FULL_EXPECT" --message "Integrate pilot $ID candidate $CAND" --cites "$RD1,$RD2" > "$W/integrate.json" || { cat "$W/integrate.json" | head -c 600; die "integration check failed and was reverted"; }
echo "  integrated $(js "$W/integrate.json" 'd["integrated_sha"][:12]+" ("+d["integration"]+")"')"
python3 -I - "$F" "$(js "$W/integrate.json" 'd["integrated_sha"]')" "$ID" <<'EOF'
import json,subprocess,sys
F,INT,ID=sys.argv[1:4]; idx=json.loads(subprocess.check_output(["node","/Users/oliverharoun/Sites/agent-orchestration/tools/sdd.mjs","recovery-read","--checkout",F]))["index"]
idx["accepted_sha"]=INT; idx["orca"]["dispatches"]=[]; idx["next_action"]="pilot "+ID+" accepted; next task"; idx.pop("updated_at",None); open("/tmp/sdd-idx.json","w").write(json.dumps(idx))
EOF
node "$T" recovery-write --checkout "$F" --json "$(cat /tmp/sdd-idx.json)" >/dev/null || die "recovery write"
echo "[$ID] DONE $(date -u +%H:%M:%SZ)"; echo "done" > "$W/DONE"

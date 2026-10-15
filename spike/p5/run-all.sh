#!/bin/zsh
# Pilot driver: tasks and calibration in the planned order; stops at the first failure.
set -u; cd "$(dirname "$0")"; L=work/run-all.log; : > $L
step(){ echo "=== $(date -u +%H:%M:%SZ) $*" | tee -a $L; "$@" 2>&1 | tee -a $L | grep -E '^\[|STOP|final review|integrated|restart drill|dispatched' ; return ${pipestatus[1]}; }
step ./run-calibration.sh S1 range AC-3 || exit 1
step ./run-calibration.sh C1 min AC-1 || exit 1
RECONCILE_DRILL=1 step ./run-task.sh tasks/T2.json || exit 1
step ./run-task.sh tasks/T3.json || exit 1
step ./run-task.sh tasks/T4.json || exit 1
step ./run-task.sh tasks/T5.json || exit 1
step ./run-calibration.sh S2 min AC-1 || exit 1
step ./run-calibration.sh C2 max AC-2 || exit 1
step ./run-calibration.sh S3 product AC-4 || exit 1
RECONCILE_DRILL=1 step ./run-task.sh tasks/T6.json || exit 1
step ./run-task.sh tasks/T7.json || exit 1
step ./run-calibration.sh S4 product AC-4 || exit 1
step ./run-calibration.sh C3 range AC-3 || exit 1
step ./run-task.sh tasks/T8.json || exit 1
RECONCILE_DRILL=1 step ./run-task.sh tasks/T9.json || exit 1
step ./run-calibration.sh S5 max AC-2 || exit 1
step ./run-calibration.sh C4 product AC-4 || exit 1
step ./run-calibration.sh C5 count AC-1 || exit 1
step ./run-task.sh tasks/T10.json || exit 1
echo "=== $(date -u +%H:%M:%SZ) ALL DONE" | tee -a $L

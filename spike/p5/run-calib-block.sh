#!/bin/zsh
set -u; cd "$(dirname "$0")"; L=work/calib-block2.log; : > $L
for c in "S1 range AC-3" "S2 min AC-1" "S3 product AC-4" "S4 product AC-4" "S5 max AC-2" "C1 min AC-1" "C2 max AC-2" "C3b range AC-3" "C4b product AC-4" "C5b range AC-3"; do set -- ${=c}; echo "=== $(date -u +%H:%M:%SZ) $1" | tee -a $L; ./run-calibration.sh $1 $2 $3 2>&1 | tee -a $L | grep -E '^\[|STOP'; done; echo "=== $(date -u +%H:%M:%SZ) BLOCK DONE" | tee -a $L

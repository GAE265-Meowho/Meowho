# 給 run_pipeline.sh、room_demo.sh 用：timed <階段> <步驟> <指令…>。沒設 TIMING 就只跑指令
timed() {
  local stage="$1" name="$2"
  shift 2
  if [[ -z "${TIMING:-}" ]]; then "$@"; return; fi
  "$PYTHON" pipeline/timing.py begin "$TIMING" "$stage" "$name"
  local rc=0
  "$@" || rc=$?
  "$PYTHON" pipeline/timing.py end "$TIMING" "$rc"
  return "$rc"
}
timing_set() { if [[ -n "${TIMING:-}" ]]; then "$PYTHON" pipeline/timing.py set "$TIMING" "$1" "$2"; fi; }

#!/bin/sh
# Install the SDD coordinator entrypoint and role pack.
#
#   install.sh global  [--dry-run] [--force]
#   install.sh project [--dry-run] [--force] [--repo <path>]
#
# global : ~/.claude/agents/sdd-orchestrator.md and ~/.agents/orca-sdd/
# project: <repo>/.claude/agents/sdd-orchestrator.md and <repo>/.agents/orca-sdd/
#          (<repo> defaults to the Git root of the current directory)
#
# Idempotent. A managed file that differs from the source is reported and left
# alone unless --force is given, in which case the old file is kept as <file>.bak.
# Nothing else in the target directories is touched. Exit 0 when the install is
# complete and identical to the source, 1 when a differing file blocked it, 2 on usage.
set -eu

SRC=$(cd "$(dirname "$0")/pack" && pwd)
SCOPE=${1:-}; shift 2>/dev/null || true
DRY=0; FORCE=0; REPO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    --repo) REPO=${2:?--repo needs a path}; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

case "$SCOPE" in
  global) AGENTS="$HOME/.claude/agents"; PACK="$HOME/.agents/orca-sdd" ;;
  project)
    [ -n "$REPO" ] || REPO=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not inside a Git repository; pass --repo" >&2; exit 2; }
    AGENTS="$REPO/.claude/agents"; PACK="$REPO/.agents/orca-sdd" ;;
  *) sed -n '2,12p' "$0" >&2; exit 2 ;;
esac

blocked=0
put() { # put <source> <destination>
  s=$1; d=$2
  if [ -f "$d" ]; then
    if cmp -s "$s" "$d"; then echo "same     $d"; return; fi
    if [ "$FORCE" -eq 0 ]; then echo "DIFFERS  $d (use --force to replace, old copy kept as .bak)"; blocked=1; return; fi
    echo "replace  $d (backup $d.bak)"
    [ "$DRY" -eq 1 ] || { cp -p "$d" "$d.bak"; cp "$s" "$d"; }
    return
  fi
  echo "install  $d"
  [ "$DRY" -eq 1 ] || { mkdir -p "$(dirname "$d")"; cp "$s" "$d"; }
}

[ "$DRY" -eq 1 ] && echo "dry run: nothing will be written"
put "$SRC/sdd-orchestrator.md" "$AGENTS/sdd-orchestrator.md"
for f in workflow.md task-brief.md launch-recipes.md; do put "$SRC/$f" "$PACK/$f"; done
for f in "$SRC"/roles/*.md; do put "$f" "$PACK/roles/$(basename "$f")"; done

if [ "$blocked" -eq 1 ]; then echo "install incomplete: differing files left in place" >&2; exit 1; fi
echo "entrypoint: $AGENTS/sdd-orchestrator.md"
echo "pack:       $PACK"
echo "start the coordinator inside an Orca terminal in the integration checkout: claude --agent sdd-orchestrator"

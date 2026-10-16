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
# Nothing else in the target directories is touched, and nothing is written through
# a symlink: a linked file or directory on the managed path aborts the install, and
# every write goes to an exclusively created temp file that is renamed over the
# target. Threat model: hostile content committed into a repository before a
# project install. A local process racing the installer on the same machine is
# out of scope.
# Exit 0 when the install is complete and identical to the source, 1 when a
# differing file or a symlink blocked it, 2 on usage.
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
    REPO=$(cd "$REPO" 2>/dev/null && pwd -P) || { echo "--repo path does not exist" >&2; exit 2; }
    AGENTS="$REPO/.claude/agents"; PACK="$REPO/.agents/orca-sdd" ;;
  *) sed -n '2,12p' "$0" >&2; exit 2 ;;
esac

blocked=0
nolink() { # refuse to write through a symlink anywhere on the managed path
  p=$1
  case "$p" in /*) ;; *) echo "internal: non-absolute path $p" >&2; exit 2 ;; esac
  while [ "$p" != "/" ]; do
    if [ -L "$p" ]; then echo "REFUSED  $p is a symlink; the installer only writes to real files and directories" >&2; exit 1; fi
    case "$p" in "$HOME"|"$REPO") return ;; esac
    p=$(dirname "$p")
  done
}
put() { # put <source> <destination>
  s=$1; d=$2
  nolink "$d"
  if [ -f "$d" ]; then
    if cmp -s "$s" "$d"; then echo "same     $d"; return; fi
    if [ "$FORCE" -eq 0 ]; then echo "DIFFERS  $d (use --force to replace, old copy kept as .bak)"; blocked=1; return; fi
    echo "replace  $d (backup $d.bak)"
    [ "$DRY" -eq 1 ] || { nolink "$d.bak"; mv -f "$d" "$d.bak"; write "$s" "$d"; }
    return
  fi
  echo "install  $d"
  [ "$DRY" -eq 1 ] || { mkdir -p "$(dirname "$d")"; write "$s" "$d"; }
}
write() { # copy into a fresh mktemp file beside the target (created exclusively, so no
  # pre-planted name can be followed), then rename over the target; rename replaces a
  # symlink entry instead of following it
  dir=$(dirname "$2"); nolink "$dir"
  t=$(mktemp "$dir/.sdd-install.XXXXXX") || exit 1
  cp "$1" "$t" && chmod 644 "$t" && mv -f "$t" "$2"
}

[ "$DRY" -eq 1 ] && echo "dry run: nothing will be written"
put "$SRC/sdd-orchestrator.md" "$AGENTS/sdd-orchestrator.md"
for f in workflow.md task-brief.md launch-recipes.md; do put "$SRC/$f" "$PACK/$f"; done
for f in "$SRC"/roles/*.md; do put "$f" "$PACK/roles/$(basename "$f")"; done

if [ "$blocked" -eq 1 ]; then echo "install incomplete: differing files left in place" >&2; exit 1; fi
echo "entrypoint: $AGENTS/sdd-orchestrator.md"
echo "pack:       $PACK"
echo "start the coordinator inside an Orca terminal in the integration checkout: claude --agent sdd-orchestrator"

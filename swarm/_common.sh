# Shared setup for the swarm scripts. Sourced, not run. Works with the bash that ships on macOS (3.2) and on Linux.
#
# Sets:
#   KIT        the kit folder (the parent of swarm/)
#   GAME_DIR   the game folder: $HELPER_GAME_DIR if set (relative paths are relative to KIT), else KIT/my-game
#   REPO       the main git folder that holds the game (my-game's own repo if it has one, else the kit's)
#   GAME_REL   the game folder's path inside REPO ("." if the game is the repo)
#   WT_ROOT    where builder worktrees live: next to REPO, in "<repo folder name>-worktrees/"
#              (outside the repo, so the game's tools and file watchers never scan them)

say()  { printf '%s\n' "$*"; }
fail() { printf 'Stopped: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is not installed. Run: node tools/doctor.mjs --fix"

KIT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)

GAME_DIR=${HELPER_GAME_DIR:-my-game}
case $GAME_DIR in /*) ;; *) GAME_DIR="$KIT/$GAME_DIR" ;; esac
if [ -d "$GAME_DIR" ]; then GAME_DIR=$(cd "$GAME_DIR" && pwd -P); fi

# The repo: the game's, if the game folder exists and is inside one; otherwise the kit's.
if [ -d "$GAME_DIR" ] && git -C "$GAME_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
  HERE=$(cd "$(git -C "$GAME_DIR" rev-parse --show-toplevel)" && pwd -P)
elif git -C "$KIT" rev-parse --show-toplevel >/dev/null 2>&1; then
  HERE=$(cd "$(git -C "$KIT" rev-parse --show-toplevel)" && pwd -P)
else
  fail "this folder is not a git repository yet, so builders can't get their own copies.
Ask your agent to run:  git init && git add -A && git commit -m \"Start\""
fi

# The main folder of the repo is the first entry of `git worktree list`.
REPO=$(git -C "$HERE" worktree list --porcelain | sed -n '1s/^worktree //p')
REPO=$(cd "$REPO" && pwd -P)
IN_LINKED_WORKTREE=0
[ "$HERE" != "$REPO" ] && IN_LINKED_WORKTREE=1

# Where the game sits inside the repo.
GAME_REL=.
if [ -d "$GAME_DIR" ]; then
  case $GAME_DIR in
    "$HERE") GAME_REL=. ;;
    "$HERE"/*) GAME_REL=${GAME_DIR#"$HERE"/} ;;
  esac
else
  GAME_REL=my-game
fi

WT_ROOT="$(dirname "$REPO")/$(basename "$REPO")-worktrees"

require_main_folder() {
  if [ "$IN_LINKED_WORKTREE" = 1 ]; then
    fail "run this from the main game folder ($REPO), not from a builder's worktree."
  fi
}

valid_name() {
  printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9-]{0,39}$'
}

# Lists uncommitted changes (modified, staged, or new files that git doesn't ignore). Empty output = clean.
dirty() {
  git -C "$1" status --porcelain 2>/dev/null
}

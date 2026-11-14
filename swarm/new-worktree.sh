#!/usr/bin/env bash
# Give one builder its own copy of the game to work in, so several agents can build at once without
# stepping on each other's files.
#
#   bash swarm/new-worktree.sh <name> [--force]
#
# Makes a git worktree (a second working folder that shares the same history) at
#   ../<repo folder>-worktrees/<name>      on a new branch  swarm/<name>,  started from the current commit.
# Copies my-game/node_modules into it (an instant copy-on-write clone where the disk supports it; a fresh
# `npm install` if there's nothing to copy), so the game runs there straight away.
# A copy, not a symlink: Vite keeps a cache inside node_modules, and two dev servers sharing one cache fight.
#
# Refuses if the main folder has uncommitted changes (a builder would start without them). --force skips that check.
# When the builder is done: bash swarm/merge-worktree.sh <name>.   See them all: bash swarm/list.sh
set -u
. "$(dirname "$0")/_common.sh"

NAME="" FORCE=0
for a in "$@"; do
  case $a in
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) fail "unknown option $a" ;;
    *) [ -z "$NAME" ] && NAME=$a || fail "one name only (got '$NAME' and '$a')" ;;
  esac
done
[ -n "$NAME" ] || fail "give the builder a name, e.g.: bash swarm/new-worktree.sh feel"
valid_name "$NAME" || fail "'$NAME' isn't a good name. Use lowercase letters, numbers and dashes (e.g. feel, ui-menus)."
require_main_folder

BRANCH="swarm/$NAME"
WT="$WT_ROOT/$NAME"

git -C "$REPO" rev-parse --verify --quiet HEAD >/dev/null || fail "the repository has no commits yet. Commit once first."
if git -C "$REPO" rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null; then
  fail "a builder called '$NAME' already exists (branch $BRANCH). Merge it (bash swarm/merge-worktree.sh $NAME) or pick another name."
fi
[ -e "$WT" ] && fail "the folder $WT already exists. Pick another name, or remove that folder if it's left over."

CHANGES=$(dirty "$REPO")
if [ -n "$CHANGES" ] && [ "$FORCE" != 1 ]; then
  say "The main folder has changes that aren't committed:"
  printf '%s\n' "$CHANGES" | head -20
  fail "commit them first (the builder starts from the last commit and would not see them), or add --force."
fi

mkdir -p "$WT_ROOT" || fail "couldn't create $WT_ROOT"
git -C "$REPO" worktree add --quiet -b "$BRANCH" "$WT" HEAD || fail "git couldn't create the worktree."

# Make the game runnable in the new folder.
DEPS="installed nothing (no game folder yet)"
WT_GAME="$WT/$GAME_REL"; [ "$GAME_REL" = . ] && WT_GAME="$WT"
SRC_MODULES="$REPO/$GAME_REL/node_modules"; [ "$GAME_REL" = . ] && SRC_MODULES="$REPO/node_modules"
if [ -f "$WT_GAME/package.json" ]; then
  if [ -d "$SRC_MODULES" ]; then
    case $(uname -s) in
      Darwin) cp -cR "$SRC_MODULES" "$WT_GAME/node_modules" 2>/dev/null || cp -R "$SRC_MODULES" "$WT_GAME/node_modules" ;;
      *)      cp -R --reflink=auto "$SRC_MODULES" "$WT_GAME/node_modules" 2>/dev/null || cp -R "$SRC_MODULES" "$WT_GAME/node_modules" ;;
    esac
    rm -rf "$WT_GAME/node_modules/.vite"   # Vite's cache belongs to one folder; let this copy build its own.
    DEPS="copied node_modules from the main folder"
  elif command -v npm >/dev/null 2>&1; then
    say "Installing the game's packages in the new folder (a minute or two)..."
    if (cd "$WT_GAME" && npm install --no-audit --no-fund --loglevel=error); then
      DEPS="ran npm install"
    else
      DEPS="npm install FAILED: run it in $WT_GAME before testing"
    fi
  else
    DEPS="node_modules missing and npm not found: run node tools/doctor.mjs --fix"
  fi
fi

cat <<MSG

Builder '$NAME' is ready.
  Folder:  $WT
  Branch:  $BRANCH (started from $(git -C "$REPO" rev-parse --short HEAD))
  Game:    $WT_GAME ($DEPS)

For the builder:
  - Work only inside $WT. Edit only the files in your row of CONTRACTS.md.
  - Commit only your own files:  git commit -m "<area>: <what>" -- <your files>
  - Don't push, merge, rebase or switch branches.
  - Don't run tools/serve.mjs from here: it uses the main game's port. The director checks the merged game.
    Tests that need no browser are fine. For anything that must be seen in the game, say exactly what to look
    for in your report; the director checks it after merging (one browser at a time on this machine).

For the director, when the builder reports back:
  - Review:  git diff HEAD...$BRANCH
  - Merge:   bash swarm/merge-worktree.sh $NAME     (merges, checks the game still runs, removes the folder)
MSG

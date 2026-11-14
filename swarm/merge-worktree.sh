#!/usr/bin/env bash
# Bring one builder's finished work back into the main game, after the director has reviewed the diff.
#
#   bash swarm/merge-worktree.sh <name> [--keep] [--no-check] [--force]
#
# 1. Refuses if the builder left uncommitted changes in its worktree (nothing is ever thrown away).
# 2. Refuses if the main folder has uncommitted changes (--force skips this one check).
# 3. Merges branch swarm/<name> into the main folder's current branch (a merge commit, so it's easy to undo).
#    On a conflict it backs out completely and lists the files; nothing is half-merged.
# 4. Runs `node tools/serve.mjs --check` to prove the game still loads and draws (--no-check skips it).
# 5. Removes the worktree folder and deletes the branch (--keep leaves both).
# If the check fails, the merge stays, the worktree is kept, and it prints how to undo the merge.
set -u
. "$(dirname "$0")/_common.sh"

NAME="" KEEP=0 CHECK=1 FORCE=0
for a in "$@"; do
  case $a in
    --keep) KEEP=1 ;;
    --no-check) CHECK=0 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    -*) fail "unknown option $a" ;;
    *) [ -z "$NAME" ] && NAME=$a || fail "one name only (got '$NAME' and '$a')" ;;
  esac
done
[ -n "$NAME" ] || fail "which builder? e.g.: bash swarm/merge-worktree.sh feel   (bash swarm/list.sh shows them)"
valid_name "$NAME" || fail "'$NAME' isn't a builder name."
require_main_folder

BRANCH="swarm/$NAME"
WT="$WT_ROOT/$NAME"
git -C "$REPO" rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null || fail "there's no builder branch $BRANCH. bash swarm/list.sh shows the builders."
TARGET=$(git -C "$REPO" symbolic-ref --quiet --short HEAD) || fail "the main folder isn't on a branch (detached HEAD). Check out your main branch first."

# 1. Never lose a builder's uncommitted work.
if [ -d "$WT" ]; then
  LEFT=$(dirty "$WT")
  if [ -n "$LEFT" ]; then
    say "Builder '$NAME' has changes it didn't commit:"
    printf '%s\n' "$LEFT" | head -20
    fail "ask the builder to commit its own files (git commit -- <paths>) or say they can go, then run this again."
  fi
fi

# 2. The main folder must be clean, or the merge could tangle with half-done edits.
CHANGES=$(dirty "$REPO")
if [ -n "$CHANGES" ] && [ "$FORCE" != 1 ]; then
  say "The main folder has changes that aren't committed:"
  printf '%s\n' "$CHANGES" | head -20
  fail "commit them first, or add --force."
fi

cleanup() {
  [ "$KEEP" = 1 ] && { say "Kept the worktree ($WT) and branch $BRANCH (--keep)."; return 0; }
  if [ -d "$WT" ]; then
    # Only ignored files (node_modules, caches) can be left at this point; it was checked clean above.
    git -C "$REPO" worktree remove --force "$WT" || { say "Couldn't remove $WT; remove it by hand later."; return 0; }
  fi
  git -C "$REPO" worktree prune
  git -C "$REPO" branch -d "$BRANCH" >/dev/null 2>&1 || say "Kept branch $BRANCH (git says it isn't fully merged)."
  rmdir "$WT_ROOT" 2>/dev/null || true
  say "Removed the worktree and branch for '$NAME'."
}

# 3. Merge.
AHEAD=$(git -C "$REPO" rev-list --count "HEAD..$BRANCH")
if [ "$AHEAD" = 0 ]; then
  say "Builder '$NAME' has no new commits (nothing to merge)."
  cleanup
  exit 0
fi
say "Merging $AHEAD commit(s) from $BRANCH into $TARGET:"
git -C "$REPO" log --oneline "HEAD..$BRANCH" | head -20
git -C "$REPO" diff --stat "HEAD...$BRANCH" | tail -15
if ! OUT=$(git -C "$REPO" merge --no-ff --no-edit -m "Merge $BRANCH (builder $NAME)" "$BRANCH" 2>&1); then
  CONFLICTS=$(git -C "$REPO" diff --name-only --diff-filter=U)
  git -C "$REPO" merge --abort 2>/dev/null
  if [ -z "$CONFLICTS" ]; then
    printf '%s\n' "$OUT" | tail -10
    fail "git refused the merge (message above). Nothing was merged."
  fi
  say ""
  say "Conflict: this builder and the main folder both changed the same lines in:"
  printf '  %s\n' $CONFLICTS
  fail "nothing was merged. Two builders probably edited the same file (check CONTRACTS.md). Either ask builder
'$NAME' to bring in the latest work (in its worktree: git merge $TARGET, fix the conflict, commit) and run this
again, or merge the other builder first."
fi
MERGE=$(git -C "$REPO" rev-parse --short HEAD)
say "Merged as $MERGE."

# 4. Prove the game still runs.
if [ "$CHECK" = 1 ]; then
  if [ -f "$KIT/tools/serve.mjs" ] && [ -d "$GAME_DIR" ] && command -v node >/dev/null 2>&1; then
    say "Checking the game still loads and draws..."
    if ! (cd "$KIT" && node tools/serve.mjs --check); then
      say ""
      say "The merge is in ($MERGE), but the game check failed. The worktree is kept so the builder can fix it."
      say "Fix it in the main folder, or undo the merge with:  git revert -m 1 --no-edit $MERGE"
      exit 1
    fi
  else
    say "Skipped the game check (no tools/serve.mjs, no game folder, or no node). Run node tools/serve.mjs --check yourself."
  fi
fi

# 5. Tidy up.
cleanup

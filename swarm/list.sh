#!/usr/bin/env bash
# Show every builder (worktree and branch): how many commits it has that the main folder doesn't,
# whether it left uncommitted changes, and its last commit.
#
#   bash swarm/list.sh
set -u
. "$(dirname "$0")/_common.sh"

say "Main folder: $REPO  (branch $(git -C "$REPO" symbolic-ref --quiet --short HEAD || echo detached))"
say "Builders live in: $WT_ROOT"
say ""

FOUND=0
for BR in $(git -C "$REPO" for-each-ref --format='%(refname:short)' 'refs/heads/swarm/'); do
  FOUND=1
  NAME=${BR#swarm/}
  WT="$WT_ROOT/$NAME"
  AHEAD=$(git -C "$REPO" rev-list --count "HEAD..$BR")
  BEHIND=$(git -C "$REPO" rev-list --count "$BR..HEAD")
  LAST=$(git -C "$REPO" log -1 --format='%cr: %s' "$BR")
  if [ -d "$WT" ]; then
    N=$(dirty "$WT" | wc -l | tr -d ' ')
    if [ "$N" = 0 ]; then STATE="clean"; else STATE="$N uncommitted change(s)"; fi
    WHERE=$WT
  else
    STATE="no folder"; WHERE="(worktree folder missing)"
  fi
  say "$NAME"
  say "  branch $BR: $AHEAD new commit(s) to merge, $BEHIND behind the main folder; $STATE"
  say "  folder $WHERE"
  say "  last   $LAST"
done
[ "$FOUND" = 1 ] || say "No builders right now. Start one with: bash swarm/new-worktree.sh <name>"

# Worktrees git knows about that aren't swarm builders (or whose folders were deleted by hand).
OTHER=$(git -C "$REPO" worktree list | sed '1d' | grep -v "\[swarm/" || true)
if [ -n "$OTHER" ]; then
  say ""
  say "Other worktrees:"
  printf '%s\n' "$OTHER"
fi

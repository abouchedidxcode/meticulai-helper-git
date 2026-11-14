# The first 60 seconds

**The rule:** teach by doing, not by reading. Something should happen within 5 seconds of pressing Play. The player
should succeed at the core verb within about 30 seconds. Explain each thing at the moment it first happens, never on a
timer. When the player dies, tell them exactly what killed them.

## Evidence

**"I just don't really know what's going on."** Rootbound is a pixel-art game about a tree growing roots underground.
After its art was rebuilt, the creator wrote: "looks gorgeous, I just don't really know what's going on." The game had
water, sugar, minerals, pests, rot, fungi trades, rivals and a persistent forest, and nothing taught them. The fix had
two parts:
- Four **welcome cards** on the first visit, each with a small animated pixel diagram instead of a paragraph.
- A **guided first season** on a fixed plot: no rival, no random pests, mild weather, and the tree can't die. Twelve
  coach cards walk through one action each (grow a root to water, read the meters, tap a beetle, prune rot, link the
  fungi), with dotted guides and rings pointing at the real target. Info cards pause the game.
See [the Rootbound case study](../case-studies/rootbound.md).

**Stage events instead of writing text.** Echo is a stealth game where creatures hunt by sound. Its first minute taught
with story lines and captions. The team turned them off by default, and "each line cut was replaced by an event that
shows the same thing": instead of a line saying guards hear thrown stones, the nave guard clicks three times over the
stone you just threw. The rule they wrote down: "A new line needs a reason no event can give." The creator had also
been stuck at the crypt "no matter what I did," so detection got a visible ~1.1 s "alert" beat before a creature hunts:
you see that it heard you, and you have time to react.

**Explain it the moment it happens.** Still Life 2 was tested by blind agent players who were told nothing. Hints that
rotated on a timer showed up mid-fight, about something else. The fix was first-time explanations triggered by the
event itself:
- the first aim ring on screen: "A PINK RING CLOSING ON A GUN: A SHOT IS COMING. GET OUT OF ITS LINE."
- the first catch: "CAUGHT IN THE AIR. ANYTHING FLYING CAN BE GRABBED"
- the first REPRINT: "YOU TOOK ITS BODY, ITS PLACE AND ITS GUN"

**Death cards teach more than tutorials.** In the same game, one blind tester said the death screens were "the only
reason I learned anything." That was after they had been rewritten from "YOU MOVED WRONG. SHOT" (no shooter, no
direction) to lines like "SHOT · BY A SHOTGUNNER · FROM BEHIND," and hazard deaths to "CRUSHED UNDER A STAMP." Every
death should answer: what killed me, from where, and what could I have done.

**Something happens in 5 seconds.** Still Life 2's elevator room opened on three seconds of dead air; the doors now
open after 2.6 s instead of 4. The room title fades 0.25 s after your first move so it never covers the first enemies.
Inkbound's first critic counted "5 s of dead air after a KO"; the gap to the next round became 2.8 s. Fireflies' dusk
was meant to turn to night over the session; the creator's note was "make the sky change colour faster so it shows in a
short demo," so it is now about halfway to night by 30 s.

**A first win in 30 seconds.** Last Drop placed three wide, shallow "welcome puddles" at 38, 66 and 96 m, exactly where
a drop rolls if you don't steer, and made the sand drink half as fast for the first 30 m. A bot that never steered went
from 240-355 m to 380-540 m. Its tutorial is four lines (steer, hold, let go at the top, drink), and each line waits
until you've done it. Godhand's training ended in a guided win: the enemy stays asleep until the finale.

**Teach by the opponents.** Inkbound's ladder gives each rival one idea ("the second guards too much (learn Stroke)"),
and the first duel coaches inside the fight, not before it.

## How to apply it

- [ ] Time it: from pressing Play, does something move, sound or threaten within 5 s? Fix any dead air first.
- [ ] Put a guaranteed first success where the player will be anyway (the default path, the first room) within 30 s.
- [ ] Replace every paragraph of instructions with a staged event or a short line triggered when the thing first
      happens. Keep any tutorial to one action per step, and wait until the player has done it.
- [ ] Make the first session safe if the game is complex: a fixed level, no random threats, no losing.
- [ ] Rewrite every death or fail screen to say what got them, from where, and what to try. Test it with a
      newcomer critic who has never seen the game (`agents/critic-newcomer.md`).
- [ ] Save "seen it" flags (first visit, tutorial done) so returning players skip the teaching, and add a menu item to
      see it again.
- [ ] Ask the person after their first play: "What did you think you were supposed to do?" If their answer doesn't
      match `GREAT.md`, the first minute isn't done.

Related: [what makes it fun](what-makes-it-fun.md), [who to trust](who-to-trust.md),
[Still Life](../case-studies/still-life.md).

# One sentence, one verb, one twist

**The rule:** before building anything, write the game in one sentence. The sentence names one thing the player does
(the verb) and one rule that is different from every other game in its genre (the twist). If you can't write it, you
are not ready to build. If a feature doesn't serve that sentence, it waits.

## Evidence

**The games people remember had a sentence you could say out loud.**

- **Still Life:** "Time moves only when you move." That one rule made a first-person shooter into a puzzle you can read.
  It is the creator's favourite game. A blind playtester put it this way: "every encounter becomes a little puzzle you
  can read and solve."
- **Don't Blink:** "You can only move while your eyes are closed, and it only moves while you can't see it." The webcam
  watches your eyes. The horror is the moment you open them and see what changed.
- **Last Drop:** you are a drop of water rolling down desert dunes, and dry sand drinks you. The verb is steering; the
  twist is that your health is your size, and you can see it shrink.
- **Under Glass:** catch a giant hornet under a glass bowl. One verb, one object, one room.

**The twist is a rule, not a look.** In Lost Marbles the look also fits in one sentence: "macro photography of a toy
run." That sentence decided the camera (tilt-shift, shallow depth of field), the scale and the lighting. Look sentences
help. But the game sentence comes first, because a look can't save a game with no verb.

**When the sentence got buried, the game died.** Inkbound's pitch was a sword duel where your strikes paint the stage.
After 77 build cycles, the first version had chains, launchers, sweeps, guard, parry, three ink casts, a super and
rocks. Its own post-mortem: "Too many systems, none of them the game. The concept's hook (strikes write the stage)
ended up as a one-use rock." The creator's verdict was "still doesn't feel fun whatsoever." The rebuild started from
the sentence again: "Fights literally write their stage." Only the heavy stroke paints, and there are three pieces of
terrain, each with one clear use. See [the Inkbound case study](../case-studies/inkbound.md).

**A sentence is not enough if a video makes it look like another game.** Still Life 2 changed the rule: the room runs
in real time, you hold a button to slow it, and the only way to refill the meter is to stand still. That turned the
game's name into the resource. Then the team cut a short highlights reel and showed it to blind "spectator" agents,
nine drafts in all. Eight spectators in a row described it first as "Superhot with a filter." The log says: "Editing
can't fix that; the fix is a moment that only this game can produce." The two moments that only Still Life 2 can produce
were REPRINT (jump into an enemy's body and take its gun) and standing still while enemies walk toward you so the meter
refills. Both blind players who reached the late rooms named REPRINT as the best thing in the game, without being told
what it does. Every spectator from draft 4 on picked the stand-still refill as the best shot.

**A clear sentence also makes A/B tests possible.** Because Still Life 2's new rule was one switch, the team could hand
three blind players two unlabelled builds. Two preferred the new rule. All three said it was the better one to watch.
The old rule stayed in as an option instead of being thrown away.

## Why this works with AI agents

Agents are very good at adding systems. Ask for "a samurai fighting game" and you get every fighting-game system at
once. A one-verb sentence gives every agent the same filter: does this change serve the verb and the twist? It also
gives critics something to judge against. "Is the twist visible in the first 30 seconds?" is a question a critic can
answer. "Is it good?" is not.

## How to apply it

- [ ] Write the sentence in `my-game/GREAT.md` before any code: "You are ___. You ___ (one verb). Unlike other ___
      games, ___ (the twist)."
- [ ] Check the twist is a **rule** that changes what the player does, not a look, a setting or a theme.
- [ ] Name one moment only this game can produce. If it could happen in another well-known game, keep looking.
- [ ] List every planned system. Cut or postpone each one that doesn't serve the verb or the twist. Aim for one verb and
      at most two supporting actions in the first playable.
- [ ] If the twist can be a switch, build it as one, so you can A/B it blind against the plain version.
- [ ] After the first recorded play-through, ask a fresh critic to describe the game in one sentence. If their sentence
      names another game ("X with a filter"), the twist isn't visible yet. Make it visible in the picture, not in a caption.
- [ ] Re-read the sentence every few rounds. If the build has drifted, say so in `DECISIONS.md` and either pull it back
      or rewrite the sentence on purpose.

Related: [what makes it fun](what-makes-it-fun.md), [first 60 seconds](first-60-seconds.md),
[Still Life](../case-studies/still-life.md).

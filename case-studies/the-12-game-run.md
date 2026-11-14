# The 12-game run

**What it was:** twelve games built at once over a weekend, each by its own agent session on one laptop, judged mostly
by matching still frames to AI concept art. None of them is on the site.

## What happened

Ten new games started from concept clips and reference packs: Tidecaller, Echo, Inkbound, Abyssal, Dig Site, Dune Sails,
Lava Lamp, Kite Fight, Orbitball and Mycelium, plus two ongoing projects. Each session got its own git worktree, port
range and a $75 generation cap. The brief set a very high bar ("people are surprised at AI and they can't believe it's
AI"), asked sessions to work alone for 24 hours, never say "done," and wake every ~60 seconds.

**The first course correction.** After seeing screenshots, the creator wrote: "it seems like they're making quick
games that look like ai slop instead of an intentional and visually stunning and impressive game that is also fun to
play." The captures showed box cities, plain spheres with dot eyes, flat lighting, empty scenes. The response was a
**visual gate**: pick three target frames from the concept, render the game from the same camera, have an image-only
reviewer score eight axes, and pass only at 8 or more everywhere. "Stop adding features until the game passes the
visual gate."

**The numbers.**
- After about 30 hours, each game had 100 to 200 commits and was still on its first milestone, scoring around 5 to 7.
- Tidecaller: **138** gate rounds. Round 1 scored about 45 / 48 / 44 out of 80; round 138 scored 43.5 / 51.5 / 46.5.
  Tweaks included "made every barrel 1.2x" and "made the front right-hand house teal."
- Dig Site: about 98 gate rounds before the gate was retired.
- Echo: about 95 passes. Its verdict: "the loop was one small visual tweak, a still, and a blind score whose noise
  (+-0.75) was as big as the tweak, while nobody judged how the game plays."
- Dune Sails: 46 rounds, "Plateau near 5" from round 20.
- Orbitball scored 6.5 to 7.3 while its real camera was stuck in a wall (see [Orbitball](orbitball.md)).

**The machine and the budget.** Twelve sessions overloaded one laptop and killed each other's test browsers. At one
point every session was force-stopped "even if progress was lost." Wake-ups every ~60 seconds re-read each session's
whole context and burned usage for nothing.

## What replaced it

A one-page **focus brief** cut the run to six games and changed the method:
1. Write down what great is, from first principles, in `GREAT.md`: the fantasy, the 30-second loop, three moments a
   player would tell a friend, the feel, the look in words, what the best games in the genre get right. Then rank the
   five biggest gaps.
2. Make big moves, not dials: controls, camera, feedback, the first 60 seconds, level design.
3. Use subagents as builders, split by system or file.
4. Judge by recorded play-throughs watched by a fresh critic: "is this fun? does it feel great? what's the weakest
   moment?"
5. Have a playable build and a short "Play this" note ready for the person in about two hours.
6. Don't poll: let agents and recordings wake you, with a 20-30 minute fallback.

## What improved after

- **Dig Site:** a faster brush and an auto-finish for nearly uncovered bones. The play bot went from 52% of the site
  (2 of 13 bones) after about 5 minutes to all 13 in 2:49.
- **Kite Fight:** locked strings. Duels that never ended now end in a cut within 1.4 to 5.5 s; the whole campaign was
  completed for the first time.
- **Abyssal:** each sonar ping sketches the cave walls as glowing points; the next critic called it "the best visual in
  the game." Critics still said "not yet fun."
- **Echo:** a measured darkness tool settled an argument (11% vs 39% black frames); story text was replaced by staged
  events.
- **Inkbound:** later rebuilt from scratch after the person played it (see [Inkbound](inkbound.md)).

Honest result: better, not great. In Kite Fight, for example, critics went from "looks expensive, plays like a
prototype" to "half fun." The rule the
creator wrote afterwards: run a few games at a time, set goals about how the game plays, use subagents as builders,
judge by recorded play-throughs watched by a fresh critic, and get a person to play a build between rounds.

## The lesson

Scoring stills against concept art produces activity, not progress. Scoring play, with big moves and a person in the
loop, produces progress.

## What your agent should copy

- [ ] Write `GREAT.md` and the five biggest gaps before any polish round.
- [ ] Judge every round by a recorded play-through and a fresh critic, never by a still alone.
- [ ] Measure the scoring noise once; ignore changes smaller than it.
- [ ] Respect `maxAgents`; run one browser at a time.
- [ ] No polling loops. Let work finish and wake you.
- [ ] Hand the person a playable build with a "Play this" note at the end of every round.

Related: [big moves, not dials](../playbook/big-moves-not-dials.md), [picking a look](../playbook/picking-a-look.md).

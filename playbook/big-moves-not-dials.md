# Big moves, not dials

**The rule:** each round of work should change something a player would notice in the first minute: a mechanic, the
camera, the controls, a whole stretch of the level, the way a fight ends. Don't spend rounds nudging one number and
re-scoring. If three rounds in a row move the score by less than the noise, stop and change something different in kind.

## Evidence

**Twelve games, one weekend, almost no progress.** In one run, twelve games were built at once, each by its own agent
session, for about 30 hours. Each game's loop was: make one small visual tweak, take a still, have a reviewer agent
score it blind against AI concept art, repeat. Each game ended up with 100 to 200 commits and was still on its first
milestone, scoring around 5 to 7 out of 10. See [the 12-game run](../case-studies/the-12-game-run.md).

**The tweaks were smaller than the noise.** The numbers show it plainly:
- Tidecaller ran **138** scoring rounds. Round 1 scored about 45 / 48 / 44 out of 80 on its three frames. Round 138
  scored 43.5 / 51.5 / 46.5. Net change: about zero. The tweaks included "shrank the child's head 1.12 to 1.0," "made
  every barrel 1.2x" and "made the front right-hand house teal."
- The same unchanged Tidecaller frame, scored twice in one hour, drifted about 5 points. In Echo, a score moved about
  plus or minus 0.75 "with no change at all."
- In Dig Site, five lighting changes in a row all scored 37.3 to 41.3, below the untouched image. Then the untouched
  image was re-scored and came out 44.3. The log: "single-dial lighting moves sit inside the reviewer noise."

**What replaced it.** A short new brief told each game to write down what great means (the fantasy, the 30-second
loop, three moments a player would tell a friend, the feel, the look in words) in a file called `GREAT.md`, then list
the **five biggest gaps** between that and the current build, ranked by how much they hurt. Then fix the top gap with
a big move, judged by a recorded play-through. Dig Site's five gaps read like a player talking: "the pace is a
trickle," "the tail drags," "strikes have no weight," "the found moment is flat," "the first minute has no hook."

**Big moves that worked:**
- **Dig Site, the auto-finish.** A fossil only counted when 90% uncovered, so the end of every bone was "a hunt for the
  last specks." Big moves: a wider, faster brush (uncovering a test plate went from 19.7 s to 5.1 s), and a finish that
  flakes the last crust off by itself once a bone is mostly exposed. The play bot went from 52% of the site (2 of 13
  bones) after about 5 minutes to all 13 in 2:49. (That was the bot; no person had played it yet.)
- **Abyssal, sonar draws the world.** A critic watching a play-through saw 140 s stuck in a side pocket of a dark cave.
  Its top ask: "each ping sketches the cave walls as glowing points that fade." The next critic called it "the best visual
  in the game": navigation and look fixed in one move. (Critics still said "not yet fun." A big move fixes one gap.)
- **Hezarfen, cut the route.** A flight over a city took 5:47 in one build. A critic: "a beautiful 20-second launch and
  a good 20-second landing, with nearly four minutes between them where the player has nothing to do." Whole legs of
  the route were removed; runs came in around 4 minutes (3:55 to 4:16).
- **Kite Fight, locked strings.** Kite duels never ended: crossed strings came apart and re-hooked forever. The move: once strings bite, they stay locked, and
  wear grows with time, so even a slow fight ends in about 15 s. Next recording: six hooks, every one ending in a cut
  within 1.4 to 5.5 s. That evening the whole campaign was completed for the first time.

None of these is a dial. Each one changes what the player does or sees every few seconds.

## The plateau rule

From Kite Fight's notes: "when a frame stays within one point for three rounds, change something different in kind."
One of its frames sat at 6 to 7 for eight rounds before anyone switched approach. Don't wait eight rounds.

## How to apply it

- [ ] Before a round, write in `DEVLOG.md` what will change and what a player should notice. If you can't name what
      they'd notice in the first minute, the move is too small.
- [ ] Keep the five biggest gaps, ranked, at the top of `HANDOVER.md`. Work on gap 1. Re-rank after each round.
- [ ] Judge each round by a recorded play-through watched by a fresh critic, not by a still and a score.
- [ ] Learn the noise first: score one unchanged build twice. Any change smaller than that difference is no signal.
- [ ] Plateau rule: three rounds without a gain bigger than the noise means change approach (a different system,
      camera, rule or level), not the next dial.
- [ ] Numbers are fine for tuning after a big move lands (speeds, timings, damage). Use bots for that, not critic scores.
- [ ] Hand the build to the person after every big move. Their reaction decides the next gap.

Related: [who to trust](who-to-trust.md), [when to start over](when-to-start-over.md),
[the 12-game run](../case-studies/the-12-game-run.md).

# Case studies

Real games from about 60 made with AI agents (meticulai.com): what worked, what didn't, and what your agent should copy.
The rules these stories add up to are in the [playbook](../playbook/README.md).

## Games that worked

| Case study | One line | The lesson |
| --- | --- | --- |
| [Still Life and Still Life 2](still-life.md) | Time moves only when you move | One sharp rule, then blind strangers show you everything that's still invisible |
| [Lost Marbles and Marble Golf](lost-marbles.md) | 50 glass marbles racing through a kid's room | A one-sentence look on real physics; reuse a proven kit whole |
| [Last Drop](last-drop.md) | A drop of water rolling down desert dunes | A tech demo becomes a game when every loss has a visible cause |
| [Fireflies](fireflies.md) | Catch fireflies by closing your hand slowly | Calm as the skill, charitable input, a change in 30 seconds |
| [Dragon Aces](dragon-aces.md) | Dragon dogfights | Protect the feel the person loves; fix "generic AI UI" specifically |
| [Rootbound](rootbound.md) | A tree growing roots underground | Keep rules apart from the look; teach by doing once the person is lost |

## Games that failed, and what they taught

| Case study | One line | The lesson |
| --- | --- | --- |
| [The 12-game run](the-12-game-run.md) | Twelve games at once, judged by stills | 100-200 commits per game and still on the first milestone; judge play instead |
| [Inkbound](inkbound.md) | A sword duel in ink, 77 cycles, then rebuilt | Restart the core from a written design when the foundations are wrong |
| [Orbitball](orbitball.md) | Good scores, unplayable camera | At least one test must see exactly what the player sees |
| [The 22 retired games](retired-games.md) | Party games, paid-AI games, untested webcam games | Nobody played them the way they're meant to be played |

## The pattern across all of them

**The good games had a person playing every build.** Last Drop changed after each short play note. Rootbound changed
look twice and added teaching because the creator said what they saw. Dragon Aces kept its flight because the creator
said it was right. The failed ones were judged by stills, bots or critics while nobody played: Inkbound's 77 cycles,
Tidecaller's 138 scoring rounds, Orbitball's passing scores over a camera stuck in a wall, seven party games no group
ever played.

**The good games had one sentence.** "Time moves only when you move." "Macro photography of a toy run." A drop of water
that the sand drinks. The failures grew systems: Inkbound v0's hook "ended up as a one-use rock."

**The good games made losing readable.** Still Life 2 names your killer and the direction. Last Drop shows steam when
sand drinks you. Abyssal learned that a warning about an unseen hunter "was worse than nothing."

**The good games were cheap to run.** Single-player, everything in code or free assets, no paid calls while playing.
The retired list is full of multiplayer nobody tested and a paid call on every action.

**Big moves beat dials.** Dig Site's auto-finish, Kite Fight's locked strings and Abyssal's sonar each changed what the
player sees every few seconds. Single-dial tweaks were smaller than the scoring noise.

**Everyone admitted what they hadn't checked.** The best handovers list "never heard," "never seen in motion," "never
tested with a real webcam." That honesty is what let the next session, or the person, find the real problems fast.

## How to use these

- **Agent:** when the user's situation matches one of these (it's beautiful but boring; it feels random; it looks like
  a generic AI game; scores aren't moving), read that case study's "What your agent should copy" list and follow it.
- **Human:** read one that sounds like your game. They're short.

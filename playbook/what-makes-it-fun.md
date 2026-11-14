# What makes it fun

**The rule:** a game is fun when the player's choices visibly change what happens, and getting better shows. Every few
seconds the player should decide something, see the result on screen, and understand why it happened. Beauty doesn't
replace this. A beautiful game where your input barely matters is a tech demo.

## Evidence

**The most useful sentence in these notes.** After playing one of the early builds, the creator wrote: "i honestly felt
like i wasnt doing anything." That became the standing bar for every game: a visible, skill-based effect for the
player. Spend more time on the core loop than on polish.

**Beautiful but boring.** Keeper was a lighthouse game on a storm night: a raymarched beam, a procedural ocean, all in
code. The creator's verdict on the first version: "wayyyy too boring," with too much bloom. It was redesigned around
one decision you keep making: lead each ship through a gap in the reef with your light, then let go, because the crew
only holds your course for about 16 s. It was still retired later. Looks bought it attention, not a second play.

**The tech demo trap: Last Drop.** You are a drop of water rolling down desert dunes, losing water to dry sand. The
brief was "i want this to look like a video," and it did. The notes from play, in order:
- "beautiful but it needs to be gamified more"
- "right now it still looks like a tech demo"
- "The goal of the game still isn't super clear and/or motivating"
- then: losing "felt like RNG" (random)

The last note got the best fix, because it was diagnosed instead of patched. The team listed each reason a loss felt
random and made one change per reason:
1. **Readable drain.** Faint steam comes off the drop while sand drinks it, thicker when it sits still or is small.
   As it runs low, the drop clouds over. You can see you're in trouble before you lose.
2. **Water you can count on.** Every other puddle sits on the low line down the valley, about every 45 m. Skill finds
   water; luck doesn't have to.
3. **Warned losses.** A hard landing, a pebble or a thorn bush flashes the drop white and shrinks it visibly, so every
   loss of water has a cause you saw.
4. **A last gasp.** Running dry no longer kills at once. For 1.5 s the drop rolls on its last film of water, and
   reaching water saves it ("Close one").

The risky expert bot went from finishing 3 of 6 courses to 5 of 6. More important, each loss now had a reason the
player saw coming. See [the Last Drop case study](../case-studies/last-drop.md).

**"Not much in my control": Under Glass.** A photoreal living room, a giant hornet, a glass bowl. The creator played it:
"movement is quite slow and hard to know what to do, not much in my control." The fixes added choices: faster walking
(2.6 m/s, Shift to creep), a 4-step objective strip, a marker on the hornet, a "spook" meter so you can see how close
you are to scaring it, a lure (pick up fruit and put it where you want the hornet to land) and a shoo key. Each one
gives the player something to decide.

**Threats must be visible to be fair.** In Abyssal, a banner said "LANTERNJAW HUNTING YOU" while nothing was visible
for a minute. The decision log: "A banner and a red tint for an unseen hunter was worse than nothing." The new rule: the
creature only lunges after it has been in the camera's view for 0.6 s. In Still Life 2, blind players' losses were "about
information, not difficulty": they died to shooters they never saw. The death line now names the killer and the
side it came from, and every gunman draws a ring that closes over the last 0.6 s before he fires.

**Skill should show in how you do it, not just whether.** Fireflies, a calm webcam game, catches a firefly based on how
slowly your hand closes: snatch it in under about 120-150 ms and they scatter. A normal close takes 250 to 500 ms, so the
game is generous, but a calm hand is visibly better. Dig Site's first build had the opposite problem: "brushing over and
over isn't fun, you don't see what's going on."

## How to apply it

- [ ] Write the 30-second loop in `GREAT.md`: what the player decides, what they see happen, how they get better.
- [ ] Prove it in grey boxes before any art. If the grey-box version isn't interesting for one minute, art won't save it.
- [ ] For every way to lose, list why it happened and make sure the player can see that cause coming. If a loss feels
      random, fix one cause at a time, as Last Drop did.
- [ ] Every threat must be visible on screen before it can hurt the player. No unseen hunters, no off-screen deaths
      without a pointer.
- [ ] Ask the person: "Did you feel in control? Did your choices matter?" If they say "I wasn't doing anything," the
      next round is about the core loop, not polish.
- [ ] Watch for these phrases from anyone who plays: "tech demo," "beautiful but," "not much in my control," "I
      don't know what I'm controlling." Each one means: add decisions, not detail.
- [ ] Check that skill shows: a good player and a masher should get clearly different results (bots can measure this).

Related: [one verb](one-verb.md), [feel](feel.md), [first 60 seconds](first-60-seconds.md).

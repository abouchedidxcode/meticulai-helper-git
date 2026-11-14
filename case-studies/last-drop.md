# Last Drop

**What it is:** you are a drop of water rolling down desert dunes; dry sand drinks you, puddles refill you, and you try
to get as far as you can. Play: https://meticulai.com/games/last-drop/

## What worked

**Everything in code.** Sand, water, light, shrubs, birds and music are all generated: no downloaded assets, a client of
about 2.4 MB at launch. The look was golden hour: a refracting drop with a sun caustic, a wet trail, ripples, depth of
field. The brief was "i want this to look like a video," and it did.

**Listening to the person, round after round.** The creator played every build and wrote short notes. Each note became
a round:
- "beautiful but it needs to be gamified more" → the drop visibly shrinks and swells, the objective shows up front,
  checkpoints with splits against your best, zones with different rules.
- "right now it still looks like a tech demo" → faster drain, about 43 puddles a course, about 1,000 thorn and
  saltbush shrubs that each tear off water, tumbleweeds that knock you sideways.
- "The goal of the game still isn't super clear and/or motivating" → goals on screen, flowers to bloom, a "seconds of
  water left" readout, a music score that follows play.
- "terrain a bit less bumpy and more gravity" → smoother swells; landings fell from about 65 a minute to about 28 while
  jumps stayed about 14 m long.
- An idea from another game (diving down hills, flying off crests) was tried behind a test flag first. The bot showed
  the timing mattered (17-22 m/s with good timing against 12-15 without), and only then did it become the game.

**Diagnosing "it feels random."** The best round came from the note that losing felt like RNG. Instead of tuning
numbers, the team listed each reason a loss felt random and made one change per reason:
1. **Readable drain:** steam comes off the drop while sand drinks it; it clouds over when low.
2. **Water you can count on:** every other puddle sits on the low line down the valley, about every 45 m.
3. **Warned losses:** a hard landing, a pebble or a thorn flashes the drop white and shrinks it visibly.
4. **A last gasp:** running dry gives 1.5 s on a last film of water; reaching water saves you ("Close one").
The risky expert bot went from finishing 3 of 6 courses to 5 of 6.

**A first win placed where you'll be anyway.** Three wide "welcome puddles" sit exactly where the drop rolls if you
don't steer, and the sand drinks half as fast for the first 30 m. A bot that never steered went from 240-355 m to
380-540 m. The tutorial is four lines, each waiting until you've done it.

## What didn't

- **Beauty first, game second.** The game launched as a gorgeous ride with little to decide. It took four rounds of
  notes to make losing and winning feel earned.
- **"The UI looks vibe coded ngl, specially the font."** The interface and font were redesigned.
- **An "annoying wind sound"** nobody had heard during the build; the wind went 10 times quieter.
- **Some ideas came and went.** Stars and a per-course gold target were added, then removed when the game became an
  endless run with upgrades. Tall "jump dunes" were tried and removed (they made dead-end hollows).

## The lesson

A beautiful tech demo becomes a game when every loss has a cause the player can see coming. When someone says it feels
random, list each reason and fix them one by one.

## What your agent should copy

- [ ] Show health as something on the player's body (size, colour, clouding), not only a bar.
- [ ] For each way to lose, make the cause visible before it happens and give a short last chance.
- [ ] Put guaranteed early success on the default path.
- [ ] Try big control or terrain changes behind a URL flag, measure them with a bot, then make them the game.
- [ ] Turn each of the person's play notes into one round, and quote the note in `DEVLOG.md`.

Related: [what makes it fun](../playbook/what-makes-it-fun.md), [first 60 seconds](../playbook/first-60-seconds.md).

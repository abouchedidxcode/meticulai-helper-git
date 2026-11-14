# Rootbound

**What it is:** a pixel-art roguelike where you are a tree growing roots underground; each run is one season, and the
forest you grow carries over between runs. Play: https://meticulai.com/games/rootbound/

## What worked

**A design from the creator's own notes.** The pitch came written: "a roguelike where you're a tree spreading
underground. Each run your roots grow toward water, minerals, or other trees, and the forest you build carries over
between runs." Side-on soil, gold-glowing roots, water pockets, crystals, a fungal network, pests. "Calm, tactile,
beautiful," with tension from drought and pests.

**One verb with depth.** You drag from any root to draw a new one. Everything else hangs off that: roots cost sugar to
grow and to keep, young tips drink water, pockets drain from the top, beetles chew tips, rot climbs toward the trunk
unless you prune it, fungi trade with you, and a dry spell is forecast two days ahead. The forest persists: a tree that
survives becomes an elder that feeds the next sapling through the fungi.

**Three looks until one landed.** The first look was realistic soil. The creator: "look like ass ... i can be
stylized." The second was a stylised, painted look. It was rejected too, with a request for "a high rez pixel look."
The third, real pixel art at a fixed art resolution with an exact palette, got "looks gorgeous." The 3D renderer was
deleted, but the simulation and rules didn't change, because they never depended on the look.

**Teaching added after the person was lost.** Right after "gorgeous" came: "I just don't really know what's going on."
The fix: four welcome cards with small animated pixel diagrams on the first visit, then a guided first season on a
fixed plot with no rival, no random pests, mild weather, and a tree that can't die. Twelve coach cards walk through
one action each, with dotted guides pointing at the real target. It is also on the menu any time.

**Everything in code, no runtime services.** Soil, roots, the tree, creatures, crystals, sky and sound are all
generated. The client is about 2.7 MB, most of it the 3D library and fonts.

**Bots for balance, reviewers for bugs.** A bot showed an idle tree dies in the dry spell (day 5-7), so doing nothing
loses. Two reviewer agents found about 30 issues, including an elder feeding saplings 10 times too much, a root
finishing that cancelled another, and a soft-lock between a draft and the season's end.

## What didn't

- **No teaching for a game with many systems.** It shipped with water, sugar, minerals, pests, rot, fungi and a
  persistent forest, and nothing explaining them, until the person said they were lost.
- **Two looks that cost rounds.** Realistic and stylised both had to be built and rejected before the right one.
- **A font bug across the whole interface.** The pixel font turned "fi" into a single glyph that looked like "A"
  everywhere until it was caught and fixed.
- **Untested on real devices.** Frame rate on phones and Macs, touch feel and audio by ear were not verified.

## The lesson

Keep the rules independent of the look, so changing the look is cheap. And the moment a person says "I don't know
what's going on," teach by doing: a safe first run, one action per step.

## What your agent should copy

- [ ] Keep simulation and rendering in separate files, so the look can be replaced without touching rules.
- [ ] Let the person reject looks quickly; build the next one on the same rules.
- [ ] Add a safe, guided first run as soon as the game has more than two systems.
- [ ] Use a bot to check that doing nothing loses and that a decent player can win.
- [ ] Check text rendering in your chosen font for ligatures and missing glyphs.

Related: [first 60 seconds](../playbook/first-60-seconds.md), [picking a look](../playbook/picking-a-look.md).

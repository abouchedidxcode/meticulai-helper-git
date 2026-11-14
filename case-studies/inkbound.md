# Inkbound (v0 to v1)

**What it is:** a fast 1v1 samurai duel on a paper scroll, drawn in ink, where heavy strokes leave stone that becomes
the stage. Not on the site; it was built in the 12-game run and then rebuilt.

## v0: what happened

The first version ran **77 build cycles**. It had three fighters, four stages, a training mode, a three-duel ladder
and local versus. Its fighters were painted frames: about 360 generated paintings across two batches, roughly $16 of
the game's $28 of generation spend, swapped on a moving body. For most of its life it was judged by an image reviewer
scoring stills against frames from a concept clip. A late critic rated it "about two-thirds" of the clip. Its own
handover said, in bold: "Nobody has played this build by hand."

Then the creator played it: "Still doesnt feel fun what soever, look into fighting games and what makes those, do not
be contrained by what was previously already built ... save this version as v0 but i want you to make an awesome
fighting ink game yourself."

## Why v0 failed (its own post-mortem)

1. "The fighters were pictures, not bodies." No amount of warping made swapped paintings feel controllable, and every
   new move needed more paid generation.
2. "It was slow and careful." A 300 px/s walk, a CPU that held its range, long freezes.
3. "Too many systems, none of them the game." Chains, launchers, sweeps, guard, parry, three ink casts, a super,
   rocks. The hook (strikes write the stage) "ended up as a one-use rock."
4. "It was judged by stills. Looks were polished for 70 cycles while nobody played."

## v1: what changed

- **Frozen, not deleted.** v0 became a git tag, a branch and a runnable folder.
- **Research first.** What makes fighting games fun: spacing, a rock-paper-scissors core, risk and reward, hit
  feedback as layered small responses, depth from few inputs, CPUs that are limited and readable.
- **A triangle of three verbs.** Slash beats Stroke (interrupts its wind-up). Stroke beats Guard (crushes it). Guard,
  tapped on time, is a Parry that beats everything. A dash slips all three. "A new player understands this in one
  minute."
- **Frame data first.** Every move has startup, active and recovery frames and a hit-stop (3 frames on a slash, 8 on
  a heavy stroke, 14 on a parry), in one table that the animation follows.
- **Bodies, not pictures.** Fighters are skeletons drawn fresh every frame as ink silhouettes: smooth 60 fps motion
  for three characters, with no paid generation.
- **A written contract, three builders.** One file named everything the three layers share (the fight simulation, the
  bodies, everything seen and heard). Three builder agents worked at once. "The first end-to-end run needed almost no
  integration work." It was playable in one evening.
- **Judged by play.** A fresh critic watched recorded CPU fights: "not fun yet. It is fast and it has one good move,
  but it is a puppet show with one combo, and the stone hook mostly doesn't happen." Round 3 fixed spacing, combo
  routes, dead time after a knockout (5 s to 2.8 s) and effect sizes. Bots found infinite combos and a dominant
  character; scripted "person-like" players calibrated the ladder so a non-expert can climb it.

## What's still open

The rebuild has 200 passing tests and every press is answered on the next frame, but at the time of writing nobody
has played v1 by hand. The first item on its next-steps list is for the creator to play it. That is the right
first step.

## The lesson

If the person plays it and it isn't fun, and the reasons are in the foundations, another polish cycle won't help.
Freeze it, write the design from what makes the genre fun, start from feel numbers and a tiny verb set, and judge by
play from day one.

## What your agent should copy

- [ ] Never run more than a few rounds without the person playing.
- [ ] When restarting, write the post-mortem as numbered causes first.
- [ ] Prefer bodies drawn in code over swapped generated frames for anything the player controls.
- [ ] Write a contract file before splitting work across builders.
- [ ] Put feel numbers in one table and make visuals follow it.

Related: [when to start over](../playbook/when-to-start-over.md), [feel](../playbook/feel.md).

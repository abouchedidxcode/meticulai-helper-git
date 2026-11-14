# Still Life and Still Life 2

**What it is:** a first-person shooter where time moves only when you move, drawn as a three-colour risograph print.
Play: https://meticulai.com/games/still-life/ and the sequel https://meticulai.com/games/still-life-2/

## What worked

**One rule you can say out loud.** "Nothing moves until you do." Stand still and bullets hang in the air, enemies
freeze mid-stride, even the music stops. Walk, shoot or throw and the world catches up. The rule turns each room into a
puzzle: a blind tester said "every encounter becomes a little puzzle you can read and solve." It is the creator's
favourite and most-proud game.

**A look with a point of view.** Every frame is printed as three spot inks in halftone dots, with misregistration that
grows as time speeds up. Enemies are faceted pink glass that shatter into shards. Pink always means danger.

**The sequel was built by blind playtesting.** For Still Life 2, fresh agents with no context played the real game
through a harness that turned text commands into real mouse and keyboard input. They saw only pixels and on-screen
text. A separate "spectator" agent saw only frames from clips, like someone scrolling past a post. Each round's notes
decided the next change. About 25 blind playtests ran in one night. Clarity scored 4-5 out of 10 on the original
and 5-6 on later builds (the hardest late rooms still scored 4-5); fun held at about 7.

**What the blind players found, and the fixes:**
- They died to shooters they never saw. Now every gunman draws a ring on his muzzle that closes over the last 0.6 s
  before he fires, chevrons point at off-screen threats, and a large BEHIND YOU appears when someone winds up at your
  back.
- They hunted the last enemy for minutes. Now the last one or two come to you ("hunt mode").
- Dead enemies stayed pink, so splats looked like guards. Now they dry to a dull ink: pink always means alive.
- "YOU MOVED WRONG. SHOT" taught nothing. Now: "SHOT · BY A SHOTGUNNER · FROM BEHIND." One tester said the death
  cards were "the only reason I learned anything."

**A new rule tested blind against the old.** The sequel's rule: the room runs in real time, you hold a button to slow
it, and the meter only refills while you stand still. Three blind players each played both versions, unlabelled and in
shuffled order. Two preferred the new rule; all three said it was better to watch. The old rule stayed as an option.

**Game separate from graphics.** The same rooms draw as print, photoreal, dither or ASCII, and gameplay never knows
which. A seeded replay plays identically in all four, which made fair comparisons and a four-look trailer possible.

## What didn't

- The first highlights reel read as "Superhot with a filter" to eight spectators in a row. Editing couldn't fix it.
  The fix was showing "a moment that only this game can produce": standing still while enemies walk in and the meter
  refills, and REPRINT (taking over an enemy's body).
- Slow motion only showed in a HUD label: "The corridor looks identical in slow and normal speed." It now has its own
  look (a halftone vignette and frozen speed lines).
- Sound-only warnings failed: testers heard nothing, so stamping presses now flash before they fall.
- The photoreal look, unlabelled in a montage, "looks like a cheap Unity prototype."

## The lesson

A sharp rule is the start, not the finish. Strangers who know nothing about the game will show you every place where
the rule, the danger or the cause of death is invisible. Fix those, and keep fixing until they can explain the game
back to you.

## What your agent should copy

- [ ] Write the one-rule sentence first, and make the rule visible in the picture, not in a caption.
- [ ] Run blind playtests with `agents/critic-newcomer.md`: no context, real input, screenshots only.
- [ ] Every danger gets a visible warning before it hurts; every death names the killer and the direction.
- [ ] Make one colour mean one thing, everywhere.
- [ ] Explain each mechanic when it first happens, never on a timer.
- [ ] Keep gameplay randomness on its own seeded generator so runs replay exactly.
- [ ] Put big rule changes behind a switch and test them blind against the original.

Related: [one verb](../playbook/one-verb.md), [first 60 seconds](../playbook/first-60-seconds.md).

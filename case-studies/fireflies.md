# Fireflies (the calm hands games recipe)

**What it is:** a dusk meadow where you catch fireflies by closing your hand slowly in front of your webcam; snatch
too fast and they scatter. It plays inside Show of Hands, a hall of webcam hand games:
https://meticulai.com/games/show-of-hands/

## What worked

**The skill is in how you move, not just whether.** A catch depends on how fast your hand closes. Close in under about
120 ms and the fireflies are startled; a normal close takes 250-500 ms, so the threshold is generous, but a calm hand
clearly does better. The catch radius is 0.14 screen heights, "generous on purpose." The design note: "Catch = how
fast the hand closed, not just that it closed."

**Charitable input everywhere.** The rule written for every hands game: "Be charitable with gestures ... low
thresholds ... generous hit areas ... When the game is unsure, it says the player is right." Grip uses two thresholds
(open at 0.6 or more, closed under 0.4) so a shaky hand doesn't flicker between states. The camera view is mirrored, so
moving right moves right.

**One code path.** Mouse, touch and a bot all feed fake hand data through the same engine as the real camera. The game
plays without a webcam, and the bot (`?bot=1`) can test it.

**Something changes in 30 seconds.** The creator's verdict was "perfect," with one request: "make the sky change colour
faster so it shows in a short demo." Dusk now reaches about halfway to night by 30 s. A session is 3 minutes.

**Restraint.** Bloom strength is 0.16; the glow comes from drawn halos. Sound is made in code, and harmonised chimes
answer each catch.

**It became the recipe.** Seven more calm games were built from it, and the brief wrote the recipe down: "a beautiful
place at a special time of day that changes visibly within the first 30 seconds; slow, gentle, forgiving hand gestures
where calm is rewarded and frantic is gently discouraged (never punished harshly); things that glow; collecting into
something that visibly fills; procedural music whose notes answer what you do; a short session (2-4 minutes) ... an
endless relaxed mode."

**Measured, then checked.** Fourteen hands games ended up side by side in one hall. A loudness probe found their levels
spread across about 22 dB; one shared target brought every game within a few dB of the others. A frame-rate pass on a
quiet machine got every game to 60 fps at a pixel ratio of 2. Fireflies' own fix: removing an effect setup that copied
a multisampled render target raised its headroom from 74 to 98 fps. One agent built each game in its own folder, with
at least three harsh critique passes, then the main session re-checked everything.

## What didn't

- **Nobody had tested with a real webcam, real ears or real phones** when the builds were done. Every handover had to
  say so plainly. Bots with synthetic hands are not hands.
- **Three hand games were retired** (a finger rhythm game, a finger-gun duel, a wrist safecracker). They were "built and
  checked with synthetic hands" and needed a real-webcam test that didn't happen in time.
- **Too much bloom** came up again, this time on the hall itself.

## The lesson

Calm games are fun when calm is the skill. Make the input forgiving, make the world answer every gesture with light and
sound, and show a visible change within 30 seconds.

## What your agent should copy

- [ ] Score *how* the player does the verb (speed, steadiness), with a generous threshold.
- [ ] Use two thresholds for any fuzzy input, generous targets, and "when unsure, the player is right."
- [ ] Route mouse, touch and bot input through the same code as the real input.
- [ ] Make the place change visibly in the first 30 seconds.
- [ ] Measure loudness and frame rate; state plainly what has not been tested with real hardware.

Related: [feel](../playbook/feel.md), [audio](../playbook/audio.md).

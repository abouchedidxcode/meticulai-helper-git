# Orbitball

**What it is:** a ball game played on the inside of a sphere, built in the 12-game run. Not on the site; parked with a
broken camera.

## What happened

Orbitball followed the run's method: render three staged camera views, have an image-only reviewer score them against
concept frames, and play-test with a bot. The numbers looked fine:
- "gauntlet 35": 6.5 / 6.5 / 6.9 out of 10 on its three frames; the latest round 6.6 / 6.9 / 7.3.
- Bot play-tests: "full match won 3-0," "0 page errors."

Then the creator played it. The report: "the camera jitters at the start, 'nothing happens', and pressing Space 'seems
to restart the game'."

## What was actually broken

- At kickoff, the camera faced the ball at the sphere's centre, "straight up off the floor." The camera arm went into
  the wall and was pushed to within about 2.4 m of the player, below the view: the player was off screen entirely.
- Pressing Space launched the player across the sphere. They landed "looking ~70 deg down at the floor (a screen of
  seams), which reads as a reset."

So for a real person, the game started with a jittering view of nothing, and the main button looked like it restarted
everything.

## Why nothing caught it

From the game's own notes: "The gate frames are staged cameras and the play-test bot reads game state to aim, so
neither showed what a person sees." Every check was looking at the game from somewhere a player never is. The staged
frames placed the camera by hand. The bot didn't need a camera at all; it read positions straight from the game.

## What it should have had

The lesson, as written in its devlog: "keep one probe that records what the real player camera shows (player NDC,
view pitch) from the title screen with no help." In plain words: one automated check that starts at the title screen,
presses the real keys, records what the real camera shows, and fails if the player isn't on screen or the view points
at the floor.

A related lesson from the same run, written in Orbitball's notes and used everywhere after: "reviewers are good at
finding where something is wrong and unreliable about which direction to move it." The reviewers in this case weren't
even looking at the right picture.

## Status

Parked. The camera fix was diagnosed and half done when the run ended.

## The lesson

Staged screenshots and bots that read game state can pass a game that a person can't play. At least one test must see
exactly what the player sees, from the title screen, with real input and no help.

## What your agent should copy

- [ ] Record every playtest from the title screen with real key and mouse input (`node tools/play/record.mjs`).
- [ ] Never judge a game from hand-placed camera views. Use the real player camera.
- [ ] Add an automatic check that the player character is on screen and the view isn't pointed at the floor or sky
      for long.
- [ ] Watch the first 10 seconds of every recording yourself: jitter, a blank view or a "reset" look there means the
      person will quit.
- [ ] When the person reports "nothing happens," believe them over every score.

Related: [who to trust](../playbook/who-to-trust.md), [feel](../playbook/feel.md),
[the 12-game run](the-12-game-run.md).

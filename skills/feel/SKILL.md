---
name: feel
description: Make every action feel good - fast input response, a camera that never fights the player, weight, hit-stop, and a sound plus a visual answer for everything. Use once the first playable works, or whenever the user says it feels floaty, laggy, cheap or "like nothing happens".
---

# Feel

## Goal

Pressing a button feels good on its own, before any goal or score. The player feels their own skill in the result.
This is where most of the "is it fun" comes from in action games, and where agent-made games are usually weakest:
agents can't feel, so you have to measure and check against a list.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.
Background: [playbook/feel.md](../../playbook/feel.md).

## Checklist

**Input**
- [ ] Input to visible response under 100 ms, ideally the next frame. No smoothing on the first frame of a press.
- [ ] Controls do what the player meant, generously: jump buffering and a little "coyote time" for platforms, big
      hit areas, aim assist for small targets. When the game is unsure, the player is right.
- [ ] Holding vs. tapping is clear. Releasing does something when it should (variable jump height, let go to throw).

**Camera**
- [ ] The camera never fights the player: no fighting the mouse, no swinging behind walls, no sudden snaps.
- [ ] It shows where the player is going, not where they've been (leads in the direction of motion).
- [ ] Shake is short, small, and only on big events. Never constant.

**Weight and impact**
- [ ] Things accelerate and stop with intent: a short ramp, not instant (unless it's a snappy game on purpose).
- [ ] Hit-stop: freeze 2-6 frames (30-100 ms) on strong impacts.
- [ ] Squash and stretch, recoil, or a small camera punch on actions that should feel strong.
- [ ] Particles, dust or sparks where things touch. Small and quick.

**Feedback: every action gets an answer**
- [ ] Every player action and every collision has a sound **and** a visual. Make a list of all `__game.events` and
      check each one off.
- [ ] Sound volume and pitch follow strength (a hard landing is louder and lower). Round-robin or pitch-vary repeats so
      they don't machine-gun.
- [ ] Danger is telegraphed: the player can see (and hear) a threat coming before it hurts them, every time.
- [ ] Rewards are louder than failures, but failures are clear.

## Steps

1. List every action and event. Next to each: its sound, its visual, its timing. The gaps are your work list.
   Sounds: the kit has about 90 free ones made for games (`node tools/sounds/list.mjs --for "<the action>"`, add with
   `node tools/sounds/add.mjs <id>`, play with `audio.play(name)`: `recipes/sound-files.md`), and makes new ones in
   code (`node tools/sounds/synth.mjs`). The base's synth (`audio.blip/chime/thud/whoosh`) covers the rest.
   Nobody has heard them: the user should listen (`node tools/sounds/audition.mjs` makes a page with play buttons).
2. Measure: `node tools/play/fps.mjs` (frame-time percentiles; aim for the 95th percentile under 20 ms on this
   machine) and `node tools/play/loud.mjs` (no event far louder than the rest; you can't listen, so trust numbers).
3. Builders, with [plan-swarm](../plan-swarm/SKILL.md): usually `feel` (input, camera, hit-stop, shake), `audio`
   (every event's sound), `fx` (particles, squash). 2-3 builders.
4. Put every feel number in `src/tuning.json` so the user can adjust it in the dev menu (backquote key) and save it
   for you. Give the menu an essentials list in plain words (`ctx.dev.essentials`) and two or three presets with a
   sentence each (`ctx.dev.presets`): the island demo in `starter/src/game/game.js` shows both.
5. Record a short scripted run that does each action once (see play scripts in ARCHITECTURE.md), for example:
   ```
   press Enter
   hold KeyD 800
   press Space
   wait 400
   shot mid-jump
   wait 600
   shot landed
   ```
   `node tools/play/record.mjs --script feel.txt --name feel`. Check the shots and sheets for the answer to each action.
6. [Playtest](../playtest/SKILL.md) with `critic-player` focused on feel.
7. [Hand-back](../hand-back/SKILL.md). Ask the user specifically about feel: "Does jumping feel good? Too floaty, too
   heavy, or right?" Feel is the one thing only a person can judge.

## Done means

Every event has a sound and a visual, input response is immediate, the camera is calm, fps is healthy, and the user
says it feels good. If the user once praised the feel of something, never change it without asking.

## Common mistakes

- Making effects bigger instead of making them faster. Snappy beats huge.
- Screen shake on everything. It numbs the player and hides the game.
- Adding juice to hide a loop that isn't fun. Feel amplifies fun; it doesn't create it.
- Assuming the audio sounds fine. Nobody has heard it until the user plays. Say so in "Still rough".

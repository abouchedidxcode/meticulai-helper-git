---
name: first-playable
description: Build the core loop in grey boxes and prove it's fun before any art - the verb works in 10 seconds, you can win and lose, and a bot can play it. Use right after the interview and swarm plan, or when a game needs to restart from its core.
---

# First playable

## Goal

A grey-box version where the one verb from GREAT.md works and feels promising, the 30-second loop runs end to end, the
player can win and lose, and a bot can play it so recordings mean something. No art, no menus beyond the minimum.

Why grey boxes: once something looks nice, everyone (agent and user) stops being honest about whether it's fun. Several
games spent days on lighting while the core loop was still dull, and had to throw most of it away.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

## Checklist

- [ ] **The verb works within 10 seconds of loading.** No title screen yet (or `?autostart=1` skips it). Press, and
      the thing happens.
- [ ] **Every press does something visible on the same frame.** Even if it's a grey box moving.
- [ ] **The 30-second loop exists.** Each numbered beat from GREAT.md happens at least once in a minute of play.
- [ ] **A way to win and a way to lose** (or, for calm games, a way to finish and a way to do better).
- [ ] **The player's choice visibly changes the result.** Two different players should get clearly different outcomes.
      "I felt like I wasn't doing anything" is the worst review a game can get.
- [ ] **Shapes only.** Boxes, spheres, flat colours, one light. Colour codes meaning (player, danger, goal), nothing else.
- [ ] **Tuning numbers live in `src/tuning.json`** (speed, gravity, timers), so the user can change them in the dev
      panel and press "Save for my agent".
- [ ] **Test hooks work** (see ARCHITECTURE.md): `window.__game.ready`, `state`, `events`, `skipTo`, and `?bot=1` makes a
      simple bot play the core loop. The bot doesn't have to be good; it has to exercise the verb, and score better
      when it plays better.
- [ ] **No errors**: `window.__game.errors` stays empty during a 60-second bot run.

## Steps

1. Re-read GREAT.md: the verb, the loop, the three moments. Pick the one moment you can show in grey boxes.
2. Plan with [plan-swarm](../plan-swarm/SKILL.md). For a first playable, usually 2-3 builders: core (rules, verb,
   win/lose), feel-lite (controls and camera, just good enough), bot + test hooks. Keep look and audio for later.
3. Merge, then record: `node tools/play/record.mjs --bot --seconds 60`. Look at the sheets in order.
4. Answer honestly in DEVLOG.md: does the verb feel like something? Does the loop have a beat that pays off? Which beat
   is dead?
5. Run one quick [playtest](../playtest/SKILL.md) round with `critic-player` and `critic-newcomer` only.
6. Fix the top problem with a big move (change the loop, not a number).
7. [Hand-back](../hand-back/SKILL.md). Ask the user to play it for two minutes and press N with one sentence: "what
   was the best moment, and what was boring?"

## What to say

> Here's the first playable version. It's all grey boxes on purpose: I want to know if the steering is fun before
> making it pretty. Play it for two minutes and tell me (press N): what felt good, and what was boring?

## Done means

The checklist is complete, the bot records a full loop without errors, and the user has played it and said something
felt good. If nothing feels good after two or three tries, it's a design problem: see [unstuck](../unstuck/SKILL.md)
and [playbook/when-to-start-over.md](../../playbook/when-to-start-over.md).

## Common mistakes

- Adding menus, art, or a story before the verb is fun.
- A bot that only walks forward. It must use the verb the way a player would.
- Hiding the loop behind setup ("first, choose your class"). Drop the player straight into the verb.
- Tuning numbers for hours. If the loop isn't fun at any reasonable number, the loop is the problem.

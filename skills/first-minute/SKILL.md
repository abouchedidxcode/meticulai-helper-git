---
name: first-minute
description: Make the first 60 seconds work for a stranger - something happens in 5 seconds, the game teaches by doing, the first win comes within 30 seconds, and there's a reason to keep going. Use once the game is fun and has its look, before shipping, or when testers quit early.
---

# First minute

## Goal

A stranger who has never heard of the game opens the link and, without reading anything or being told anything,
is playing in seconds, understands the verb by doing it, gets a first win within 30 seconds, and wants another go.
Most people decide in the first minute whether they'll keep playing.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.
Background: [playbook/first-60-seconds.md](../../playbook/first-60-seconds.md).

## Checklist

- [ ] **Something happens in 5 seconds.** Movement, light, sound on the title. No black screen while loading: show
      something within a second and load the rest behind it.
- [ ] **One click or key to start.** The title is a moment, not a form. Name, one line, start.
- [ ] **Teach by doing, not by text.** The first seconds put the player in a safe spot where the only thing to do is
      the verb. Show the control as a small animated hint at the moment it's needed, and fade it once used.
- [ ] **The first win within 30 seconds.** A small, certain success with a strong answer (sound, light, number).
- [ ] **One new thing at a time.** Introduce each mechanic alone before combining.
- [ ] **A reason to keep going** by 60 seconds: something visible ahead, a number to beat, a place not yet reached.
- [ ] **Failure is fast and fair.** Restart in one key or click, under two seconds, and it's clear why you failed.
- [ ] **Results screen worth reading:** a number worth beating, the best moment of the run, one-key retry.
- [ ] **Sound starts on the first click** (browsers block audio until then) and there's a mute.
- [ ] **No debug text, placeholder words or test UI** in the normal build (they belong behind `?test=1`).

## Steps

1. Record a cold start, exactly as a stranger sees it, title screen included:
   `node tools/play/record.mjs --seconds 60 --name cold` with a script that starts the way a person would (look at
   `tools/play/scripts/first-minute.txt`, and `record.mjs --help` for how to keep the title screen). Check the first
   sheet: if it opens mid-game, the title wasn't recorded. Then a second run with `--bot` to see the first win.
2. Spawn [agents/critic-newcomer.md](../../agents/critic-newcomer.md) with only that recording folder and GREAT.md.
   Ask it to judge the opening as a stranger who hasn't read GREAT.md would: when did you understand what to do? When
   were you bored? When did you first feel good?
3. Spawn [agents/critic-scroller.md](../../agents/critic-scroller.md) with the same folder: would someone scrolling
   past a 10-second clip of this stop?
4. Triage ([agents/triage.md](../../agents/triage.md)) and fix the top one or two problems with builders (`ui`, `onboarding`, `core`). Prefer restructuring the
   opening (move the best moment earlier) over adding text.
5. Re-record and compare against the first cold run.
6. [Hand-back](../hand-back/SKILL.md), and ask the user to try it on someone else: "Send the link to a friend or sit
   someone down, say nothing, and watch. Tell me where they got stuck." (Local links only work on this computer; for a
   friend elsewhere, this needs [ship](../ship/SKILL.md) first, with their yes.)

## Done means

A cold recording shows the verb used within 10 seconds and a win by 30, critic-newcomer has no "I didn't know what to
do" moment, and a person who isn't the user has tried it.

## Common mistakes

- A wall of instructions or a controls diagram before play.
- A long intro or cutscene before the first input.
- Making the first level the hardest to build and the least fun (it's often built first and never revisited).
- Testing the opening only with the bot and `?autostart=1`, which skips exactly the part a stranger sees.

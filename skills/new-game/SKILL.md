---
name: new-game
description: The interview - eight plain questions, one at a time, that turn the user's idea into my-game/GREAT.md, the yardstick for every later decision. Use right after setup, or whenever the user wants to start a new game or rethink what the game is.
---

# New game: the interview

## Goal

`my-game/GREAT.md` describes, from first principles, what a great version of this game is: the fantasy, the
30-second loop, three moments, the feel, the look in words, and the biggest risks. The user has read it back and
said yes. `helper.json` has their budget and agent limit.

This page matters more than any code. Games built against a clear GREAT.md improved round after round; games built
against "match these pictures" or a vague idea burned a hundred rounds of tiny tweaks and went nowhere.

Before you start: you must be in the kit's workspace (it has `START.md` and `tools/`). If not, do START.md step 0.

## How to ask

- **One question per message.** Wait for the answer.
- Under each question, give one example answer, so a beginner isn't stuck.
- Always offer: "Not sure? Say 'you pick' and I'll suggest something."
- Short answers are fine. Don't push for detail; you fill gaps and they correct you at the read-back.
- If an answer already covers a later question, skip that question.
- If they say "you pick", suggest one specific thing in one sentence and ask "ok?".

## The eight questions

**1. The game or the feeling.**
"In one or two sentences, what game do you want to make? Or just the feeling you want it to give."
Example: "Gliding a paper plane through a house at night, collecting lights, very calm."

**2. The verb.**
"What does the player DO most of the time? One verb is best."
Example: "Steer." (Others: jump, throw, dig, aim, build, sort, draw, dodge.)
If they give several, ask which one they'd keep if they could only keep one. That one gets all the polish.

**3. Who and how long.**
"Who is it for, and how long is one sitting?"
Example: "Me and my friends, five minutes during a break."

**4. Three moments.**
"Imagine someone played it and told a friend about it. What are three moments they'd describe?"
Example: "The plane dives down the stairwell and just barely clears the banister. The whole kitchen lights up when you
collect the last light. Gliding out the open window into the night at the end."
Not sure? Offer three based on answers 1-2 and let them edit.

**5. The look.**
"What should it look like? You can point at pictures instead of finding words: I'll open a gallery of about 45 looks,
each with mood pictures and a picture of a real game drawn that way. Say a name you like, or describe it in words."
Example: "The Paper diorama one." Or: "Like an old photo. Warm lamp light, dark corners, dust in the air."
Open the gallery for them with `node tools/vibes/open.mjs` (it opens in their normal browser; nothing to install).
If they describe it in words, run `node tools/vibes/list.mjs --for "<their words>"` and offer the top two or three by
name. A vibe is a starting point for the look (colours, light, an optional drawing style, words for GREAT.md), never a
picture the game has to match. Remember their pick; you put it on after the read-back.

**6. Controls.**
"How do people play it: keyboard and mouse, a game controller, touch on a phone, or hand gestures in front of a
webcam?"
Example: "Mouse to steer, click to boost."

**7. Time and money.**
"How much time do you want to put into this? And do you want me to generate pictures or sounds with an AI service
called fal? That costs real money (often a few cents to a few dollars per batch), so you'd set a budget. The default is
$0: I use free assets and make things in code, which works well."
Example: "A few evenings. $0 for now."

**8. Anything you don't want.**
"Anything you definitely don't want in it?"
Example: "No violence, no timers stressing me out."

## Steer gently

First-timers often ask for things that sink a first game. Don't refuse; offer the smallest version that keeps the
fantasy, in one sentence, and let them choose.
- **Online multiplayer** -> "Let's make it great for one player first; a friend can take turns or share a keyboard. Online play
  can come later and roughly doubles the work."
- **Open world, RPG, huge scope** -> "Let's build one small place that feels amazing, like one level of it. If that's fun,
  it grows."
- **A paid API while playing** (live AI chat, live voice) -> "That costs money every time someone plays. Let's fake it with
  prepared content first."
- **A known game or character** -> "We'll make our own version with its own name and look, so it's yours and you can share it."
See [playbook/scope.md](../../playbook/scope.md) and [playbook/one-verb.md](../../playbook/one-verb.md).

## Write GREAT.md

Fill the template already in `my-game/GREAT.md` (from `templates/GREAT.md`). Write it yourself; don't ask more
questions. Sections:

1. **The fantasy** - what the player gets to be or do that feels good, in two or three sentences.
2. **The 30-second loop** - numbered beats (usually 3-5). After each, "*Satisfying because* ...". If you can't say why a
   beat feels good, that beat is the risk.
3. **Three moments** - the user's, sharpened into concrete scenes.
4. **The feel** - input response, camera, weight, feedback (sound, particles, hit-stop, screen response).
5. **The look, in words** - one coherent direction: palette, shapes, light, motion. Chosen because it reads clearly at
   the game's camera and can be made well in a browser, not because it's fashionable. Default lean, unless the user
   said otherwise: warm, real and lived-in over neon; restrained glow; no generic "AI art" look.
6. **What the best games in this genre get right** - three or four principles, each with a game it comes from.
   Principles, never copies.
7. **The five biggest gaps or risks**, ranked by how much they'd hurt. For a new game these are risks: "steering might
   feel floaty", "five minutes may run out of variety".
8. **Out of scope** - what the user said no to, plus what you steered away from.

Keep it under two pages. Read [playbook/what-makes-it-fun.md](../../playbook/what-makes-it-fun.md) if unsure.

## Read it back

Don't paste the file. Say it in six or seven plain lines:

> Here's the game as I understand it:
> - You're a paper plane gliding through a dark house at night.
> - Most of the time you steer; clicking gives a short boost.
> - Every 30 seconds or so you thread a tight gap, grab a light, and the room glows a bit warmer.
> - The big moments: the stairwell dive, the kitchen lighting up, flying out the window at the end.
> - It looks like an old warm photo: lamp light, dark corners, dust.
> - One sitting is about five minutes. Budget: $0.
> - The biggest risk: steering a glider with a mouse can feel floaty, so that's the first thing I'll get right.
>
> Is that the game? Change anything you like.

Edit until they say yes. GREAT.md (the look in words, the camera, the scale) now feeds the asset plan in
`my-game/ASSETS.md` ([find-assets](../find-assets/SKILL.md)), so make the look specific enough to choose assets by. Then
set `falCapUSD` (their budget, default 0) and `maxAgents` (default 4; lower it to 2 if the computer is old or slow, or
if they mention running out of usage) in `my-game/helper.json`. Rename `gameName` if they gave a name. Log the main
choices in `DECISIONS.md`. Commit.

## Pick the starter and put on the vibe

Right after the yes:

1. **Starter.** `node tools/starters/list.mjs --for "<the game in a few words: the verb, the camera, the vehicle>"`.
   The starters are ready-to-play games, one per kind of game (island: third-person run and jump; platformer: 2D
   side-on; top-down: aim and shoot from above; racer: vehicles; first-person: through your own eyes). Each already
   has the feel of its kind tuned (see its `STARTER.md`). If one fits better than the island the user is on now,
   switch: `node tools/starters/switch.mjs <id>` (keeps GREAT.md, palette, refs and notes; replaces only the game
   code). Tell them in one plain line: "I'm starting from the racing starter: it already drives and drifts well."
   Read `my-game/STARTER.md` before you plan anything: it says what is tuned and why, and how to reshape it.
2. **Vibe.** If they picked one: `node tools/vibes/apply.mjs <id>`. It writes `my-game/palette.json` (every colour in
   the game comes from it, by role), puts on the drawing style if the vibe has one, and writes the look in words into
   GREAT.md if that section is still empty. If they described their own look, write palette.json yourself from
   GREAT.md (roles: read the top of `my-game/src/core/look.js`), or start from the closest vibe and adjust.
3. Hand back so they see their idea's starter in their vibe within minutes, before any building.

## Look for ready-made blocks

Right after the yes, run `node tools/blocks/suggest.mjs`. It reads GREAT.md and points at blocks (systems from
finished games, effects, whole looks) and code libraries that may fit, with the words that matched. It's a pointer,
not a decision: read the `use_when` of the "Probably useful" ones and look at their pictures. Write the promising
ones into `my-game/ASSETS.md` (ladder choice "block", status `planned`, one line on why). **Don't add any yet.** If
one IS the core mechanic (a flight model, horse movement, a car), note that the first playable starts from it.
Tell the user in one plain line only if something big fits ("there's a ready-made glider from another game; I'll
start from that").

## Next

Ask once: "Do you have pictures or videos of the look you want? Drop them in the `refs` folder in `my-game` and tell
me. Or say 'skip'." (Tell them where the folder is, click by click.) Then [references](../references/SKILL.md) or
[plan-swarm](../plan-swarm/SKILL.md). End with the [hand-back](../hand-back/SKILL.md) card.

## Done means

GREAT.md is written, the user said yes, `helper.json` is set, the best starter is in place, the vibe (or their own
palette) is on, `suggest.mjs` was run and the promising blocks are in ASSETS.md, committed, and the turn ended with
the card.

## Common mistakes

- Asking two questions in one message. Beginners answer the easier one and skip the other.
- Writing GREAT.md about features ("has 12 levels, a shop") instead of feelings and the loop.
- A look section that lists adjectives from three different styles. Pick one direction.
- Letting a giant idea through unchanged. Kind, early scope cuts save weeks.
- Skipping the read-back. The user's yes is what makes GREAT.md the yardstick.

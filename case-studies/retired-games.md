# The 22 retired games

**What it is:** in one clean-up, the creator went through every game and retired 22 of them. They are kept for the
record, never built or served. The notes don't give a reason for each one; the groups below come from each game's own
status notes at the time.

## 1. The one-shot multiplayer prompt (7 games)

Blob Hammer, Bonkers, Deadweight, Flail Royale, Gulp!, Windbags, Yanked.

All seven came from one prompt run in parallel at different model and effort settings, all started within 25 minutes
one night: "5-player browser three.js, ALL ASSETS CODED, viral on X, people laughing while competitive, ASK ME NO
QUESTIONS." Each model picked its own game: jelly blobs swallowing rivals, tube-men slapping each other off a crumbling
island, bungee-corded beans flinging each other into the sea, a roped ring where you haul a fallen player up or cut the
rope.

They had real engineering: authoritative servers, room codes, invite links, bots, share buttons. Deadweight had about
440 tests. All were later moved onto a hosted platform so nobody had to run a server. But:
- reviewer agents "found real robustness bugs in every one (crash on malformed WS upgrade, ping floods, dropped input
  queues, ghost rooms)";
- they were "none verified with real humans."

A five-player party game can only be judged by five people laughing in the same match. That test never happened.

## 2. Beautiful, but the person said no (2 games)

- **Keeper**, a lighthouse game on a storm night. The first version was "wayyyy too boring," with too much bloom. It
  was redesigned around leading ships through reefs with your light, and still retired.
- **Hypervolt GP**, a flying-roadster racer with a 3D modelling pipeline, four courses and eight cars. Pulled from the
  site: "this barely works, take it down." The planned realism pass was never built.

## 3. A paid AI call on every action (1 game)

- **Conjure**: sketch a doodle and it becomes a 3D physics object that helps a marble reach a teacup. Each conjure ran
  four paid steps (read the doodle, make a picture, cut out the background, make a 3D model): about $0.066 and 15 to
  45 seconds per conjure. It needed a server-side daily spending cap, and a shelf of ready-made objects for when the
  cap ran out. It never left its work branch.

## 4. Never started, never finished, never tested (5 games)

- **Pips**, "a dice game instead of cards": "not started. Only the project scaffold exists."
- **Hush**, a co-op night in the woods where a creature hunts by sound, including your microphone: "Multiplayer written
  but not tested between two machines."
- **Constellate**, connect stars over a lake: "Polish pass only half done."
- **Singularity**, you are a black hole: playable and polished, but never put on the site. No reason recorded.
- **Murmur**, steer a flock of starlings home: a design document and about $22 of generated art (126 calls across 7
  models), most of it later deleted. It never became a game.

## 5. Webcam games never tested with a real camera (6 games)

- **Five** (a finger rhythm game), **Quickdraw** (a finger-gun duel), **Safecracker** (turn your wrist like a dial):
  "Built and checked with synthetic hands; needs a real-webcam test."
- **Godhand**, a webcam war game: "not tested with a live webcam."
- **Starbreaker**, a hand-controlled space shooter.
- **Hand Arcade**, eleven small hand games made with a different coding tool.
Godhand and Starbreaker still play inside the Show of Hands hall; the calm hands games that replaced the rest were
built from one tested recipe (see [Fireflies](fireflies.md)).

## 6. A proof of concept (1 game)

- **Match the Shot**: find where a photo was taken inside a 3D scan. Asked for as "a quick proof of concept," and it
  stayed one.

## The pattern

Read the groups together and the same causes repeat:
- **Nobody played it the way it's meant to be played.** Five-player games with no five players, webcam games with no
  webcam, multiplayer with no second machine.
- **The spec skipped the person.** "ASK ME NO QUESTIONS" and "viral on X" produced engineering, not a tested game.
- **Running costs were built into the design.** A paid call on every player action needs caps and fallbacks before it
  can ship.
- **Looks didn't save a boring loop** (Keeper), and **a big pipeline didn't save a game that "barely works"** (Hypervolt).
- **Ideas that never got a first playable** (Pips, Murmur) died as folders.

## What your agent should copy

- [ ] First game: single-player, one device, no runtime paid calls.
- [ ] For anything that needs several people, a webcam or a microphone, name who will test it for real, and don't call
      it done until they have.
- [ ] Never accept "ask me no questions" as the whole brief; run the interview.
- [ ] Get to a first playable in the first session, or cut the idea down until you can.
- [ ] If the person says "boring" or "barely works," fix the core loop or stop. Don't add art.

Related: [scope](../playbook/scope.md), [what makes it fun](../playbook/what-makes-it-fun.md).

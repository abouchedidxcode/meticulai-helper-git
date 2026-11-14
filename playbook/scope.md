# Scope: small, solo, no paid calls at runtime

**The rule:** a first game is single-player, small enough to finish, and costs nothing to run. No online multiplayer,
no paid AI service called while someone plays, no feature that only works with several real people at once until a
person has tested it with real people. Reuse a kit that already works whenever you can.

## Evidence

**Seven multiplayer games in 25 minutes, all retired.** One night, the same one-shot prompt was run in parallel at
different model and effort settings: "5-player browser three.js, ALL ASSETS CODED, viral on X, people laughing while
competitive, ASK ME NO QUESTIONS." Seven games came out, each started between 00:26 and 00:51: Blob Hammer, Bonkers,
Deadweight, Flail Royale, Gulp!, Windbags and Yanked. Each model picked its own game. They had servers, room codes,
bots, invite links and share buttons. One had about 440 tests. Then:
- Reviewer agents "found real robustness bugs in every one (crash on malformed WS upgrade, ping floods, dropped input
  queues, ghost rooms)."
- The heaviest used about 108-120 KB/s of network per player.
- They were moved onto a hosted server platform so they could stay online.
- "none verified with real humans."

All seven were later retired. Nobody ever found out whether they were fun, because finding out needed five people at
once. The prompt asked for virality and no questions, and got neither a tested game nor a person in the loop. See
[retired games](../case-studies/retired-games.md).

**Multiplayer that was never tested.** Hush was a co-op night in the woods for 1-6 friends, where a creature hunts by
sound, including your real microphone. Its handover: "Multiplayer written but not tested between two machines." Pop
Quiz got a 2-4 player online mode reviewed by three agents and a 4-browser headless test, and is still "Never played by
humans over a real network." Even for the multiplayer games that did ship (Lost Marbles, Dragon Aces, Windfall), reviewer
agents repeatedly found real server bugs the builders missed.

**A paid AI call on every action.** Conjure let you sketch a doodle that became a 3D physics object. Each conjure ran
four paid steps (read the doodle, make a picture, cut out the background, make a 3D model): about $0.066 and 15-45 s
per conjure. It needed a server-side daily spending cap and a "shelf" of ready-made objects for when the cap ran out.
It never reached the site. Last Call, a voice interrogation game built on live AI voice agents, did ship, and the
creator was worried about what live use would cost. The standing preference since: "zero-API or capped designs for new
games."

**Never started.** Pips, "a dice game instead of cards," was retired with the status "not started. Only the project
scaffold exists." An idea in a folder isn't a game. Start small enough that the first playable comes the same day.

**Too many at once.** In the 12-game run, twelve agent sessions on one laptop overloaded the machine and killed each
other's test browsers. Everything was stopped at one point "even if progress was lost." The lesson the creator wrote
down: run a few games at a time, not twelve.

**Reuse wins.** Marble Golf was built from copies of Lost Marbles' renderer, physics, wood scans, marble shader, sounds
and radio. Its first version had nine hand-built holes, slingshot aiming, gems, power-ups and pass-and-play, with three
reviewer agents. Two days later it had 18 holes, because instead of porting Lost Marbles' race pieces one by one, it
carried a copy of Lost Marbles' course builder and ran it inside a golf hole. The fourteen calm webcam games were all
built from one recipe proven by Fireflies. See [Lost Marbles](../case-studies/lost-marbles.md) and
[Fireflies](../case-studies/fireflies.md).

**What scope looks like when it works.** The games that held up best were single-player, ran in one tab, and cost
nothing per player: Still Life, Last Drop, Rootbound (about 2.7 MB, everything generated in code, "No runtime
APIs"), Fireflies (a 3-minute session).

## How to apply it

- [ ] First game: one player, one device, one session of 2 to 10 minutes. Write the session length in `GREAT.md`.
- [ ] No online multiplayer in a first game. If the person wants it later, plan it as its own project, and only call
      it done after two real people on two machines have played it.
- [ ] No paid service at runtime. Generate assets once, before shipping, with the user's yes, and ship the files.
- [ ] If a feature needs several people, a webcam, or a microphone, state who will test it for real and when. Until
      then, label it untested in `HANDOVER.md`.
- [ ] Get a first playable in the first session. If the plan can't produce one, cut the plan.
- [ ] Reuse proven code (the starter, `recipes/`, an earlier game of theirs) before writing new systems.
- [ ] Respect `maxAgents` in `helper.json`. A few agents doing focused work beat many fighting over one machine.
- [ ] Never accept "ask me no questions, make it viral" as a spec. Ask the eight interview questions first.

Related: [one verb](one-verb.md), [when to start over](when-to-start-over.md),
[retired games](../case-studies/retired-games.md).

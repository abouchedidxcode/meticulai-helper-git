# Who to trust

**The rule:** when sources disagree, trust them in this order:

1. **The person playing the game** (the user, or a friend they hand it to).
2. **A measured number** from a tool, about something that can be measured.
3. **Two independent critics who agree.**
4. **One critic.**

Bots come in beside numbers: they are good at tuning numbers, and they can't tell you whether it's fun.

## Evidence

**The person beats every critic.** Kite Race ran six rounds of AI critics. Each round pushed for more speed and a denser
world: an early critic found a third of the race under 100 km/h and called it "a prototype with a nice colour grade,"
so a speed floor went in. Later critics praised the faster build ("the street sections approach great"). Then the
creator played it: "too fast right now, not picturesque enough and not a fun vibe." The decision log notes that six
critic rounds had pushed the other way (110-210 km/h, denser), and that the creator's play overrides them. Cruise speed dropped to
54 km/h. Shake, motion blur, speed streaks and hit-stops came out. A race went from about 62 s to about 125 s, and a
painted look became the default. Critics will push a game past your taste, toward their idea of a good game in that
genre. Only the person can say "that's not the game I want."

**The person sees what nothing else saw.** In Orbitball, the visual scores were around 6.5 to 7.3 and bot matches were
"won 3-0" with "0 page errors." The creator played it and said the camera jitters, "nothing happens," and pressing
Space "seems to restart the game." The camera started inside a wall with the player off screen. Nothing caught it,
because "the gate frames are staged cameras and the play-test bot reads game state to aim, so neither showed what a
person sees." See [the Orbitball case study](../case-studies/orbitball.md).

**Measure instead of arguing.** In Echo, the lighting builder said 11% of frames in the nave were black. A critic said
39%. Same room. The critic's test called frames black if their average brightness was near zero, which counted frames
that "held dim lines a player could follow." The fix wasn't to pick a side. One tool (`black-frames`) became the only
yardstick: a pixel counts as a visible line if it is bright enough and brighter than its neighbours, and a frame is
black if under 0.3% of its pixels are lines. The next run measured 7.2%. Argument over.

Hezarfen had the same problem with colour: "Three grades set by eye each overshot the previous critic's complaint."
A palette tool measured 13 named regions in game and concept; the next grade landed within 2 to 14 levels.

**Critics are good at "where," bad at "which direction."** From Orbitball's notes: "reviewers are good at finding
where something is wrong and unreliable about which direction to move it." In Kite Fight, one night scene sat in the
same score band for ten rounds while reviewers said "too brown and warm," then "not orange enough." Use a critic to
find the weak spot. Use a measurement or the person to pick the direction.

**Check every finding against the game.** Critics are often wrong about facts:
- A Mycelium critic reported a missing "Contested" label. The capture tool hides labels on purpose.
- A Kite Race critic flagged a "red flag" in the scene. It was a boat's sail.
But they also catch real problems: in Under Glass a reviewer found the global lighting was silently off. Never ignore
a finding; never act on one without checking it.

**Blind tests must really be blind.** In Kite Fight, judges compared two images side by side. The result was 3-3, and
every pick went to whichever image they saw second. Scoring single images blind gave a clear answer (37 vs 30). Still
Life 2's blind A/B worked because players got two unlabelled builds in shuffled order and had to find the difference
themselves.

**Bots tune numbers; they don't tell you it's fun.** From Inkbound's findings: "Scripted players and CPU fights found
the infinite combos, the dominant character and the 21 s rounds. A critic watching recordings found what the numbers
hid: fighters standing inside each other, one combo route, a stop-start rhythm." Bots have blind spots too: Mycelium's
bot acted only every 5 to 10 s of game time, "so its losses overstate difficulty."

## How to apply it

- [ ] Hand the game to the person after every big change and ask what they felt. Act on their first complaint first.
- [ ] If the person contradicts the critics, the person wins. Write it in `DECISIONS.md` so later agents don't undo it.
- [ ] When two sources disagree about something countable (darkness, loudness, frame time, colour, round length),
      stop arguing and build or run a tool that measures it. Then use only that tool.
- [ ] Give critics recordings of real play, from the title screen, with the real player camera. Never staged frames.
- [ ] Ask critics *where* it's weak. Decide *which way* to fix it from the person or a measurement.
- [ ] Before fixing a finding, reproduce it in the game or find it in the code. Note false findings in `DEVLOG.md`.
- [ ] For A/B tests use `node tools/play/blind-ab.mjs`: shuffled labels, one item at a time, the key kept away from
      the judge.
- [ ] Use bots to find exploits, balance numbers and round lengths. Never report "the bot had fun" as a result.

Related: [big moves, not dials](big-moves-not-dials.md), [picking a look](picking-a-look.md),
[Orbitball](../case-studies/orbitball.md).

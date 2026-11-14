# Lost Marbles and Marble Golf

**What it is:** a 50-marble downhill race on a wooden-block course built across a kid's bedroom; ten marbles are cut at
every checkpoint. Play: https://meticulai.com/games/lost-marbles/ and the spin-off https://meticulai.com/games/marble-golf/

## What worked

**A look in one sentence.** "Macro photography of a toy run." That sentence chose everything: a real photographed room
as backdrop and light source, refracting glass marbles, tilt-shift depth of field so the course reads as a miniature,
warm grading. Most assets are made in code; the rest are free CC0 scans and recordings. It is the look other games were
asked to match: Last Drop began with "something equally striking."

**Bodies you can watch.** Fifty marbles physically bump into each other on a course generated from a seed: forks with
different risk, loop-the-loops, banked turns, a giant bowl everyone gets dumped into. The spectacle comes from physics,
so every race is different.

**It reached people.** The notes record about 50,000 views on the first post, and the creator asked for an update worth a
second post. That update was built by seven builder agents in parallel worktrees (the bowl, ramps, a marble workshop,
mobile work, big jumps and set pieces) and four critic agents. Each piece had its own tests.

**A solo mode with no server.** A Solo Show against 49 bots runs entirely in the browser, so the game works even when
nobody else is online.

## What didn't

- **"Way too fast" and jittery.** The creator's play notes. Perk families, burst boosts and speed bursts from the server
  were removed or softened. Other changes from the same period (faster bots, new course pieces) were kept.
- **Features the creator disliked were dropped without argument.** Perk families were built, then removed. The old
  fly-over path stayed because "i like the old path that it took."
- **Follow-ups spread thin.** Thirteen marble spin-offs were started in parallel sessions, each required to share one
  look. Six were left playable by link but unfinished; for two of them the notes say "never run on a real GPU or
  phone, never heard by ear."

## Marble Golf: reuse done right

Marble Golf is toy-block minigolf in the same room. It was built from copies of Lost Marbles' renderer, physics, wood
scans, marble shader, sounds and radio, in its own folder so neither game can break the other. The first version had
nine holes, slingshot aiming, gems, power-ups and pass-and-play, checked by three reviewer agents (rules, interface,
and a bot that aims badly on purpose). Two days later it had 18 holes, because instead of porting race pieces one at a
time it carried a copy of Lost Marbles' course builder and ran it inside a golf hole.

Bots kept it honest. A bot with 2.5 degrees of aim noise aced some back-nine holes on 50-83% of tries, because race
pieces deliver every marble to the same spot. Cups moved off that line, behind guards and bumpers: aces fell to 0-6%.

## The lesson

A look you can say in one sentence, built on real physics and free assets, carries a game a long way. And once
something works, reuse it whole: a proven renderer and course builder turned a new game into a two-day job.

## What your agent should copy

- [ ] Write the look as one photographic or material sentence ("macro photography of a toy run") and let it decide
      camera, scale and light.
- [ ] Prefer real physics and seeded generation for variety over hand-scripted spectacle.
- [ ] Give every online game a solo mode that runs in the browser.
- [ ] When the person says "too fast" or "jittery," remove speed spikes and smooth the camera before adding anything.
- [ ] Reuse proven systems by copying them into the new game's folder, not by importing across games.
- [ ] Use a noisy-aim bot to find holes that are too easy or impossible.

Related: [scope](../playbook/scope.md), [feel](../playbook/feel.md), [picking a look](../playbook/picking-a-look.md).

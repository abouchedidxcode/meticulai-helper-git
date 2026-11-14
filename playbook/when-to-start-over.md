# When to start over

**The rule:** start over when the core is wrong: the person has played it and it still isn't fun, and the reason is
built into the foundations (how the player moves, what they do, how it's judged). Keep the parts that work, freeze the
old version so nothing is lost, and rebuild the core from a written design. Don't start over to chase a prettier
renderer or a different engine. That is a rewrite, not a fix.

## Evidence

**Inkbound: 77 cycles, then a rebuild in one evening.** Inkbound was a 1v1 sword duel drawn in ink. The first version
ran 77 build cycles. It had three fighters drawn as painted frames: about 360 generated paintings across two batches,
roughly $16 of the game's $28 of generation spend. It had four stages, a ladder, a training mode and many systems. A
fresh critic rated it "about two-thirds" of the concept clip. Its handover said, in bold: "Nobody has played this build
by hand." Then the creator played it: "Still doesnt feel fun what soever, look into fighting games and what makes those,
do not be contrained by what was previously already built."

Its post-mortem named four causes: "The fighters were pictures, not bodies"; "It was slow and careful"; "Too many
systems, none of them the game"; and "It was judged by stills. Looks were polished for 70 cycles while nobody played."
None could be fixed by another cycle. All four were in the foundations.

**How the rebuild went.** The old version was frozen as a tag, a branch and a runnable folder, so nothing was lost.
The new design started from what makes fighting games fun: spacing, risk and reading the other player, and depth
from few inputs. It became a triangle of three verbs (Slash beats Stroke, Stroke beats Guard, a well-timed Guard
beats everything) plus a dash. Frame data came first, in a table the animation follows. Fighters became skeletons
drawn fresh every frame, so new moves cost nothing. A written contract split the work into three layers (the fight
simulation, the bodies, everything seen and heard), and three builder agents built them at once. It was "playable in
one evening." A critic's first verdict, "a puppet show with one combo," drove the next round. Nobody has played the rebuild by hand
yet either; the difference is that it was built to be judged by play. See
[the Inkbound case study](../case-studies/inkbound.md).

**Scope churn is not the same as starting over.** Scrapfall began as a mech battle royale on an alien base. It became
a modular mech game with 32 parts in 7 slots, then a colony map, then a twilight map, then a ring station with curved
gravity and team deathmatch, then a smaller donut-shaped arena, then one map only. At one point its design branch had
about 410 commits, and several half-built streams lived on separate branches. Each direction change kept the engine but
reset the content. What held it together was one thing the creator called "perfect" early on (the grey-box movement)
and kept. Only after many rounds: "im finally happy with the look ... now its about fine tunning it for gameplay and
fun." Changing direction ten times costs more than one honest restart.

**The wrong rewrite: chasing an engine.** Topple, a physics demolition puzzle game, was ported to a closed-beta native
engine. The port became days of chasing "star parity": making the same demolition plan earn the same score as in the
original. Logs read like "job 3 matches on 9 of 12 plans, job 2 on 4 of 20," and the port's physics wasn't even
repeatable from run to run. A separate look at moving Scrapfall to the same engine found it would be a full rewrite of
about 117,000 lines of JavaScript into C, under a licence that allowed only a showcase, with the engine's telemetry
running in players' browsers and builds needing a licensed machine. It stayed an exploration. Neither effort made
either game more fun.

**The wrong rewrite: a prettier version of a game people liked.** Bonesworth's photoreal rebuild lost to the original
stylised game (see [picking a look](picking-a-look.md)).

**Right ways to keep the past.** Still Life 2 kept its original rule as an option when it changed the core. Last Drop
tried new terrain behind a test flag before making it the game. Rootbound replaced its renderer without touching the
rules.

## How to apply it

- [ ] Before restarting, the person must have played the current build. Never restart on critic or bot scores alone.
- [ ] Write down why it isn't fun as numbered causes. If each cause can be fixed by one big move, don't restart; do the
      moves (see [big moves](big-moves-not-dials.md)).
- [ ] Restart when the causes are in the foundations: how the player moves, the main verb, how things are drawn, or
      how the game is judged.
- [ ] Freeze the old version first: a git tag, a branch, and a note in `DECISIONS.md`. Nothing is deleted.
- [ ] Write the new design in `GREAT.md` before code: the verb, the feel numbers, what it must not repeat.
- [ ] Reuse what was proven (audio, a stage painter, a physics core). Rebuild only the broken parts.
- [ ] Get to a playable build fast (one session), and hand it to the person.
- [ ] Don't rewrite for an engine, a renderer or a fidelity jump unless the person asks and it fixes a problem they
      felt. A port that needs months to match the old game is the wrong move.

Related: [scope](scope.md), [one verb](one-verb.md), [Inkbound](../case-studies/inkbound.md).

# The playbook

What made the good games good and the bad ones fail, across about 60 browser games made with AI agents
(meticulai.com). Every chapter leads with a rule, shows what happened in real games, and ends with a checklist an agent
can follow. The stories behind the rules are in [case-studies/](../case-studies/README.md).

**For the agent:** read the chapter that matches the step you're on before you start it. When the user says "it's not
fun" or "it looks generic," the answer is usually in here.

**For the curious human:** start with the ten rules below, then read whichever chapter sounds like your problem.

## The ten rules

1. **Fun means your choices visibly matter.** Every few seconds the player decides something and sees the result. A
   beautiful game where "i honestly felt like i wasnt doing anything" is a tech demo.
   [What makes it fun](what-makes-it-fun.md)
2. **One sentence, one verb, one twist.** "Time moves only when you move." If a feature doesn't serve the sentence,
   it waits. [One verb](one-verb.md)
3. **Judge by play, never by stills.** Twelve games scored on still frames ran 100 to 200 commits each and stayed on
   their first milestone. One scored 138 rounds and ended where it started. [Big moves, not dials](big-moves-not-dials.md)
4. **Big moves, not dials.** Each round changes something a player notices in the first minute. Three rounds without
   a gain bigger than the noise means change approach. [Big moves, not dials](big-moves-not-dials.md)
5. **The person playing beats every critic.** Then measured numbers, then two critics who agree, then one critic.
   Bots tune numbers; they can't tell you it's fun. [Who to trust](who-to-trust.md)
6. **Teach by doing.** Something happens in 5 seconds, a first win in 30, each thing explained the moment it first
   happens, and every death says what killed you. [First 60 seconds](first-60-seconds.md)
7. **Every action answers.** Next-frame response, a short freeze on hits, a sound, a camera that never loses the
   player, generous input. Never change feel the person praised. [Feel](feel.md), [Audio](audio.md)
8. **A look with a point of view, in words.** Lock it on one small scene. Let the person pick between looks by
   playing. Restrained bloom, no neon by default, no generic AI interface. References set mood; they are never a
   target. [Picking a look](picking-a-look.md), [Using free assets](using-free-assets.md)
9. **Small, solo, free to run.** No online multiplayer and no paid calls at runtime in a first game. Reuse what
   works. [Scope](scope.md)
10. **Rebuild the core, not the paint.** When the person has played it and it still isn't fun because of the
    foundations, freeze the old version and rebuild from a written design. Never rewrite to chase an engine.
    [When to start over](when-to-start-over.md)

And one habit under all of them: **measure what no agent can see or hear** (loudness, frame time, black frames) and
say plainly what nobody has checked yet. [Audio](audio.md), [Gotchas](gotchas.md)

## Chapters

| Chapter | Read it when |
| --- | --- |
| [what-makes-it-fun.md](what-makes-it-fun.md) | Designing the core loop; the user says "boring" or "tech demo" |
| [one-verb.md](one-verb.md) | The interview; writing `GREAT.md`; the game is growing systems |
| [big-moves-not-dials.md](big-moves-not-dials.md) | Planning each playtest round; scores aren't moving |
| [who-to-trust.md](who-to-trust.md) | Critics, bots and the user disagree |
| [first-60-seconds.md](first-60-seconds.md) | Title, onboarding, tutorial, death screens |
| [feel.md](feel.md) | Controls, camera, hits, speed, webcam input |
| [picking-a-look.md](picking-a-look.md) | Art direction, references, UI, generated images |
| [using-free-assets.md](using-free-assets.md) | Before pulling, generating or hand-coding any asset; assets that don't belong together |
| [when-to-start-over.md](when-to-start-over.md) | "It's still not fun" after many rounds |
| [scope.md](scope.md) | Choosing what to build; multiplayer or paid AI ideas |
| [audio.md](audio.md) | Sound effects, music, mixing |
| [gotchas.md](gotchas.md) | Black screens, invisible objects, hitches, broken builds |

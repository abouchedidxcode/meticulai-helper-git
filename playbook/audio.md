# Audio: measure what nobody can hear

**The rule:** your agent cannot hear. So every action must answer with a sound, the mix must be measured with numbers,
sound must never be the only warning, and a person must listen before anything ships. Start with sound made in code.
Generate or download sound only where code clearly falls short.

## Evidence

**Most of these games were never heard while they were built.** The project notes say it again and again. Dragon Aces:
audio "judged only numerically; never heard by a human." Pop Quiz got 33 generated sound effects: "Nobody has listened
to the sounds yet." Last Drop got an adaptive music score built by a subagent: "nobody has listened yet." The homepage
music was levelled with a loudness filter and marked "nobody has listened." This is normal for agent work. It is only
a problem if nobody admits it and nobody measures.

**When someone did listen, they found things right away.** In Last Drop the creator's first note was an "annoying wind
sound"; the wind went 10 times quieter. In Scrapfall: "The audio is still very pitchy and weird all over the place,
definitely not in the satisfying realm." Scrapfall also had sound cutting out under load, fixed by stealing the
quietest voices first and thinning distant sounds.

**Measuring works.** Fourteen small webcam games (the "hands games") were built side by side and shown in one hall,
so a player hops from game to game. A probe tapped everything reaching the browser's audio output during 35 seconds of
bot play and printed the median, the 90th percentile (p90: how loud the loud parts are) and the peak, in dBFS
(decibels below the loudest a browser can play). The first sweep found p90 values spread across about 22 dB. One
game, Hands Up, was about 16 dB louder than the rest. Another, Fit, had crunch sounds peaking at -3.2 dBFS, close to
clipping. The team set one target for all of them: **p90 between -27 and -31 dBFS, peaks no higher than -8 dBFS**,
with a gentle limiter on the master output instead of turning everything down. After one round, every game sat inside
the target (p90 from -25.3 to -29.9). Nobody had to listen to get there. A person still has to check it sounds good.

**Sound can't be the only warning.** Still Life 2 was playtested by blind agent players through a harness with no
sound. In one room, stamping presses warned with a hiss. Testers died under them and said the stamps didn't read as
dangerous. The fix was a flashing danger frame around each stamp for the 0.9 s before it falls. Real players who play
muted, or in a noisy room, get the same benefit.

**Procedural sound is enough to start.** Rootbound and Last Drop make every sound in code, with no audio files. The
hands games were built under a rule of "procedural Web Audio only," and Fireflies' harmonised chimes became the model
for the calm ones. All of them hit the loudness target. Code sound is free, tiny, and can follow the game: Last Drop's
music changes with play.

**Generated sound has traps.**
- Very short requests come back near-silent. In Pop Quiz, generated effects asked for under about 0.8 s were almost
  empty. Ask for a longer sound and trim it.
- Expect rejects. Inkbound's first music round (12 takes) was thrown out as drum-only. The second round was used.
- The voice-and-sound service used for these games allowed only 2 requests at once, and queuing about 20 caused
  "too many requests" errors. Cache every file you generate and skip ones that already exist.
- Never make a paid call while someone plays. Generate once, save the files, ship the files.

**Free libraries: follow the licence and the rules.** Lost Marbles uses CC0 recordings, public-domain music and CC BY
tracks that need a credit. When a sound site blocked automated downloads, the creator rejected any workaround. Record
every credit in `CREDITS.md`.

**Browsers block sound until the player acts.** The homepage starts its audio from a speaker button because of the
autoplay rule. Phones and Safari need the audio engine resumed inside a click or key press. Test tools that need sound
have to launch the browser with autoplay allowed, or they measure silence.

## How to apply it

- [ ] Every player action and every important event fires a sound through one place (an event bus), so nothing is
      silent by accident: jump, land, hit, pickup, death, score, win.
- [ ] Start with sound made in code. Note in `DECISIONS.md` where you would pay for generated sound, and ask first.
- [ ] Unlock audio on the first click or key press. Show a speaker button if the game should make sound before that.
- [ ] Measure loudness with `node tools/play/loud.mjs` during bot play. Aim for p90 between -27 and -31 dBFS and peaks
      at or below -8 dBFS. Fix outliers with a limiter on the master bus, not by lowering everything.
- [ ] Give every danger that has a warning sound a visual warning too.
- [ ] Generating sound: ask for at least about 1 s, request a few takes, cache files, log every call in
      `paid-ledger.md`, and never call a paid service at runtime.
- [ ] In every hand-back, say plainly: "Nobody has heard this yet. Please listen with sound on and tell me what's
      annoying, too loud or missing." Then act on the first thing they say.

Related: [feel](feel.md), [gotchas](gotchas.md), [who to trust](who-to-trust.md).

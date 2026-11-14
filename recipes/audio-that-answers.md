# Audio that answers the player

**Problem:** sounds feel robotic (the same sample 30 times in a row), pile up into noise, or drown out the
moment that matters.

Five habits:
1. **Pitch and volume variance** on every repeated sound (a few semitones, a few dB).
2. **Intensity scaling:** a hard landing is louder and lower than a soft one.
3. **Rate limiting:** the same sound at most every ~40 ms (ten coins at once = one rich sound, not ten).
4. **Ducking:** lower the music under big moments (win, boss hit, death).
5. **Distance:** things far away are quieter; off-screen threats are still heard.

**Where:** new file `src/audio/voice.js`, a thin layer over the starter's `audio`.

```js
// file: src/audio/voice.js
// audio: the starter's audio object (ctx.audio).
export function createVoice(audio) {
  const lastPlayed = new Map(); // name -> AudioContext time

  // Returns false if the same sound played too recently.
  function allowed(name, gap = 0.04) {
    const ctx = audio.context;
    if (!ctx) return false;
    const now = ctx.currentTime;
    if (now - (lastPlayed.get(name) ?? -1) < gap) return false;
    lastPlayed.set(name, now);
    return true;
  }

  // 1 when at the listener, fading to 0 at `range` metres.
  const falloff = (dist, range = 25) => Math.max(0, 1 - dist / range) ** 2;

  return {
    // intensity 0..1 (e.g. fall speed / max fall speed)
    land(intensity) {
      if (!allowed('land')) return;
      audio.thud({ freq: 170 - intensity * 80, vol: 0.1 + intensity * 0.5, vary: 1.5 });
    },
    footstep() {
      if (!allowed('step', 0.12)) return;
      audio.blip({ freq: 140, slide: 0.7, length: 0.04, vol: 0.05, type: 'sine', vary: 3 });
    },
    // A combo that climbs: pass the count so far.
    combo(count) {
      if (!allowed('combo')) return;
      audio.chime({ note: Math.min(count, 12) * 2, vol: 0.18 });
    },
    // A sound somewhere in the world.
    at(distance, play) {
      const v = falloff(distance);
      if (v > 0.02) play(v);
    },
    bigMoment() {
      audio.duck(0.25, 1200); // music down to 25% for 1.2 s
      audio.chime({ note: 0, vol: 0.25 });
      audio.chime({ note: 7, vol: 0.2 });
      audio.thud({ freq: 70, vol: 0.5, length: 0.4 });
    },
  };
}
```

Use it: `const voice = createVoice(audio);` then `voice.land(Math.min(1, fallSpeed / 16))`,
`voice.at(enemy.position.distanceTo(player.pos), (v) => audio.whoosh({ vol: 0.3 * v }))`.

**Check it works:** no agent can listen, so measure: `node tools/play/loud.mjs --seconds 20` while the bot
plays. Peaks should not clip and a quiet stretch should not be silent. Then ask the user to play with sound on.

**Common wrong version:** `Math.random()` for pitch inside gameplay code (use the audio module's own random,
as the starter does, so sound never shifts the game's `?seed`), starting the `AudioContext` before a click (the
browser blocks it; the starter unlocks on first input), creating a new `AudioContext` per sound (browsers cap
them at a handful), and mixing everything at full volume (leave headroom: the starter's compressor catches
peaks, it can't fix a mix).

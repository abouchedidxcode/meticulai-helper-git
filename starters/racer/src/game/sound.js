// ENGINE, WIND AND TYRES, all from the base synth's noise loops (no audio files).
// The engine is three humming bands (low, mid, high) that cross-fade as the revs climb, and the
// revs drop at each "gear change", so speed has a sound as well as a look. Wind grows with the
// square of speed; the tyre hiss follows how hard the car is sliding.
//
// Swap in real recordings later (see the kit's sources/ for free engine loops) by replacing
// the three `engine` loops with samples whose playback rate follows `revs`.

export function createSound({ audio, tune }) {
  const engine = [
    { loop: audio.noiseLoop({ freq: 95, q: 9 }), at: 0.1 },
    { loop: audio.noiseLoop({ freq: 190, q: 10 }), at: 0.5 },
    { loop: audio.noiseLoop({ freq: 330, q: 10 }), at: 0.95 },
  ];
  const wind = audio.noiseLoop({ freq: 1500, q: 0.4 });
  const tyres = audio.noiseLoop({ freq: 2600, q: 3 });
  const scrape = audio.noiseLoop({ freq: 700, q: 2 });
  let gear = 0;

  return {
    /** share = speed / top speed (0..1.2), sliding 0..1, throttle 0..1 */
    update({ share, sliding = 0, throttle = 0, scraping = false, grid = false }) {
      const G = tune.speed;
      // Four pretend gears: within each the revs climb, then drop at the change.
      const gears = 4;
      const g = Math.min(gears - 1, Math.floor(share * gears));
      if (g !== gear && !grid) {
        if (g > gear) audio.blip({ freq: 150 + g * 30, vol: 0.05, length: 0.06, slide: 0.7, type: 'square', vary: 0 });
        gear = g;
      }
      const revs = grid ? share : 0.25 + 0.75 * (share * gears - g) * (0.6 + 0.4 * (g / (gears - 1))) + g * 0.06;
      const loud = G.engineVolume * (0.35 + 0.65 * Math.max(throttle, share * 0.6));
      for (const band of engine) band.loop.set(loud * Math.max(0, 1 - Math.abs(revs - band.at) * 2.2));
      wind.set(G.windVolume * Math.min(1.3, share) ** 2);
      tyres.set(G.tyreVolume * sliding * Math.min(1, share * 3));
      scrape.set(scraping ? 0.3 * Math.min(1, share * 2) : 0);
    },
    mute() {
      for (const band of engine) band.loop.set(0);
      wind.set(0);
      tyres.set(0);
      scrape.set(0);
    },
  };
}

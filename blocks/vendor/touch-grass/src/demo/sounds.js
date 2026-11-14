// The demo's sound: footsteps on grass, five recordings by Kenney (CC0, from Patch's asset library). Nothing is
// synthesized, and the scythe, the fire and the wind are silent: the library has no recordings that fit them.
// Sound starts on the player's first click, as browsers ask; the recordings are fetched and decoded before that, so
// the click itself costs nothing.

const STEPS = ['footstepOnGrass1Medium', 'footstepOnGrass2Medium', 'footstepOnGrass3Medium', 'footstepOnGrass4Medium', 'footstepOnGrass5Medium'];

export function createSounds(base = './assets/audio/') {
  let ctx = null;
  let master = null;
  const buffers = [];
  let last = -1;

  return {
    /** Fetches and decodes the recordings. Call while loading; resolves whether or not there is any sound to have. */
    async load() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      try {
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        await Promise.all(
          STEPS.map(async (name) => {
            try {
              buffers.push(await ctx.decodeAudioData(await (await fetch(`${base}${name}.ogg`)).arrayBuffer()));
            } catch {
              // a missing recording is just a missing sound
            }
          }),
        );
      } catch {
        ctx = null;
      }
    },
    /** Call from a click. */
    start() {
      if (ctx?.state === 'suspended') ctx.resume();
    },
    /** One footfall, 0 to 1 loud. Never the same recording twice running. */
    step(volume) {
      if (!ctx || ctx.state !== 'running' || !buffers.length) return;
      let pick = Math.floor(Math.random() * buffers.length);
      if (pick === last) pick = (pick + 1) % buffers.length;
      last = pick;
      const source = ctx.createBufferSource();
      source.buffer = buffers[pick];
      source.playbackRate.value = 0.92 + Math.random() * 0.16;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 0.3;
      source.connect(gain).connect(pan).connect(master);
      source.start();
    },
  };
}

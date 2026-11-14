// The test hooks: window.__game and the URL switches.
// The kit's tools (serve, record, fps, loud) rely on these exact names. Don't rename them.
//
// URL switches:
//   ?seed=42      deterministic random (see random.js)
//   ?autostart=1  skip the title screen
//   ?bot=1        the built-in bot plays (implies autostart)
//   ?test=1       skip buttons, controls card always visible, red error banner
//   ?mute=1       no sound

function readFlags() {
  const p = new URLSearchParams(location.search);
  const on = (name) => p.has(name) && p.get(name) !== '0' && p.get(name) !== 'false';
  const seedParam = Number.parseInt(p.get('seed') ?? '', 10);
  return {
    // No ?seed: pick one from the clock (the only place the game is allowed to be "random").
    seed: Number.isFinite(seedParam) ? seedParam >>> 0 : (Date.now() % 1_000_000) >>> 0,
    seedGiven: Number.isFinite(seedParam),
    autostart: on('autostart') || on('bot'),
    bot: on('bot'),
    test: on('test'),
    mute: on('mute'),
  };
}

export const flags = readFlags();

// Called once by main.js when everything exists.
//   loop      core/loop.js instance (time, frames, pause/resume/step)
//   getState  () => plain object, safe to JSON.stringify
//   errors    the shared errors array (core/errors.js)
//   events    the event bus (core/events.js)
//   skipTo    (name) => boolean
//   capture   () => PNG data URL of the current frame
//   isReady   () => boolean, true once a real frame has been drawn
export function installHooks({ loop, getState, errors, events, skipTo, capture, isReady }) {
  const game = {
    get ready() {
      return isReady();
    },
    get frames() {
      return loop.frames;
    },
    get time() {
      return loop.time;
    },
    get state() {
      return getState();
    },
    errors,
    seed: flags.seed,
    flags,
    pause: () => loop.pause(),
    resume: () => loop.resume(),
    step: (n = 1) => loop.step(n),
    skipTo: (name) => skipTo(name),
    capture: () => capture(),
    events,
  };
  window.__game = game;
  return game;
}

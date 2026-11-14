// A tiny event bus. One shared instance (`events`) is exposed as window.__game.events,
// so tools and tests can listen to the same moments the game emits.
//
//   const off = events.on('pickup', (data) => { ... });
//   events.emit('pickup', { remaining: 3 });
//   off(); // stop listening
//
// Names the tools rely on: 'jump' 'land' 'pickup' 'hit' 'death' 'score' 'win'.
// Add your own freely ('start', 'pause', 'level', ...).

export function createEvents() {
  const listeners = new Map(); // name -> Set of functions

  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => off(name, fn);
  }

  function off(name, fn) {
    listeners.get(name)?.delete(fn);
  }

  function once(name, fn) {
    const stop = on(name, (data) => {
      stop();
      fn(data);
    });
    return stop;
  }

  function emit(name, data) {
    const set = listeners.get(name);
    if (!set) return;
    // Copy first so a listener may remove itself while we loop.
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch (err) {
        // A broken listener must not stop the game; errors.js picks this up.
        setTimeout(() => {
          throw err;
        });
      }
    }
  }

  return { on, off, once, emit };
}

export const events = createEvents();

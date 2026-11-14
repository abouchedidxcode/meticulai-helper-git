// The game loop: a fixed 60 Hz simulation, drawn as often as the screen refreshes.
//
// Why fixed steps: the game plays the same on a 30 Hz laptop, a 144 Hz monitor and a slow
// headless test browser. Jump heights, timers and the bot don't change with frame rate.
//
// Game time vs wall time: `loop.time` only moves when a simulation step runs. When paused
// it stops. When the browser is slow (headless tests run at 5-30 fps) the game slows down
// instead of skipping ahead, so tests and recordings measure GAME time, never wall time.
//
//   const loop = createLoop({
//     tick(dt)          { ... },   // every fixed step, dt = 1/60 s. Put ALL gameplay here.
//     render(alpha, wallDt) { ... } // every screen frame. alpha 0..1 = how far between the
//   });                               last two ticks (for smooth interpolation).
//   loop.start();
//   loop.pause(); loop.resume(); loop.step(5); // step works while paused (tests, frame-by-frame)

export function createLoop({ tick, render, hz = 60, maxFrameTime = 0.25, maxStepsPerFrame = 8 }) {
  const dt = 1 / hz;
  let acc = 0;
  let last = null;
  let rafId = 0;

  const loop = {
    dt,
    time: 0, // game seconds simulated so far
    ticks: 0, // fixed steps run so far
    frames: 0, // frames drawn so far
    paused: false,
    running: false,

    start() {
      if (loop.running) return;
      loop.running = true;
      last = null;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      loop.running = false;
      cancelAnimationFrame(rafId);
    },
    pause() {
      loop.paused = true;
    },
    resume() {
      loop.paused = false;
      acc = 0; // don't fast-forward through the time spent paused
      last = null;
    },
    // Advance exactly n steps (deterministic), then draw. Pauses first if needed.
    step(n = 1) {
      loop.paused = true;
      for (let i = 0; i < n; i++) runTick();
      draw(1, 0);
      return loop.time;
    },
  };

  function runTick() {
    tick(dt);
    loop.ticks++;
    loop.time = loop.ticks * dt;
  }

  function draw(alpha, wallDt) {
    render(alpha, wallDt);
    loop.frames++;
  }

  function frame(now) {
    if (!loop.running) return;
    rafId = requestAnimationFrame(frame);

    let wall = last === null ? 0 : (now - last) / 1000;
    last = now;
    // Clamp: after a hidden tab or a long hitch, don't try to catch up seconds of game.
    if (wall > maxFrameTime) wall = maxFrameTime;
    if (wall < 0) wall = 0;

    if (!loop.paused) {
      acc += wall;
      let steps = 0;
      while (acc >= dt && steps < maxStepsPerFrame) {
        runTick();
        acc -= dt;
        steps++;
      }
      // Still behind after the max steps: drop the rest (the game slows down, it doesn't spiral).
      if (steps === maxStepsPerFrame) acc = 0;
    }
    draw(loop.paused ? 1 : acc / dt, wall);
  }

  return loop;
}

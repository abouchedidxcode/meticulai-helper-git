// Keyboard, mouse (pointer lock) and gamepad folded into one per-frame control state for createPilot().fly().
// From Dragon Aces (touch controls and the game's weapon keys left out). Click the canvas to lock the mouse.
//
//   mouse          swings the aim (0.0022 rad per pixel x sensitivity)
//   A / D          roll left / right (on top of the autopilot)
//   W / S          open / close the throttle (S also brakes)
//   Shift, Space   boost (burns stamina)
//   Q / E          barrel roll left / right
//   C or Alt held  free look (the aim does not move; the camera may use freeDx/freeDy)
//   gamepad        right-handed: left stick aims (rate based), right stick X rolls, A boosts, bumpers roll

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{sensitivity?: number, invertY?: boolean}} [opts]
 */
export function createInput(canvas, opts = {}) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered this frame
  const mouse = { dx: 0, dy: 0 };
  let locked = false;
  let lockedAt = 0;
  let lastRead = 0;
  let padPrev = [];

  const api = {
    sensitivity: opts.sensitivity ?? 1,
    invertY: !!opts.invertY,
    enabled: true,
    get locked() { return locked; },
    lock() {
      try {
        const p = canvas.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch(() => canvas.requestPointerLock());
      } catch {
        canvas.requestPointerLock();
      }
    },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    /** Call once per frame: returns the frame's controls and clears the per-frame accumulators. */
    read() {
      const k = keys;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.004, (now - (lastRead || now - 16)) / 1000));
      lastRead = now;
      // stick: dead zone, then a curve (fine aim near the centre, full speed at the rim)
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      const curve = (v) => Math.sign(v) * Math.abs(v) ** 1.7;
      const free = k.has('KeyC') || k.has('AltLeft');
      const ax = mouse.dx * 0.0022 * api.sensitivity;
      const ay = mouse.dy * 0.0022 * api.sensitivity * (api.invertY ? -1 : 1);
      const c = {
        aimDx: free ? 0 : ax,
        aimDy: free ? 0 : ay,
        freeDx: free ? ax : 0,
        freeDy: free ? ay : 0,
        freeLook: free,
        roll: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
        throttleUp: k.has('KeyW') || k.has('ArrowUp'),
        throttleDown: k.has('KeyS') || k.has('ArrowDown'),
        boost: k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Space'),
        dodge: pressed.has('KeyE') ? 1 : pressed.has('KeyQ') ? -1 : 0,
      };
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (const p of pads) if (p && p.connected && p.mapping === 'standard') { pad = p; break; }
      if (pad) {
        const a = pad.axes;
        const b = pad.buttons;
        // rate based (rad/s), so the feel is the same at 60 and 144 fps
        c.aimDx += curve(dz(a[0])) * 2.9 * dt * api.sensitivity;
        c.aimDy += curve(dz(a[1])) * 2.2 * dt * api.sensitivity * (api.invertY ? -1 : 1);
        c.roll += dz(a[2]);
        c.boost = c.boost || b[0].pressed || b[10].pressed;
        c.throttleUp = c.throttleUp || dz(a[3]) < -0.5 || b[12].pressed;
        c.throttleDown = c.throttleDown || dz(a[3]) > 0.5 || b[13].pressed;
        const edge = (i) => { const on = b[i] && b[i].pressed; const hit = on && !padPrev[i]; padPrev[i] = on; return hit; };
        if (edge(5)) c.dodge = 1;
        if (edge(4)) c.dodge = -1;
      }
      c.roll = Math.max(-1, Math.min(1, c.roll));
      mouse.dx = mouse.dy = 0;
      pressed.clear();
      return c;
    },
  };

  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (api.enabled && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousedown', () => { if (api.enabled && !locked) api.lock(); });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!locked) return;
    // browsers emit occasional huge deltas when the lock engages or the window refocuses: drop them
    if (performance.now() - lockedAt < 120 || Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    lockedAt = performance.now();
  });
  return api;
}

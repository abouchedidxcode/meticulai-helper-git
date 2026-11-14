// Glider controls from Hezarfen (Meticulai): keyboard, mouse (pointer lock: the mouse moves a virtual stick that
// eases back to centre) and gamepad, merged into one state: { pitch, roll, flare, jump, pause, restart }.
// pitch +1 = pull back (nose up); roll +1 = right; flare 0..1 (the landing airbrake).
//   W / Up push (dive), S / Down pull (climb), A D / Left Right bank, Shift or right mouse flare,
//   Space / left click / Enter = jump (launch), Escape / P = pause, R = restart. Call requestLock() on a click.
// A scripted source (tests, the autopilot) can override it: input.script = (state, dt) => {...}.
import { clamp, damp } from './util.js';

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, cleared each frame
  const stick = { x: 0, y: 0 };
  const state = { pitch: 0, roll: 0, flare: 0, jump: false, pause: false, restart: false, any: false, locked: false, device: 'keyboard' };
  let kPitch = 0;
  let kRoll = 0;
  let kFlare = 0;
  let pitchHeld = 0;
  let invertY = false;
  let sensitivity = 1;

  const down = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  };
  const up = (e) => keys.delete(e.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    stick.x = clamp(stick.x + e.movementX * 0.0032 * sensitivity, -1, 1);
    stick.y = clamp(stick.y + e.movementY * 0.0032 * sensitivity * (invertY ? -1 : 1), -1, 1);
    state.device = 'mouse';
  });
  let mouseFlare = false;
  canvas.addEventListener('mousedown', (e) => {
    pressed.add(e.button === 0 ? 'Mouse0' : 'Mouse2');
    if (e.button === 2) mouseFlare = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) mouseFlare = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) { stick.x = 0; stick.y = 0; }
  });

  const api = {
    state, keys, script: null,
    requestLock() { canvas.requestPointerLock?.()?.catch?.(() => {}); },
    exitLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    setInvertY(v) { invertY = v; },
    setSensitivity(v) { sensitivity = v; },
    centre() { stick.x = 0; stick.y = 0; kPitch = 0; kRoll = 0; kFlare = 0; },
    update(dt) {
      const k = (...codes) => codes.some((c) => keys.has(c));
      // keyboard: eased so a tap is a nudge and a hold is full deflection
      const tp = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
      const tr = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
      // a tap or a short hold is a moderate input; holding for a second goes to full deflection
      pitchHeld = tp === 0 ? 0 : pitchHeld + dt;
      kPitch = damp(kPitch, tp * (0.62 + 0.38 * clamp((pitchHeld - 0.35) / 0.9)), tp === 0 ? 7 : 4.5, dt);
      kRoll = damp(kRoll, tr, tr === 0 ? 7 : 5, dt);
      if (tp || tr) state.device = 'keyboard';
      // the mouse stick holds a bank (a turn should not need constant dragging) and eases pitch back to trim
      stick.x = damp(stick.x, 0, 0.12, dt);
      stick.y = damp(stick.y, 0, 0.4, dt);
      let pitch = kPitch + stick.y;
      let roll = kRoll + stick.x;
      // the flare ramps in over about 0.4 s and out faster, so a tap is a touch of airbrake
      const flareHeld = k('ShiftLeft', 'ShiftRight') || mouseFlare;
      kFlare = clamp(kFlare + (flareHeld ? dt / 0.4 : -dt / 0.2), 0, 1);
      let flare = kFlare;
      let jump = pressed.has('Space') || pressed.has('Mouse0') || pressed.has('Enter');
      let pause = pressed.has('Escape') || pressed.has('KeyP');
      let restart = pressed.has('KeyR');
      // gamepad: left stick flies, A jumps, either trigger or B flares
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
        const ax = dz(p.axes[0] || 0);
        const ay = dz(p.axes[1] || 0);
        if (ax || ay) state.device = 'gamepad';
        roll += ax;
        pitch += ay;
        const b = (i) => p.buttons[i] && p.buttons[i].pressed;
        const trig = Math.max(p.buttons[6]?.value || 0, p.buttons[7]?.value || 0, b(1) ? 1 : 0);
        if (trig > flare) flare = trig;
        if (b(0) && !api._padA) jump = true;
        if (b(9) && !api._padStart) pause = true;
        api._padA = b(0);
        api._padStart = b(9);
        break;
      }
      state.pitch = clamp(pitch, -1, 1);
      state.roll = clamp(roll, -1, 1);
      state.flare = flare;
      state.jump = jump;
      state.pause = pause;
      state.restart = restart;
      state.any = pressed.size > 0;
      pressed.clear();
      if (api.script) api.script(state, dt);
      return state;
    },
  };
  return api;
}

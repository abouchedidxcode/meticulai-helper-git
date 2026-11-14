// Keyboard, mouse, touch and a simple gamepad, behind named actions.
//
//   input.held('jump')      true while the key/button is down
//   input.pressed('jump')   true for exactly ONE fixed step after it went down
//   input.released('jump')  true for exactly one step after it went up
//   input.move()            { x, y } from WASD / arrows / left stick / touch stick, length <= 1
//                           (y = +1 means "forward": W, up arrow, stick up)
//   input.mouse             { x, y, dx, dy, buttons, wheel } (dx/dy/wheel: since the last step)
//
// "Pressed" is counted per simulation step, not per screen frame, so a press is never missed
// or seen twice when the screen runs faster or slower than 60 Hz.
//
// Actions are lists of key codes (KeyboardEvent.code), 'mouse:0' (left button) or 'pad:0'
// (gamepad button 0 = A / cross). Add your own: input.define('dash', ['ShiftLeft', 'pad:2']).
//
// Bots and tests can drive the same actions:
//   input.virtual.press('jump'); input.virtual.hold('jump', true); input.virtual.setMove(0, 1);
//
// Buffering (press slightly early, still counts): see makeBuffer() at the bottom.

const DEFAULT_ACTIONS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'pad:0'],
  action: ['KeyF', 'mouse:0', 'pad:2'],
  turnLeft: ['KeyQ', 'pad:4'],
  turnRight: ['KeyE', 'pad:5'],
  pause: ['Escape', 'KeyP', 'pad:9'],
  confirm: ['Enter', 'Space', 'pad:0'],
};

const PAD_DEADZONE = 0.2;

function isTyping(target) {
  if (!target || !target.tagName) return false;
  const tag = target.tagName;
  // Sliders and checkboxes don't take typing: keep the game's keys working while they have focus.
  if (tag === 'INPUT') return !['range', 'checkbox', 'button', 'radio'].includes(target.type);
  return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function createInput({ canvas, actions = {} } = {}) {
  const map = { ...DEFAULT_ACTIONS, ...actions };

  const held = new Set(); // codes held right now
  const pendingDown = new Set(); // went down since the last step
  const pendingUp = new Set(); // went up since the last step
  let pressedNow = new Set(); // what pressed() answers during this step
  let releasedNow = new Set();

  const mouse = { x: 0, y: 0, dx: 0, dy: 0, buttons: 0, wheel: 0 };
  let pendingDx = 0;
  let pendingDy = 0;
  let pendingWheel = 0;

  const touchStick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  const pad = { axes: [0, 0, 0, 0], buttons: new Set() };

  const virtualHeld = new Set();
  const virtualPressed = new Set();
  const virtualMove = { x: 0, y: 0, active: false };

  function down(code) {
    if (!held.has(code)) pendingDown.add(code);
    held.add(code);
  }
  function up(code) {
    if (held.has(code)) pendingUp.add(code);
    held.delete(code);
  }

  // Keyboard ------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    if (e.repeat) return;
    down(e.code);
    // Stop the page from scrolling on Space / arrows.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => up(e.code));
  // Alt-tab with a key down would leave it stuck forever without this.
  window.addEventListener('blur', () => {
    for (const code of [...held]) up(code);
  });

  // Mouse ------------------------------------------------------------------------
  const el = canvas ?? window;
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    pendingDx += e.movementX ?? 0;
    pendingDy += e.movementY ?? 0;
  });
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    mouse.buttons = e.buttons;
    down(`mouse:${e.button}`);
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    mouse.buttons = e.buttons;
    up(`mouse:${e.button}`);
  });
  el.addEventListener('wheel', (e) => {
    pendingWheel += Math.sign(e.deltaY);
  }, { passive: true });
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // Touch: left half of the screen is a stick, right half is 'jump' -----------------
  el.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX < window.innerWidth / 2 && touchStick.id === null) {
        touchStick.id = t.identifier;
        touchStick.ox = t.clientX;
        touchStick.oy = t.clientY;
        touchStick.x = 0;
        touchStick.y = 0;
      } else {
        down('touch:right');
      }
    }
    e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== touchStick.id) continue;
      const r = 60; // pixels for a full push
      let x = (t.clientX - touchStick.ox) / r;
      let y = -(t.clientY - touchStick.oy) / r;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      touchStick.x = x;
      touchStick.y = y;
    }
    e.preventDefault();
  }, { passive: false });
  const touchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchStick.id) {
        touchStick.id = null;
        touchStick.x = 0;
        touchStick.y = 0;
      } else {
        up('touch:right');
      }
    }
  };
  el.addEventListener('touchend', touchEnd);
  el.addEventListener('touchcancel', touchEnd);
  map.jump = [...map.jump, 'touch:right'];

  // Gamepad (first pad only; polled once per step) --------------------------------------
  function pollPad() {
    const gp = navigator.getGamepads?.()[0];
    if (!gp) return;
    for (let i = 0; i < 4; i++) {
      const v = gp.axes[i] ?? 0;
      pad.axes[i] = Math.abs(v) < PAD_DEADZONE ? 0 : v;
    }
    gp.buttons.forEach((b, i) => {
      const code = `pad:${i}`;
      if (b.pressed) down(code);
      else up(code);
    });
    // D-pad as arrows.
    [['pad:12', 'ArrowUp'], ['pad:13', 'ArrowDown'], ['pad:14', 'ArrowLeft'], ['pad:15', 'ArrowRight']]
      .forEach(([p, a]) => (held.has(p) ? down(a) : up(a)));
  }

  // Queries ---------------------------------------------------------------------------
  const codesOf = (name) => map[name] ?? [name]; // unknown name = a raw key code

  const input = {
    mouse,
    actions: map,
    enabled: true,

    define(name, codes) {
      map[name] = codes;
    },
    held(name) {
      if (!input.enabled) return false;
      return virtualHeld.has(name) || codesOf(name).some((c) => held.has(c));
    },
    pressed(name) {
      if (!input.enabled) return false;
      return virtualPressed.has(name) || codesOf(name).some((c) => pressedNow.has(c));
    },
    released(name) {
      if (!input.enabled) return false;
      return codesOf(name).some((c) => releasedNow.has(c));
    },
    move() {
      if (!input.enabled) return { x: 0, y: 0 };
      if (virtualMove.active) return { x: virtualMove.x, y: virtualMove.y };
      let x = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
      let y = (input.held('up') ? 1 : 0) - (input.held('down') ? 1 : 0);
      x += pad.axes[0] + touchStick.x;
      y += -pad.axes[1] + touchStick.y;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      return { x, y };
    },

    // Called by main.js at the start of every fixed step.
    beginTick() {
      pollPad();
      pressedNow = new Set(pendingDown);
      releasedNow = new Set(pendingUp);
      pendingDown.clear();
      pendingUp.clear();
      mouse.dx = pendingDx;
      mouse.dy = pendingDy;
      mouse.wheel = pendingWheel;
      pendingDx = pendingDy = pendingWheel = 0;
    },
    // Called by main.js at the end of every fixed step.
    endTick() {
      virtualPressed.clear();
    },
    // Forget everything pressed so far (e.g. the key that started the game).
    clear() {
      pendingDown.clear();
      pendingUp.clear();
      pressedNow.clear();
      releasedNow.clear();
      virtualPressed.clear();
    },

    // For bots and tests.
    virtual: {
      press(name) {
        virtualPressed.add(name);
      },
      hold(name, on) {
        if (on) virtualHeld.add(name);
        else virtualHeld.delete(name);
      },
      setMove(x, y) {
        virtualMove.active = true;
        virtualMove.x = x;
        virtualMove.y = y;
      },
      release() {
        virtualHeld.clear();
        virtualPressed.clear();
        virtualMove.active = false;
      },
    },
  };
  return input;
}

// Input buffering: remember a press for a short window so "slightly too early" still counts.
//
//   const jumpBuffer = makeBuffer(0.12);         // 120 ms of game time
//   if (input.pressed('jump')) jumpBuffer.set();
//   jumpBuffer.tick(dt);
//   if (canJump && jumpBuffer.take()) jump();    // take() consumes it
export function makeBuffer(window) {
  let left = 0;
  return {
    window,
    set() {
      left = this.window;
    },
    tick(dt) {
      left = Math.max(0, left - dt);
    },
    get active() {
      return left > 0;
    },
    take() {
      if (left <= 0) return false;
      left = 0;
      return true;
    },
    clear() {
      left = 0;
    },
  };
}

// The dev menu's game-wide tools. They work on any game that keeps the starter's small interface, with no code in
// the game: freeze and step, speed, a free camera, hide the HUD, screenshot, copy the view, restart, the computer
// playing, and the numbers at the top (frames per second, draw calls...). panel.js draws their buttons.
//
// The free camera never touches the game's camera: main.js asks `dev.view(game.camera)` which camera to draw with,
// and while the free camera is on it gets a separate one. Leaving it shows the game's own camera again, unchanged.
// While it is on, its keys and the mouse on the picture do not reach the game.

import * as THREE from 'three';

export const SPEEDS = [
  [0.125, '⅛', 'An eighth of normal speed: see exactly what happens'],
  [0.25, '¼', 'A quarter of normal speed'],
  [0.5, '½', 'Half speed'],
  [1, '1', 'Normal speed'],
  [2, '2', 'Twice as fast'],
  [4, '4', 'Four times as fast: get through the slow parts'],
];
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const r2 = (n) => Math.round(n * 100) / 100;
const isText = (t) => !!t && ((t.tagName === 'INPUT' && /^(text|search|number|)$/.test(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

/**
 * @param {object} h  what main.js handed over (all optional): { name, loop, view, input, audio, testmode, notes,
 *                    flags, getGame, getMode, restart }
 * @param {object} o  { canSave, say(text), flash(text, ms) }
 */
export function createTools(h = {}, o = {}) {
  const { loop = null, view = null } = h;
  const say = o.say ?? (() => {});
  const flash = o.flash ?? (() => {});
  const hooks = () => (window.__game && typeof window.__game.pause === 'function' ? window.__game : null);
  const game = () => h.getGame?.() ?? null;
  const listeners = new Set();
  const changed = () => { for (const fn of listeners) fn(); };

  const tools = {
    frozen: false,
    speed: 1,
    fly: false,
    noHud: false,
    muted: false,
    bot: !!h.flags?.bot,
    /** which tools this game can do (a button that can do nothing is not shown) */
    has: {
      freeze: !!(loop?.freeze || hooks()),
      speed: !!loop && 'speed' in loop,
      fly: !!view?.draw,
      shot: !!(view?.capture || hooks()?.capture),
      restart: typeof h.restart === 'function',
      bot: !!h.flags,
      note: !!h.notes?.enabled,
      mute: !!h.audio?.setVolume,
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** a mode is on that changes what the player sees or how time runs */
    active: () => tools.frozen || tools.fly || tools.noHud || tools.speed !== 1,
  };

  // ---------------------------------------------------------------- freeze, step, speed ----
  // Freeze is the maker's, pause is the player's: a frozen game shows nothing on top, and the pause screen and the
  // note box keep working while it is frozen.
  tools.setFrozen = (on, quiet) => {
    on = !!on;
    if (loop?.freeze) loop.freeze(on);
    else { const g = hooks(); if (!g) { say('This game has no way to freeze (window.__game.pause is missing).'); return; } if (on) g.pause(); else g.resume(); }
    tools.frozen = on;
    if (!quiet) flash(on ? 'Frozen.   \\  runs again     .  one step forward' : 'Running');
    changed();
  };
  tools.step = () => {
    if (!tools.frozen) tools.setFrozen(true, true);
    if (loop?.freeze) { const was = loop.paused; loop.step(1); loop.paused = was; } // step() pauses; put that back
    else hooks()?.step(1);
    changed();
  };
  tools.setSpeed = (v) => {
    if (!tools.has.speed) return;
    tools.speed = loop.speed = SPEEDS.some(([s]) => s === v) ? v : 1;
    changed();
  };

  // ---------------------------------------------------------------- the numbers at the top ----
  // Closed, this is all that runs each frame: count it, note the time.
  let frames = 0, last = 0, winStart = 0, worst = 0, statsOn = false;
  const stat = { fps: 0, ms: 0, worst: 0, calls: 0, tris: 0 };
  let lastCam = null;
  function count(now) {
    frames++;
    if (last) { const d = now - last; if (d > worst) worst = d; }
    last = now;
    if (!winStart) winStart = now;
    const span = now - winStart;
    if (span >= 500) {
      const f = (frames * 1000) / span;
      stat.fps = stat.fps ? stat.fps * 0.6 + f * 0.4 : f; // smoothed: the number must not flicker
      stat.ms = span / frames;
      stat.worst = worst;
      frames = 0; worst = 0; winStart = now;
    }
  }
  /** the menu is open: also count what the renderer draws (everything in the frame, including a look's passes) */
  tools.watch = (on) => {
    statsOn = !!on;
    const info = view?.renderer?.info;
    if (info && !statsOn) info.autoReset = true;
  };
  tools.stats = () => {
    const g = hooks();
    const buf = view?.renderer?.domElement;
    return {
      ...stat,
      time: loop?.time ?? g?.time ?? 0,
      seed: h.flags?.seed ?? g?.seed ?? null,
      scene: h.getMode?.() ?? g?.state?.scene ?? '',
      size: buf ? `${buf.width}×${buf.height}` : '',
    };
  };

  // ---------------------------------------------------------------- free camera ----
  let free = null; // the separate camera, while flying
  let ortho = false, dragging = false, flyLast = 0;
  const flyKeys = new Set();
  // "on the picture": anywhere but a button, a box to type in, the menu or the note box (a title card counts as picture)
  const onPicture = (t) => !!t && !t.closest?.('button, input, select, textarea, a, label, .devm, .devm-tab, .note-box');

  tools.setFly = (on) => {
    on = !!on;
    if (on === tools.fly) return;
    if (on) {
      const cam = lastCam ?? game()?.camera;
      if (!cam || !tools.has.fly) { say('The free camera needs the game to be drawing first.'); return; }
      cam.updateWorldMatrix(true, false);
      free = cam.clone(false);
      cam.matrixWorld.decompose(free.position, free.quaternion, free.scale);
      free.rotation.order = 'YXZ';
      free.rotation.setFromQuaternion(free.quaternion, 'YXZ');
      ortho = !!free.isOrthographicCamera;
      if (!ortho) free.rotation.z = 0; // a level horizon
      free.updateMatrixWorld(true);
      flyKeys.clear(); dragging = false; flyLast = 0;
      tools.fly = true; // before the mouse is let go, so a mouse-look game does not pause (dev.holdsMouse)
      if (document.pointerLockElement) document.exitPointerLock?.();
      flash(ortho
        ? 'Free camera.   W A S D  slide     drag  slide     wheel or Q E  zoom     Shift  fast     C or Esc  back to the game'
        : 'Free camera.   W A S D  move     Q E  down, up     drag  look     wheel  zoom     Shift  fast     C or Esc  back to the game', 6000);
    } else {
      tools.fly = false; free = null; dragging = false; flyKeys.clear();
      flash(h.pointerLock && h.getMode?.() === 'playing' ? 'Back to the game\'s camera.   Click the game to take the mouse again' : 'Back to the game\'s camera', 1800);
    }
    changed();
  };

  function flyUpdate(now) {
    const dt = flyLast ? Math.min(0.05, (now - flyLast) / 1000) : 0;
    flyLast = now;
    const k = (c) => (flyKeys.has(c) ? 1 : 0);
    const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown');
    const r = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
    const u = k('KeyE') - k('KeyQ');
    const fast = k('ShiftLeft') || k('ShiftRight') ? 5 : 1;
    const w = view?.width || window.innerWidth, hgt = view?.height || window.innerHeight;
    if (ortho) {
      const span = (free.top - free.bottom) / free.zoom; // world units the picture is tall
      const sp = span * 0.8 * fast * dt;
      free.translateX(r * sp);
      free.translateY(f * sp);
      if (u) free.zoom = clamp(free.zoom * (1 + u * 1.2 * dt), 0.05, 40);
      const halfH = (free.top - free.bottom) / 2;
      free.left = (-halfH * w) / hgt; free.right = (halfH * w) / hgt;
    } else {
      const sp = 8 * fast * dt;
      if (f) free.translateZ(-f * sp); // along where it looks
      if (r) free.translateX(r * sp);
      if (u) free.position.y += u * sp;
      free.aspect = w / hgt;
    }
    free.updateProjectionMatrix();
    free.updateMatrixWorld(true);
  }

  // Keys and the mouse while flying: caught before the game hears them (the game listens later, on the way back up).
  window.addEventListener('keydown', (e) => {
    if (!tools.fly || e.metaKey || e.ctrlKey || isText(e.target)) return;
    if (!FLY_KEYS.has(e.code)) return;
    if (!e.repeat) flyKeys.add(e.code);
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);
  window.addEventListener('keyup', (e) => { if (flyKeys.delete(e.code) && tools.fly) e.stopImmediatePropagation(); }, true);
  window.addEventListener('blur', () => { flyKeys.clear(); dragging = false; });
  for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) {
    window.addEventListener(type, (e) => {
      if (!tools.fly || !onPicture(e.target)) return;
      if (type === 'pointerdown' && e.button === 0) dragging = true;
      e.stopImmediatePropagation();
      if (type !== 'click') e.preventDefault();
    }, true);
  }
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => { dragging = false; }, true);
  for (const type of ['pointermove', 'mousemove']) {
    window.addEventListener(type, (e) => {
      if (!tools.fly || !free) return;
      if (dragging && type === 'pointermove') {
        const dx = e.movementX || 0, dy = e.movementY || 0;
        if (ortho) {
          const perPx = (free.top - free.bottom) / free.zoom / (view?.height || window.innerHeight);
          free.translateX(-dx * perPx);
          free.translateY(dy * perPx);
        } else {
          const s = 0.0022 * (free.fov / 55);
          free.rotation.y -= dx * s;
          free.rotation.x = clamp(free.rotation.x - dy * s, -1.55, 1.55);
        }
      }
      if (dragging || onPicture(e.target)) e.stopImmediatePropagation(); // the game must not turn its own camera
    }, true);
  }
  window.addEventListener('wheel', (e) => {
    if (!tools.fly || !free || !onPicture(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const out = e.deltaY > 0;
    if (ortho) free.zoom = clamp(free.zoom * (out ? 0.93 : 1.075), 0.05, 40);
    else free.fov = clamp(free.fov * (out ? 1.07 : 0.935), 5, 120);
  }, { passive: false, capture: true });

  /** Once per drawn frame (from main.js through dev.view): which camera to draw with. */
  tools.view = (camera) => {
    const now = performance.now();
    count(now);
    lastCam = camera;
    if (statsOn) {
      const info = view?.renderer?.info;
      if (info) {
        if (info.autoReset) info.autoReset = false; // count the whole frame, however many passes a look draws
        else { stat.calls = info.render.calls; stat.tris = info.render.triangles; }
        info.reset();
      }
    }
    if (!tools.fly || !free) return camera;
    flyUpdate(now);
    return free;
  };
  /** the camera the picture is drawn with right now */
  tools.camera = () => (tools.fly && free ? free : lastCam ?? game()?.camera ?? null);
  /** the game's own camera */
  tools.gameCamera = () => lastCam ?? game()?.camera ?? null;

  // ---------------------------------------------------------------- copy view ----
  /** Where the camera is and what it looks at, as text an agent can use. */
  tools.viewText = () => {
    const cam = tools.camera();
    if (!cam) return null;
    cam.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    const at = pos.clone().addScaledVector(dir, 10);
    const v = { position: [r2(pos.x), r2(pos.y), r2(pos.z)], lookAt: [r2(at.x), r2(at.y), r2(at.z)] };
    if (cam.isOrthographicCamera) v.zoom = r2(cam.zoom); else v.fov = r2(cam.fov);
    const from = tools.fly ? 'the free camera' : 'the game\'s own camera';
    const t = tools.stats();
    return `// Camera view from the dev menu of "${h.name ?? 'the game'}" (${from}, ${t.scene || 'game'} at ${t.time.toFixed(1)} s, seed ${t.seed}).\n`
      + `// camera.position.set(...position); camera.lookAt(...lookAt)${cam.isOrthographicCamera ? '; camera.zoom = zoom' : '; camera.fov = fov'}; camera.updateProjectionMatrix()\n`
      + JSON.stringify(v);
  };

  // ---------------------------------------------------------------- no HUD ----
  tools.setNoHud = (on) => {
    tools.noHud = !!on;
    document.body.classList.toggle('devm-nohud', tools.noHud);
    flash(tools.noHud ? 'Everything on top of the picture is hidden.   H  shows it again' : 'The HUD is back', tools.noHud ? 2600 : 1200);
    changed();
  };

  // ---------------------------------------------------------------- screenshot ----
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; };
  /** A PNG of the picture alone (never the menu or the HUD). Saved for the agent on the dev server, else downloaded. */
  tools.screenshot = async () => {
    const g = game();
    let url = null;
    try { url = g && view?.capture ? view.capture(g.scene, tools.camera() ?? g.camera) : hooks()?.capture?.(); } catch { url = null; }
    if (typeof url !== 'string' || !url.startsWith('data:image/png')) throw new Error('the game gave no picture');
    if (o.canSave) {
      try {
        const res = await fetch('/__helper/shot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ png: url }) });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.file) return `Saved ${body.file} (your agent can open it).`;
      } catch { /* no dev server after all: download instead */ }
    }
    const a = document.createElement('a');
    a.href = url; a.download = `${String(h.name ?? 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp()}.png`;
    document.body.append(a); a.click(); a.remove();
    return `Downloaded ${a.download} (look in your Downloads folder).`;
  };

  // ---------------------------------------------------------------- restart, computer plays, note, mute ----
  tools.restart = () => { if (tools.frozen) tools.setFrozen(false, true); h.restart?.(); flash('A new run', 1200); };
  /** The game reads ?bot=1 once when it starts, so this loads the page again with the switch flipped. */
  tools.toggleBot = () => {
    const p = new URLSearchParams(location.search);
    if (tools.bot) p.delete('bot'); else p.set('bot', '1');
    p.set('autostart', '1');
    location.search = p.toString();
  };
  tools.note = () => h.notes?.open?.();
  tools.setMuted = (on) => {
    if (!tools.has.mute) return;
    tools.muted = !!on;
    h.audio.setVolume('master', tools.muted ? 0 : h.tune?.audio?.master ?? 0.8);
    changed();
  };

  tools.holdsMouse = () => tools.fly;
  return tools;
}

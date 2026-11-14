// The PS1 look's timing logic, without three.js: blackout and afterimage, eyelids, fade-in, vignette pulse,
// reveal punch, flash, shake and dread. PS1Pipeline asks it for uniform values once per frame.
// Ported from Don't Blink's render pipeline; the behaviour and numbers are the same.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Vertex snap resolution for a low-res target (the shader snaps clip-space x/y to half of it). */
export function snapResolution(width, height, vertexSnap) {
  const snap = Math.max(0.0001, vertexSnap);
  return [width / snap, height / snap];
}

/** JS mirror of the vertex shader's snap, for tests and CPU-side checks. ndc is -1..1. */
export function snapNdc(ndc, snapRes) {
  const grid = snapRes * 0.5;
  return Math.floor(ndc * grid + 0.5) / grid;
}

/**
 * Size of the low-res target. Letterboxed: always width x height. Otherwise: height rows, widened to the screen.
 * @returns {[number, number]}
 */
export function targetSize(opts, screenW, screenH) {
  if (opts.letterbox || !screenW || !screenH) return [opts.width, opts.height];
  return [Math.max(1, Math.round((opts.height * screenW) / screenH)), opts.height];
}

/** Largest centred rectangle of the given aspect inside w x h (CSS pixels). */
export function letterbox(w, h, aspect) {
  let vw = w;
  let vh = Math.round(w / aspect);
  if (vh > h) {
    vh = h;
    vw = Math.round(h * aspect);
  }
  return { x: Math.floor((w - vw) / 2), y: Math.floor((h - vh) / 2), w: vw, h: vh };
}

export class PS1State {
  /** @param {import('./defaults.js').PS1Options} opts resolved options */
  constructor(opts) {
    this.opts = opts;
    this.res = [opts.width, opts.height];
    this.blind = false;
    this.black = 0;
    this.sinceClose = 0; // ms since the eyes closed: drives the afterimage fade
    this.lidMs = opts.lidOpenMs; // eyelid opening time for the current reveal
    this.hasFrame = false; // the scene target holds a real frame (the afterimage source)
    this.sinceReveal = Infinity; // ms since the last reveal: drives the vignette pulse
    this.time = 0;
    this.flash = 0;
    this.shake = 0;
    this.dread = 0;
    this.punchAmount = 0;
    this.closing = null; // [elapsed ms, duration ms] of a slow eyelid close
  }

  /**
   * Eyes closed / open. `instant` + open skips the fade and eyelids (a hard cut, e.g. a jump scare).
   * @returns {boolean} true if the screen should go black right now (eyes just closed, no afterimage)
   */
  setBlind(blind, instant = false) {
    if (!blind && instant) {
      this.blind = false;
      this.closing = null;
      this.black = 0;
      this.sinceReveal = Number.MAX_VALUE / 2;
      return false;
    }
    if (blind === this.blind) return false;
    this.blind = blind;
    this.closing = null;
    if (blind) {
      this.black = 1;
      this.sinceReveal = Infinity;
      this.sinceClose = 0;
      return !this.ghostActive();
    }
    this.sinceReveal = 0;
    // A quick blink snaps open; a long closure opens slowly and heavily.
    const k = clamp(this.sinceClose / 700, 0.4, 1);
    this.lidMs = this.opts.lidOpenMs * k;
    return false;
  }

  setFlash(v) { this.flash = clamp(v, 0, 1); }
  setShake(v) { this.shake = clamp(v, 0, 1); }
  setDread(v) { this.dread = clamp(v, 0, 1); }
  punch(v) { this.punchAmount = Math.max(this.punchAmount, clamp(v, 0, 1)); }

  /** Close the eyes slowly over `ms` (lids drawing shut), ending fully black. */
  closeEyes(ms) {
    if (this.blind) return;
    this.closing = [0, Math.max(1, ms)];
  }

  ghostActive() {
    return this.hasFrame && this.opts.afterimageStrength > 0;
  }

  /** Afterimage strength right now: fades out over afterimageFadeMs after the eyes close. */
  ghostLevel() {
    if (!this.ghostActive()) return 0;
    const k = 1 - this.sinceClose / Math.max(1, this.opts.afterimageFadeMs);
    return k > 0 ? this.opts.afterimageStrength * Math.pow(k, 1.5) : 0;
  }

  /**
   * Advance by dt seconds. Returns null when the frame is plain black (skip all drawing), otherwise
   * { renderScene, u: { ghost, dread, lid, time, black, flash, vignette, shake: [x, y] } }.
   * @param {number} dt seconds
   * @param {() => number} [rand] 0..1 random source for the shake
   */
  step(dt, rand = Math.random) {
    const o = this.opts;
    const dtMs = Math.max(0, dt) * 1000;
    this.time += Math.max(0, dt);

    if (this.closing) {
      this.closing[0] += dtMs;
      if (this.closing[0] >= this.closing[1]) {
        this.closing = null;
        this.setBlind(true);
      }
    }
    if (!this.blind) {
      if (this.black > 0) this.black = Math.max(0, this.black - dtMs / Math.max(1, o.fadeInMs));
      this.sinceReveal += dtMs;
    } else {
      this.black = 1;
      this.sinceClose += dtMs;
    }

    const ghost = this.blind ? this.ghostLevel() : 0;
    if (this.black >= 1 && this.flash <= 0 && ghost <= 0) return null;

    // While blind the scene is never drawn: the target keeps the last open-eyes frame.
    const renderScene = !this.blind || this.flash > 0;
    if (renderScene) this.hasFrame = true;

    // Eyelids open over lidMs after a reveal (ease-out).
    const lidT = Math.min(1, this.sinceReveal / Math.max(1, this.lidMs));
    let lid = this.blind ? 1 : 1 - Math.pow(1 - lidT, 3);
    if (this.closing) {
      const t = this.closing[0] / this.closing[1];
      lid = Math.min(lid, 1 - t * t);
    }
    this.punchAmount = Math.max(0, this.punchAmount - dt / Math.max(0.05, o.punchDecaySec));
    let pulse = 0;
    if (this.sinceReveal < o.vignettePulseMs) {
      const k = 1 - this.sinceReveal / o.vignettePulseMs;
      pulse = o.vignettePulse * k * k;
    }
    let shake = [0, 0];
    if (this.shake > 0) {
      // Jitter in whole low-res pixels so the shake stays chunky.
      const maxPx = o.fx.shakePx * this.shake;
      shake = [Math.round((rand() * 2 - 1) * maxPx) / this.res[0], Math.round((rand() * 2 - 1) * maxPx) / this.res[1]];
    }
    return {
      renderScene,
      u: {
        ghost,
        dread: this.blind ? 0 : this.dread,
        lid,
        time: this.time,
        black: this.black,
        flash: this.flash,
        vignette: o.vignetteBase + pulse + this.punchAmount * o.punchVignette,
        shake,
      },
    };
  }
}

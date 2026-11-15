// RACE RULES: laps, checkpoints, positions, and the ghost recorder. No drawing, no input.
//
// Checkpoints stop shortcuts: a lap only counts when the car has passed every gate in order
// and then the finish line. Each car has a "progress" object; feed it the car's lap position
// (s) every step with stepProgress() and it tells you when something happened.
//
// The ghost: recordGhost() keeps a list of samples [time, x, y, z, yaw] for the lap being
// driven; when a lap is the best so far that list becomes `ghost.best`. sampleGhost() plays a
// list back at any time. That is all a time-trial mode needs (see STARTER.md).

import { crossed } from './track.js';

export function makeProgress(track, s) {
  return {
    lap: -1, // laps finished. -1 = has not crossed the start line yet (the grid is behind it)
    next: track.gates.length - 1, // index of the gate to pass next (the last gate is the line)
    prevS: s,
    lapStart: 0, lapTimes: [], best: Infinity, last: 0,
    finished: false, finishTime: 0,
    missed: false, // went past the next gate's spot on the lap without going through it
  };
}

/** Returns '' | 'gate' | 'lap' | 'finish'. time = race time in seconds. */
export function stepProgress(track, p, s, time) {
  let what = '';
  const gates = track.gates;
  if (!p.finished && crossed(track, p.prevS, s, gates[p.next])) {
    what = 'gate';
    if (p.next === gates.length - 1) {
      if (p.lap >= 0) {
        p.last = time - p.lapStart;
        p.lapTimes.push(p.last);
        p.best = Math.min(p.best, p.last);
        what = 'lap';
      }
      p.lap += 1;
      p.lapStart = time;
      p.next = 0;
      if (p.lap >= track.laps) {
        p.finished = true;
        p.finishTime = time;
        what = 'finish';
      }
    } else p.next += 1;
  }
  // Only possible on a track without rails (or after a teleport): the car is well past the gate.
  const past = track.delta(gates[p.next], s);
  p.missed = !p.finished && p.lap >= 0 && past > 40 && past < track.length / 3;
  p.prevS = s;
  return what;
}

/** One number to sort the field by: metres raced. Bigger = further ahead. */
export function raceDistance(track, p, s) {
  if (p.finished) return track.laps * track.length + 1e6 - p.finishTime * 1000;
  return p.lap * track.length + s;
}

// --- the ghost ----------------------------------------------------------------------------

export function createGhostRecorder({ every = 0.1 } = {}) {
  const ghost = {
    current: [], // the lap being driven
    best: null, // the samples of the best lap so far (kept across restarts)
    bestTime: Infinity,
    clock: 0,
    startLap() {
      ghost.current = [];
      ghost.clock = 0;
    },
    record(lapTime, car) {
      if (ghost.current.length && lapTime < ghost.clock) return;
      ghost.current.push([lapTime, car.x, car.y, car.z, car.yaw]);
      ghost.clock = lapTime + every;
    },
    /** Call when a lap ends. Returns true if it was the best one. */
    finishLap(lapTime, car) {
      ghost.current.push([lapTime, car.x, car.y, car.z, car.yaw]);
      const better = lapTime < ghost.bestTime;
      if (better) {
        ghost.best = ghost.current;
        ghost.bestTime = lapTime;
      }
      ghost.startLap();
      return better;
    },
  };
  return ghost;
}

/** Where the ghost is `t` seconds into its lap. Fills out = { x, y, z, yaw } or returns null. */
export function sampleGhost(samples, t, out = {}) {
  if (!samples || samples.length < 2 || t > samples[samples.length - 1][0]) return null;
  let i = Math.min(samples.length - 2, Math.max(0, Math.floor(t / (samples[1][0] - samples[0][0] || 0.1))));
  while (i > 0 && samples[i][0] > t) i--;
  while (i < samples.length - 2 && samples[i + 1][0] < t) i++;
  const a = samples[i];
  const b = samples[i + 1];
  const k = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0] || 1)));
  out.x = a[1] + (b[1] - a[1]) * k;
  out.y = a[2] + (b[2] - a[2]) * k;
  out.z = a[3] + (b[3] - a[3]) * k;
  out.yaw = a[4] + Math.atan2(Math.sin(b[4] - a[4]), Math.cos(b[4] - a[4])) * k;
  return out;
}

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;

export function formatTime(t) {
  if (!Number.isFinite(t)) return '-:--.-';
  const m = Math.floor(t / 60);
  return `${m}:${(t % 60).toFixed(1).padStart(4, '0')}`;
}

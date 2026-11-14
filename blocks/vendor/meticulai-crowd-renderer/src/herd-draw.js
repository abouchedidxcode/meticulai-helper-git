// FROM A HERD TO THE CROWD: write horses (and their riders) straight into a crowd set's instance buffer, the fast
// path the game used for thousands of riders a frame. From TUMEN by Meticulai.
// The herd is herd.js (the movement law, the trail, the body's bend and lean); this file only copies its state into
// the 24 floats per instance the crowd renderer reads (crowd.js F).
import { GAIT_NAMES, inIntervals } from './locomotion.js';
import { F } from './crowd.js';

const HOOF_BONES = ['hoof_fl', 'hoof_fr', 'hoof_hl', 'hoof_hr'];

/**
 * How far ahead of the mid-body point the forehand must sit for this horse model (metres, size 1): the furthest
 * forward a front hoof is while planted, + 5 cm. Pass it to createHerd({ lead }).
 */
export function leadFromModel(model) {
  let reach = 0;
  for (let g = 1; g < 5; g++) {
    const c = model.clips[GAIT_NAMES[g]], mc = model.meta?.clips?.[GAIT_NAMES[g]]; if (!c || !mc?.contacts) continue;
    for (let h = 0; h < 2; h++) {
      const tr = model.tracked[HOOF_BONES[h]], iv = mc.contacts[HOOF_BONES[h]]; if (!tr || !iv) continue;
      for (let k = 0; k < c.n; k++) if (inIntervals(k / c.n, iv)) reach = Math.max(reach, tr[(c.row + k) * 12 + 11]);
    }
  }
  return Math.max(0.6, Math.min(1.5, reach + 0.05));
}

/** Row tables for a horse model: gRow[g], gN[g] for gaits 0..4 (idle..gallop). */
export function gaitRows(model) {
  const gRow = new Float32Array(5), gN = new Float32Array(5);
  for (let g = 0; g < 5; g++) { const c = model.clips[GAIT_NAMES[g]]; gRow[g] = c ? c.row : 0; gN[g] = c ? c.n : 1; }
  return { gRow, gN };
}

/**
 * Write horse i of the herd into instance slot `slot` of a horse set (and, if given, of a rider set with
 * { mount: horseModelName }). y: ground height under it; pitch: nose up (rad). riderRow: the rider's clip row
 * (model.row('ride', phase)); twist: the rider's upper-body turn (rad).
 */
export function writeHorse(herd, i, horseSet, rows, slot, y = 0, pitch = 0, riderSet = null, riderRow = 0, twist = 0) {
  const S = herd.S, hb = horseSet.buf, o = slot * F.STRIDE;
  const yaw = S.myaw[i], rol = S.roll[i], hy = yaw * 0.5, hp = -pitch * 0.5, hr = -rol * 0.5;
  const c1 = Math.cos(hp), s1 = Math.sin(hp), c2 = Math.cos(hy), s2 = Math.sin(hy), c3 = Math.cos(hr), s3 = Math.sin(hr);
  const g = S.gait[i], ph = S.phase[i], { gRow, gN } = rows;
  let rowA = gRow[g] + (ph - Math.floor(ph)) * gN[g], rowB = rowA, wA = 1;
  if (S.blend[i] < 1) { const gp = S.gaitPrev[i], pp = S.phasePrev[i], b = S.blend[i]; rowB = gRow[gp] + (pp - Math.floor(pp)) * gN[gp]; wA = b * b * (3 - 2 * b); }
  hb[o] = S.mx[i]; hb[o + 1] = y; hb[o + 2] = S.mz[i]; hb[o + 3] = S.size[i];
  // the horse: yaw and pitch only (it leans in the shader, so its feet stay on the ground)
  hb[o + 4] = s1 * c2; hb[o + 5] = c1 * s2; hb[o + 6] = -s1 * s2; hb[o + 7] = c1 * c2;
  hb[o + 8] = rowA; hb[o + 9] = rowB; hb[o + 10] = wA; hb[o + 11] = rol;
  hb[o + 12] = S.b1[i]; hb[o + 13] = S.b2[i]; hb[o + 14] = S.b3[i]; hb[o + 15] = S.b4[i];
  if (riderSet) {
    // the rider: same place and the horse's own clip state (that is what glues him to the seat), his own clip, the lean in his quaternion
    const rb = riderSet.buf;
    rb[o] = hb[o]; rb[o + 1] = y; rb[o + 2] = hb[o + 2]; rb[o + 3] = hb[o + 3];
    rb[o + 4] = s1 * c2 * c3 + c1 * s2 * s3; rb[o + 5] = c1 * s2 * c3 - s1 * c2 * s3; rb[o + 6] = c1 * c2 * s3 - s1 * s2 * c3; rb[o + 7] = c1 * c2 * c3 + s1 * s2 * s3;
    rb[o + 8] = riderRow; rb[o + 9] = riderRow; rb[o + 10] = 1; rb[o + 11] = twist;
    rb[o + 12] = rowA; rb[o + 13] = rowB; rb[o + 14] = wA; rb[o + 15] = S.b1[i];
  }
}

/**
 * Canvas helpers for showing hands. Landmarks are in 0..1 space, so pass the canvas size and,
 * optionally, a mapping (e.g. `toScreen`) to place them.
 */

/** Bones of the 21-point hand (pairs of landmark indices). */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/**
 * Draws one hand skeleton onto a 2D canvas of size w x h (in canvas pixels).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}[]} landmarks
 * @param {number} w @param {number} h
 * @param {{color?: string, lineWidth?: number, jointRadius?: number, map?: (p:{x:number,y:number}) => {x:number,y:number}}} [o]
 */
export function drawHand(ctx, landmarks, w, h, o = {}) {
  if (landmarks.length < 21) return;
  const map = o.map ?? ((p) => p);
  const pts = landmarks.map((p) => { const q = map(p); return { x: q.x * w, y: q.y * h }; });
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = o.color ?? '#7cf';
  ctx.lineWidth = o.lineWidth ?? 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) { ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); }
  ctx.stroke();
  const r = o.jointRadius ?? 4;
  for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

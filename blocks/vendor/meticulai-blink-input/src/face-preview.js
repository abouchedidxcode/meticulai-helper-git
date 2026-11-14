// Drawing helpers for a small "is it seeing me?" preview (calibration screens, debug overlays).

/** @typedef {import('./eye-state.js').FaceFrame} FaceFrame */

// Eye contour landmarks (both eyes) + iris centres of the 478-point face mesh.
const EYE_POINTS = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const IRIS_POINTS = [468, 473];

/**
 * The mirrored webcam image (greyed a little) with the eye landmarks on top: green open, red closed.
 * @param {HTMLCanvasElement} canvas @param {HTMLVideoElement|null} video
 * @param {FaceFrame|null} frame @param {boolean} closed
 */
export function drawFacePreview(canvas, video, frame, closed) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width;
  const h = canvas.height;
  g.save();
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  g.translate(w, 0); // mirror, so it behaves like a mirror for the player
  g.scale(-1, 1);
  // fit the video inside the canvas without stretching it
  const vw = video?.videoWidth || 4;
  const vh = video?.videoHeight || 3;
  const k = Math.min(w / vw, h / vh);
  const dw = vw * k;
  const dh = vh * k;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  if (video && video.readyState >= 2) {
    g.filter = 'grayscale(0.6) contrast(1.1)';
    g.drawImage(video, ox, oy, dw, dh);
    g.filter = 'none';
  }
  if (frame?.faceDetected && frame.landmarks) {
    const lm = frame.landmarks;
    const r = Math.max(1, Math.round(dh / 240));
    g.fillStyle = closed ? '#ff3030' : '#7dff8a';
    for (const i of EYE_POINTS) {
      const p = lm[i];
      if (p) g.fillRect(ox + p.x * dw - r, oy + p.y * dh - r, 2 * r, 2 * r);
    }
    g.fillStyle = '#ffd34d';
    for (const i of IRIS_POINTS) {
      const p = lm[i];
      if (p) g.fillRect(ox + p.x * dw - 2 * r, oy + p.y * dh - 2 * r, 4 * r, 4 * r);
    }
  }
  g.restore();
}

/**
 * A drawn face that follows the tracked values (no video needed): lids close with the blink scores,
 * the head turns with yaw, the irises follow the gaze. Used by the demo's synthetic mode, handy as a
 * privacy-friendly "mirror" in a game too.
 * @param {HTMLCanvasElement} canvas
 * @param {{ faceDetected:boolean, blinkLeft:number, blinkRight:number, yawDeg:number, pitchDeg:number, gazeX:number }} s
 *   an EyeState snapshot (smoothed scores, mirrored gaze)
 * @param {{ closed?: boolean, away?: boolean }} [state]
 */
export function drawCartoonFace(canvas, s, { closed = false, away = false } = {}) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width;
  const h = canvas.height;
  g.save();
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1d2230');
  bg.addColorStop(1, '#0d0f16');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (!s.faceDetected) {
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.setLineDash([8, 8]);
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(w / 2, h / 2, h * 0.27, h * 0.34, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = `${Math.round(h * 0.06)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('no face', w / 2, h / 2 + h * 0.02);
    g.restore();
    return;
  }
  // Mirrored like a selfie: positive yaw (player's left) moves the face to the viewer's left.
  const turn = Math.max(-1, Math.min(1, -s.yawDeg / 60));
  const tilt = Math.max(-1, Math.min(1, s.pitchDeg / 45));
  const cx = w / 2 + turn * h * 0.12;
  const cy = h / 2 - tilt * h * 0.06;
  const rx = h * 0.27 * (1 - Math.abs(turn) * 0.25);
  const ry = h * 0.34;
  // shoulders and neck
  g.fillStyle = '#34405a';
  g.beginPath();
  g.ellipse(w / 2 + turn * h * 0.04, cy + ry * 1.55, rx * 2.1, ry * 0.75, 0, Math.PI, Math.PI * 2);
  g.fill();
  g.fillStyle = away ? '#6f6156' : '#c99c78';
  g.fillRect(cx - rx * 0.35, cy + ry * 0.6, rx * 0.7, ry * 0.4);
  // head
  g.fillStyle = away ? '#7e6f62' : '#d9b08c';
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  // hair: the top of the head, clipped to it, with a curved hairline
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, rx * 1.04, ry * 1.04, 0, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#2e2420';
  g.beginPath();
  g.ellipse(cx + turn * rx * 0.25, cy - ry * 0.95, rx * 1.3, ry * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // eyes: screen-left eye is the player's right eye in a mirror image, so it uses blinkRight
  const eyeY = cy - ry * 0.05;
  const off = rx * 0.42;
  const eyes = [
    { x: cx - off + turn * rx * 0.28, lid: s.blinkRight },
    { x: cx + off + turn * rx * 0.28, lid: s.blinkLeft },
  ];
  const ew = rx * 0.26;
  const eh = ry * 0.13;
  for (const e of eyes) {
    const open = 1 - Math.max(0, Math.min(1, (e.lid - 0.1) / 0.6));
    g.fillStyle = '#f6f1ea';
    g.beginPath();
    g.ellipse(e.x, eyeY, ew, Math.max(1.5, eh * open), 0, 0, Math.PI * 2);
    g.fill();
    if (open > 0.2) {
      g.save();
      g.beginPath();
      g.ellipse(e.x, eyeY, ew, eh * open, 0, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#3b6b8f';
      g.beginPath();
      g.arc(e.x + s.gazeX * ew * 0.75, eyeY, eh * 0.75, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0b0b0b';
      g.beginPath();
      g.arc(e.x + s.gazeX * ew * 0.75, eyeY, eh * 0.35, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.strokeStyle = closed ? '#e5484d' : '#2e2420';
    g.lineWidth = Math.max(2, h * 0.008);
    g.beginPath();
    g.ellipse(e.x, eyeY, ew, Math.max(1.5, eh * open), 0, Math.PI, Math.PI * 2);
    g.stroke();
    // brow
    g.strokeStyle = '#2e2420';
    g.lineWidth = Math.max(3, h * 0.012);
    g.beginPath();
    g.moveTo(e.x - ew * 0.9, eyeY - eh * 1.9);
    g.quadraticCurveTo(e.x, eyeY - eh * 2.5, e.x + ew * 0.9, eyeY - eh * 1.9);
    g.stroke();
  }
  // nose and mouth
  g.strokeStyle = 'rgba(80,50,35,0.7)';
  g.lineWidth = Math.max(2, h * 0.007);
  g.beginPath();
  g.moveTo(cx + turn * rx * 0.35, cy + ry * 0.05);
  g.lineTo(cx + turn * rx * 0.45, cy + ry * 0.25);
  g.stroke();
  g.beginPath();
  g.arc(cx + turn * rx * 0.3, cy + ry * 0.42, rx * 0.25, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.restore();
}

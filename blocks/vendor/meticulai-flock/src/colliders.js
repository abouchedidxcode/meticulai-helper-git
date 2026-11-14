// Signed-distance colliders for birds (from Murmur by Meticulai). Each sdf(x,y,z,out) returns false when the point is
// well outside the collider's influence (cheap bounding-sphere reject); otherwise writes
// out[0] = signed distance, out[1..3] = outward unit normal, and returns true.
const MARGIN = 3.5;

export class SphereCollider {
  constructor(x, y, z, r) { this.c = [x, y, z]; this.r = r; this.bound = r + MARGIN; }
  sdf(x, y, z, out) {
    const dx = x - this.c[0], dy = y - this.c[1], dz = z - this.c[2];
    const L = Math.hypot(dx, dy, dz);
    if (L > this.bound) return false;
    const il = 1 / (L + 1e-6);
    out[0] = L - this.r; out[1] = dx * il; out[2] = dy * il; out[3] = dz * il;
    return true;
  }
}

// Capsule between a and b with radius r (towers, poles, blades, trunks)
export class CapsuleCollider {
  constructor(a, b, r) { this.set(a, b, r); }
  set(a, b, r) {
    this.a = a; this.b = b; this.r = r;
    this.ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    this.abL2 = this.ab[0] ** 2 + this.ab[1] ** 2 + this.ab[2] ** 2 || 1e-6;
    this.mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.bound = Math.sqrt(this.abL2) / 2 + r + MARGIN;
  }
  sdf(x, y, z, out) {
    const m = this.mid;
    const qx = x - m[0], qy = y - m[1], qz = z - m[2];
    if (qx * qx + qy * qy + qz * qz > this.bound * this.bound) return false;
    const a = this.a, ab = this.ab;
    let t = ((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / this.abL2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (a[0] + ab[0] * t), dy = y - (a[1] + ab[1] * t), dz = z - (a[2] + ab[2] * t);
    const L = Math.hypot(dx, dy, dz), il = 1 / (L + 1e-6);
    out[0] = L - this.r; out[1] = dx * il; out[2] = dy * il; out[3] = dz * il;
    return true;
  }
}

// Oriented box: centre, half extents, yaw (radians about Y). Covers walls, roofs, bridge decks.
export class BoxCollider {
  constructor(cx, cy, cz, hx, hy, hz, yaw = 0) {
    this.c = [cx, cy, cz]; this.h = [hx, hy, hz];
    this.cos = Math.cos(yaw); this.sin = Math.sin(yaw);
    this.bound = Math.hypot(hx, hy, hz) + MARGIN;
  }
  sdf(x, y, z, out) {
    const dx0 = x - this.c[0], dy = y - this.c[1], dz0 = z - this.c[2];
    if (dx0 * dx0 + dy * dy + dz0 * dz0 > this.bound * this.bound) return false;
    // to local
    const c = this.cos, s = this.sin;
    const lx = c * dx0 - s * dz0, lz = s * dx0 + c * dz0, ly = dy;
    const [hx, hy, hz] = this.h;
    const qx = Math.abs(lx) - hx, qy = Math.abs(ly) - hy, qz = Math.abs(lz) - hz;
    let nx, ny, nz, d;
    if (qx > 0 || qy > 0 || qz > 0) {
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      d = Math.hypot(ox, oy, oz);
      const il = 1 / (d + 1e-6);
      nx = ox * il * Math.sign(lx); ny = oy * il * Math.sign(ly); nz = oz * il * Math.sign(lz);
    } else {
      // inside: nearest face
      d = Math.max(qx, qy, qz);
      nx = ny = nz = 0;
      if (d === qx) nx = Math.sign(lx); else if (d === qy) ny = Math.sign(ly); else nz = Math.sign(lz);
    }
    // back to world (inverse yaw)
    out[0] = d; out[1] = c * nx + s * nz; out[2] = ny; out[3] = -s * nx + c * nz;
    return true;
  }
}

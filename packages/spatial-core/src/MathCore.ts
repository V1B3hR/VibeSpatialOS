/**
 * VIBE SpatialOS - High Performance 3D Spatial Math Core
 * Rigorous metric 3D mathematics, OBB ray intersections,
 * Gaussian cone-casting, and algebraic solvers.
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Ray {
  origin: Vector3;
  direction: Vector3; // normalized
}

export interface OBBVolume {
  position: Vector3;
  rotation: Quaternion;
  halfExtents: Vector3;
  scale?: Vector3;
}

export class MathCore {
  public static readonly EPSILON = 1e-7;

  // ==========================================
  // VECTOR 3D OPERATIONS
  // ==========================================

  public static v3(x: number = 0, y: number = 0, z: number = 0): Vector3 {
    return { x, y, z };
  }

  public static v3Add(a: Vector3, b: Vector3): Vector3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  public static v3Sub(a: Vector3, b: Vector3): Vector3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  public static v3Scale(v: Vector3, s: number): Vector3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  }

  public static v3Dot(a: Vector3, b: Vector3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  public static v3Cross(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  public static v3LengthSq(v: Vector3): number {
    return v.x * v.x + v.y * v.y + v.z * v.z;
  }

  public static v3Length(v: Vector3): number {
    return Math.sqrt(this.v3LengthSq(v));
  }

  public static v3Distance(a: Vector3, b: Vector3): number {
    return this.v3Length(this.v3Sub(a, b));
  }

  public static v3Normalize(v: Vector3): Vector3 {
    const len = this.v3Length(v);
    if (len < this.EPSILON) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  public static v3Lerp(a: Vector3, b: Vector3, t: number): Vector3 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    };
  }

  // ==========================================
  // QUATERNION OPERATIONS
  // ==========================================

  public static quatIdentity(): Quaternion {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  public static quatFromAxisAngle(axis: Vector3, angleRad: number): Quaternion {
    const normAxis = this.v3Normalize(axis);
    const halfAngle = angleRad * 0.5;
    const s = Math.sin(halfAngle);
    return {
      x: normAxis.x * s,
      y: normAxis.y * s,
      z: normAxis.z * s,
      w: Math.cos(halfAngle)
    };
  }

  public static quatFromEuler(eulerX: number, eulerY: number, eulerZ: number): Quaternion {
    const c1 = Math.cos(eulerX * 0.5);
    const c2 = Math.cos(eulerY * 0.5);
    const c3 = Math.cos(eulerZ * 0.5);
    const s1 = Math.sin(eulerX * 0.5);
    const s2 = Math.sin(eulerY * 0.5);
    const s3 = Math.sin(eulerZ * 0.5);

    return {
      x: s1 * c2 * c3 + c1 * s2 * s3,
      y: c1 * s2 * c3 - s1 * c2 * s3,
      z: c1 * c2 * s3 + s1 * s2 * c3,
      w: c1 * c2 * c3 - s1 * s2 * s3
    };
  }

  public static quatMultiply(a: Quaternion, b: Quaternion): Quaternion {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
  }

  public static quatConjugate(q: Quaternion): Quaternion {
    return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
  }

  public static quatNormalize(q: Quaternion): Quaternion {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (len < this.EPSILON) return this.quatIdentity();
    return {
      x: q.x / len,
      y: q.y / len,
      z: q.z / len,
      w: q.w / len
    };
  }

  public static rotateVectorByQuat(v: Vector3, q: Quaternion): Vector3 {
    const ix = q.w * v.x + q.y * v.z - q.z * v.y;
    const iy = q.w * v.y + q.z * v.x - q.x * v.z;
    const iz = q.w * v.z + q.x * v.y - q.y * v.x;
    const iw = -q.x * v.x - q.y * v.y - q.z * v.z;

    return {
      x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
    };
  }

  public static quatSlerp(qa: Quaternion, qb: Quaternion, t: number): Quaternion {
    let cosHalfTheta = qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z;
    let b = { ...qb };

    if (cosHalfTheta < 0) {
      b = { x: -qb.x, y: -qb.y, z: -qb.z, w: -qb.w };
      cosHalfTheta = -cosHalfTheta;
    }

    if (cosHalfTheta >= 1.0) {
      return { ...qa };
    }

    const halfTheta = Math.acos(cosHalfTheta);
    const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

    if (Math.abs(sinHalfTheta) < 0.001) {
      return {
        x: qa.x * 0.5 + b.x * 0.5,
        y: qa.y * 0.5 + b.y * 0.5,
        z: qa.z * 0.5 + b.z * 0.5,
        w: qa.w * 0.5 + b.w * 0.5
      };
    }

    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

    return {
      x: qa.x * ratioA + b.x * ratioB,
      y: qa.y * ratioA + b.y * ratioB,
      z: qa.z * ratioA + b.z * ratioB,
      w: qa.w * ratioA + b.w * ratioB
    };
  }

  // ==========================================
  // MATRIX 4x4 OPERATIONS (Column-Major)
  // ==========================================

  public static mat4Identity(): Float32Array {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  public static mat4Compose(pos: Vector3, rot: Quaternion, scale: Vector3): Float32Array {
    const m = new Float32Array(16);
    const x = rot.x, y = rot.y, z = rot.z, w = rot.w;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;

    const sx = scale.x, sy = scale.y, sz = scale.z;

    m[0] = (1 - (yy + zz)) * sx;
    m[1] = (xy + wz) * sx;
    m[2] = (xz - wy) * sx;
    m[3] = 0;

    m[4] = (xy - wz) * sy;
    m[5] = (1 - (xx + zz)) * sy;
    m[6] = (yz + wx) * sy;
    m[7] = 0;

    m[8] = (xz + wy) * sz;
    m[9] = (yz - wx) * sz;
    m[10] = (1 - (xx + yy)) * sz;
    m[11] = 0;

    m[12] = pos.x;
    m[13] = pos.y;
    m[14] = pos.z;
    m[15] = 1;

    return m;
  }

  public static mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[row + k * 4] * b[k + col * 4];
        }
        out[row + col * 4] = sum;
      }
    }
    return out;
  }

  public static mat4TransformPoint(m: Float32Array, v: Vector3): Vector3 {
    const x = v.x, y = v.y, z = v.z;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1.0;
    return {
      x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      z: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    };
  }

  // ==========================================
  // OBB RAY INTERSECTION (Slab Method in Local Space)
  // ==========================================

  /**
   * Evaluates exact ray intersection with an Oriented Bounding Box (OBB).
   * Transforms ray into local OBB space via conjugate rotation.
   * Returns intersection distance t >= 0 or null if no hit.
   */
  public static intersectRayOBB(rayOrigin: Vector3, rayDir: Vector3, box: OBBVolume): number | null {
    const scale = box.scale || { x: 1, y: 1, z: 1 };
    const invQuat = this.quatConjugate(box.rotation);

    // 1. Transform ray to local coordinate frame
    const relOrigin = this.v3Sub(rayOrigin, box.position);
    const localOrigin = this.rotateVectorByQuat(relOrigin, invQuat);
    const localDir = this.rotateVectorByQuat(rayDir, invQuat);

    // 2. Local half-extents scaled
    const hx = box.halfExtents.x * scale.x;
    const hy = box.halfExtents.y * scale.y;
    const hz = box.halfExtents.z * scale.z;

    let tmin = -Infinity;
    let tmax = Infinity;

    const axes = [
      { min: -hx, max: hx, ro: localOrigin.x, rd: localDir.x },
      { min: -hy, max: hy, ro: localOrigin.y, rd: localDir.y },
      { min: -hz, max: hz, ro: localOrigin.z, rd: localDir.z }
    ];

    for (const axis of axes) {
      if (Math.abs(axis.rd) < this.EPSILON) {
        // Ray is parallel to slab. Check if origin is within slab
        if (axis.ro < axis.min || axis.ro > axis.max) {
          return null;
        }
      } else {
        let t1 = (axis.min - axis.ro) / axis.rd;
        let t2 = (axis.max - axis.ro) / axis.rd;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);

        if (tmin > tmax || tmax < 0) {
          return null;
        }
      }
    }

    // If starting inside box, hit distance is 0
    return tmin < 0 ? 0 : tmin;
  }

  // ==========================================
  // GAUSSIAN CONE-CASTING (Small Target & Jitter Resilience)
  // ==========================================

  /**
   * Computes a probability-weighted confidence score [0, 1] for an object inside a pointing cone.
   * Uses Gaussian angular falloff combined with distance attenuation.
   */
  public static evaluateConeConfidence(
    coneOrigin: Vector3,
    coneDirection: Vector3,
    targetPos: Vector3,
    maxAngleRad: number = 0.2618 // ~15 degrees
  ): number {
    const toTarget = this.v3Sub(targetPos, coneOrigin);
    const dist = this.v3Length(toTarget);
    if (dist < this.EPSILON) return 1.0;

    const normToTarget = this.v3Scale(toTarget, 1 / dist);
    const normDir = this.v3Normalize(coneDirection);
    const dot = Math.min(Math.max(this.v3Dot(normToTarget, normDir), -1), 1);
    const angle = Math.acos(dot);

    if (angle > maxAngleRad) return 0.0;

    // Gaussian bell curve over angular offset + inverse distance weighting
    const sigma = maxAngleRad * 0.5;
    const angularWeight = Math.exp(-Math.pow(angle / sigma, 2));
    const distanceFactor = 1.0 / (1.0 + dist * 0.5);

    return angularWeight * distanceFactor;
  }
}

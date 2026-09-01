/**
 * VIBE SpatialOS - 6-DoF Kabsch-Umeyama SVD Closed-Loop Calibrator
 * Minimizes optical and spatial disparity between observed 3D sensor point clouds
 * (from ToF / IR scanning) and expected geometric Digital Twin CAD models.
 */

import { MathCore, Vector3, Quaternion } from '@vibe/spatial-core';

export interface CalibrationResult {
  rotation: Float32Array; // 3x3 rotation matrix (row-major)
  quaternion: Quaternion;
  translation: Vector3;
  transformMatrix4x4: Float32Array; // 4x4 column-major matrix
  rmsErrorMm: number;
  residualDistancesMm: number[];
  converged: boolean;
}

export class KabschCalibrator {
  private dampingFactor: number;

  constructor(dampingFactor: number = 0.2) {
    this.dampingFactor = Math.max(0.01, Math.min(1.0, dampingFactor));
  }

  /**
   * Computes optimal 6-DoF rigid transformation (R, t) mapping expected points -> observed points
   */
  public solve(expectedPoints: Vector3[], observedPoints: Vector3[]): CalibrationResult {
    const n = expectedPoints.length;
    if (n < 3 || n !== observedPoints.length) {
      return {
        rotation: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
        quaternion: MathCore.quatIdentity(),
        translation: { x: 0, y: 0, z: 0 },
        transformMatrix4x4: MathCore.mat4Identity(),
        rmsErrorMm: -1,
        residualDistancesMm: [],
        converged: false
      };
    }

    // 1. Compute Centroids
    let muExp: Vector3 = { x: 0, y: 0, z: 0 };
    let muObs: Vector3 = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < n; i++) {
      muExp = MathCore.v3Add(muExp, expectedPoints[i]);
      muObs = MathCore.v3Add(muObs, observedPoints[i]);
    }
    muExp = MathCore.v3Scale(muExp, 1 / n);
    muObs = MathCore.v3Scale(muObs, 1 / n);

    // 2. Center the point sets
    const pExpCentered: Vector3[] = [];
    const pObsCentered: Vector3[] = [];

    for (let i = 0; i < n; i++) {
      pExpCentered.push(MathCore.v3Sub(expectedPoints[i], muExp));
      pObsCentered.push(MathCore.v3Sub(observedPoints[i], muObs));
    }

    // 3. Compute 3x3 Cross-Covariance Matrix H = sum(pExpCentered * pObsCentered^T)
    // H_ij = sum_k (pExpCentered[k][i] * pObsCentered[k][j])
    const H = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    for (let k = 0; k < n; k++) {
      const e = pExpCentered[k];
      const o = pObsCentered[k];
      H[0][0] += e.x * o.x;
      H[0][1] += e.x * o.y;
      H[0][2] += e.x * o.z;

      H[1][0] += e.y * o.x;
      H[1][1] += e.y * o.y;
      H[1][2] += e.y * o.z;

      H[2][0] += e.z * o.x;
      H[2][1] += e.z * o.y;
      H[2][2] += e.z * o.z;
    }

    // 4. SVD Decomposition of H: H = U * S * V^T
    const { U, V } = this.computeSVD3x3(H);

    // 5. Optimal Rotation R = V * [1, 0, 0; 0, 1, 0; 0, 0, det(V * U^T)] * U^T
    // Compute V * U^T
    const VUt = this.multiply3x3(V, this.transpose3x3(U));
    const det = this.det3x3(VUt);

    const D = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, det < 0 ? -1 : 1]
    ];

    const R = this.multiply3x3(this.multiply3x3(V, D), this.transpose3x3(U));

    // 6. Translation vector: t = muObs - R * muExp
    const RmuExp = this.applyMat3(R, muExp);
    const translation: Vector3 = {
      x: muObs.x - RmuExp.x,
      y: muObs.y - RmuExp.y,
      z: muObs.z - RmuExp.z
    };

    // 7. Compute Residual Error & RMS
    let sumSqErr = 0;
    const residualDistancesMm: number[] = [];

    for (let i = 0; i < n; i++) {
      const transformedExp = MathCore.v3Add(this.applyMat3(R, expectedPoints[i]), translation);
      const diff = MathCore.v3Sub(observedPoints[i], transformedExp);
      const distMm = MathCore.v3Length(diff) * 1000.0;
      residualDistancesMm.push(distMm);
      sumSqErr += distMm * distMm;
    }

    const rmsErrorMm = Math.sqrt(sumSqErr / n);

    // Convert R to Quaternion
    const quaternion = this.mat3ToQuaternion(R);

    // Damped 4x4 Transformation Matrix (Column-Major)
    const transformMatrix4x4 = new Float32Array([
      R[0][0], R[1][0], R[2][0], 0,
      R[0][1], R[1][1], R[2][1], 0,
      R[0][2], R[1][2], R[2][2], 0,
      translation.x * this.dampingFactor,
      translation.y * this.dampingFactor,
      translation.z * this.dampingFactor,
      1
    ]);

    const flatR = new Float32Array([
      R[0][0], R[0][1], R[0][2],
      R[1][0], R[1][1], R[1][2],
      R[2][0], R[2][1], R[2][2]
    ]);

    return {
      rotation: flatR,
      quaternion,
      translation,
      transformMatrix4x4,
      rmsErrorMm,
      residualDistancesMm,
      converged: rmsErrorMm < 5.0
    };
  }

  // =========================================================================
  // 3x3 MATRIX & SVD UTILITIES (Jacobi Rotation Method)
  // =========================================================================

  private transpose3x3(M: number[][]): number[][] {
    return [
      [M[0][0], M[1][0], M[2][0]],
      [M[0][1], M[1][1], M[2][1]],
      [M[0][2], M[1][2], M[2][2]]
    ];
  }

  private multiply3x3(A: number[][], B: number[][]): number[][] {
    const C = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        C[r][c] = A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c];
      }
    }
    return C;
  }

  private det3x3(M: number[][]): number {
    return (
      M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
      M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
      M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
    );
  }

  private applyMat3(M: number[][], v: Vector3): Vector3 {
    return {
      x: M[0][0] * v.x + M[0][1] * v.y + M[0][2] * v.z,
      y: M[1][0] * v.x + M[1][1] * v.y + M[1][2] * v.z,
      z: M[2][0] * v.x + M[2][1] * v.y + M[2][2] * v.z
    };
  }

  private computeSVD3x3(A: number[][]): { U: number[][]; S: number[]; V: number[][] } {
    // Compute A^T * A
    const At = this.transpose3x3(A);
    const AtA = this.multiply3x3(At, A);

    // Eigenvalue decomposition of symmetric 3x3 matrix AtA using Jacobi rotations -> V and S^2
    const { eigenvectors: V, eigenvalues: sSq } = this.eigenSymmetric3x3(AtA);

    const S = [
      Math.sqrt(Math.max(0, sSq[0])),
      Math.sqrt(Math.max(0, sSq[1])),
      Math.sqrt(Math.max(0, sSq[2]))
    ];

    // Compute U = A * V * inv(S)
    const AV = this.multiply3x3(A, V);
    const U = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    for (let col = 0; col < 3; col++) {
      const invS = S[col] > 1e-7 ? 1.0 / S[col] : 0.0;
      U[0][col] = AV[0][col] * invS;
      U[1][col] = AV[1][col] * invS;
      U[2][col] = AV[2][col] * invS;
    }

    // Ensure orthogonal U if singular
    if (S[2] < 1e-6) {
      const u0 = { x: U[0][0], y: U[1][0], z: U[2][0] };
      const u1 = { x: U[0][1], y: U[1][1], z: U[2][1] };
      const u2 = MathCore.v3Normalize(MathCore.v3Cross(u0, u1));
      U[0][2] = u2.x;
      U[1][2] = u2.y;
      U[2][2] = u2.z;
    }

    return { U, S, V };
  }

  private eigenSymmetric3x3(A: number[][]): { eigenvectors: number[][]; eigenvalues: number[] } {
    const V = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ];
    const D = [
      [A[0][0], A[0][1], A[0][2]],
      [A[1][0], A[1][1], A[1][2]],
      [A[2][0], A[2][1], A[2][2]]
    ];

    for (let iter = 0; iter < 50; iter++) {
      // Find largest off-diagonal element
      let maxOff = 0;
      let p = 0, q = 1;
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          if (Math.abs(D[i][j]) > maxOff) {
            maxOff = Math.abs(D[i][j]);
            p = i;
            q = j;
          }
        }
      }

      if (maxOff < 1e-12) break;

      const app = D[p][p];
      const aqq = D[q][q];
      const apq = D[p][q];

      const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
      const c = Math.cos(theta);
      const s = Math.sin(theta);

      // Givens rotation update on D
      for (let k = 0; k < 3; k++) {
        if (k !== p && k !== q) {
          const dkp = D[k][p];
          const dkq = D[k][q];
          D[k][p] = D[p][k] = c * dkp - s * dkq;
          D[k][q] = D[q][k] = s * dkp + c * dkq;
        }
      }
      D[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
      D[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
      D[p][q] = D[q][p] = 0;

      // Update eigenvectors V
      for (let k = 0; k < 3; k++) {
        const vkp = V[k][p];
        const vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq;
        V[k][q] = s * vkp + c * vkq;
      }
    }

    return {
      eigenvectors: V,
      eigenvalues: [D[0][0], D[1][1], D[2][2]]
    };
  }

  private mat3ToQuaternion(R: number[][]): Quaternion {
    const tr = R[0][0] + R[1][1] + R[2][2];
    let q: Quaternion;

    if (tr > 0) {
      const s = Math.sqrt(tr + 1.0) * 2; // s=4*qw
      q = {
        w: 0.25 * s,
        x: (R[2][1] - R[1][2]) / s,
        y: (R[0][2] - R[2][0]) / s,
        z: (R[1][0] - R[0][1]) / s
      };
    } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
      const s = Math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]) * 2;
      q = {
        w: (R[2][1] - R[1][2]) / s,
        x: 0.25 * s,
        y: (R[0][1] + R[1][0]) / s,
        z: (R[0][2] + R[2][0]) / s
      };
    } else if (R[1][1] > R[2][2]) {
      const s = Math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]) * 2;
      q = {
        w: (R[0][2] - R[2][0]) / s,
        x: (R[0][1] + R[1][0]) / s,
        y: 0.25 * s,
        z: (R[1][2] + R[2][1]) / s
      };
    } else {
      const s = Math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]) * 2;
      q = {
        w: (R[1][0] - R[0][1]) / s,
        x: (R[0][2] + R[2][0]) / s,
        y: (R[1][2] + R[2][1]) / s,
        z: 0.25 * s
      };
    }

    return MathCore.quatNormalize(q);
  }
}

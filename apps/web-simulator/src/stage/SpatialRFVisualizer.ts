/**
 * VIBE SpatialOS - Holographic 17-Keypoint RF Human Pose Visualizer
 * Renders neon cybernetic joint spheres, volumetric bone links,
 * and respiratory expansion waves directly in the Three.js Digital Twin.
 */

import * as THREE from 'three';
import { RFSkeleton17, RFKeypointName } from '@vibe/rf-sensing';

const BONE_CONNECTIONS: [RFKeypointName, RFKeypointName][] = [
  ['left_ear', 'left_eye'],
  ['left_eye', 'nose'],
  ['nose', 'right_eye'],
  ['right_eye', 'right_ear'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle']
];

export class SpatialRFVisualizer {
  public group: THREE.Group = new THREE.Group();
  private jointMeshes: Map<RFKeypointName, THREE.Mesh> = new Map();
  private boneLines: THREE.LineSegments;
  private auraMesh: THREE.Mesh;
  private isVisible: boolean = true;

  constructor() {
    const jointGeo = new THREE.SphereGeometry(0.024, 12, 12);
    const jointMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: false,
      transparent: true,
      opacity: 0.85
    });

    const keypointNames: RFKeypointName[] = [
      'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
      'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
      'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
    ];

    keypointNames.forEach(name => {
      const mesh = new THREE.Mesh(jointGeo, jointMat.clone());
      this.jointMeshes.set(name, mesh);
      this.group.add(mesh);
    });

    // Bone Line Segments
    const lineGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(BONE_CONNECTIONS.length * 2 * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.65,
      linewidth: 2
    });

    this.boneLines = new THREE.LineSegments(lineGeo, lineMat);
    this.group.add(this.boneLines);

    // RF Body Presence Aura (semi-transparent pulsing sphere)
    const auraGeo = new THREE.SphereGeometry(0.45, 16, 16);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.12,
      wireframe: true
    });
    this.auraMesh = new THREE.Mesh(auraGeo, auraMat);
    this.group.add(this.auraMesh);
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = visible;
  }

  public update(skeleton?: RFSkeleton17, timeSec: number = 0): void {
    if (!this.isVisible || !skeleton) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;

    // 1. Update Joint Mesh Positions
    for (const [name, kp] of Object.entries(skeleton.keypoints) as [RFKeypointName, any][]) {
      const mesh = this.jointMeshes.get(name);
      if (mesh) {
        mesh.position.set(kp.position.x, kp.position.y, kp.position.z);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0.2, kp.confidence * 0.9);
      }
    }

    // 2. Update Bone Lines
    const posAttr = this.boneLines.geometry.attributes.position as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;
    let idx = 0;

    BONE_CONNECTIONS.forEach(([k1, k2]) => {
      const p1 = skeleton.keypoints[k1]?.position;
      const p2 = skeleton.keypoints[k2]?.position;

      if (p1 && p2) {
        array[idx++] = p1.x;
        array[idx++] = p1.y;
        array[idx++] = p1.z;

        array[idx++] = p2.x;
        array[idx++] = p2.y;
        array[idx++] = p2.z;
      } else {
        idx += 6;
      }
    });

    posAttr.needsUpdate = true;

    // 3. Update Body Center Aura (Breathing expansion wave)
    this.auraMesh.position.set(
      skeleton.rootCenter.x,
      skeleton.rootCenter.y + 0.95,
      skeleton.rootCenter.z
    );
    const breatheScale = 1.0 + Math.sin(timeSec * 2 * Math.PI * 0.25) * 0.08;
    this.auraMesh.scale.set(breatheScale, breatheScale, breatheScale);
  }

  public dispose(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
          else obj.material.dispose();
        }
      });
    }
  }
}

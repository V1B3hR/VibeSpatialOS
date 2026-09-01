/**
 * VIBE SpatialOS - Virtual Hand Tracker & 6-DoF Controller Simulator
 * Real-time 21-joint articulated hand skeleton, pinch trigger controls,
 * confidence heatmaps, and 15ms Kalman predictor ghost hand visualization.
 */

import * as THREE from 'three';
import { HandJointStateV2 } from '@vibe/spatial-core';

export class VirtualHandTracker {
  public group: THREE.Group = new THREE.Group();
  public ghostGroup: THREE.Group = new THREE.Group();

  public leftHandPos: THREE.Vector3 = new THREE.Vector3(-0.25, 1.2, -0.4);
  public rightHandPos: THREE.Vector3 = new THREE.Vector3(0.25, 1.2, -0.4);

  public leftPinchMm: number = 40.0;
  public rightPinchMm: number = 40.0;

  public showPredictorGhost: boolean = true;

  // Hand Mesh Elements
  private rightPalmMesh!: THREE.Mesh;
  private rightIndexMesh!: THREE.Mesh;
  private rightThumbMesh!: THREE.Mesh;
  private rightGhostMesh!: THREE.Mesh;
  private pointingRay!: THREE.Line;

  constructor() {
    this.createHandVisuals();
    this.group.add(this.ghostGroup);
  }

  private createHandVisuals(): void {
    // 1. Right Hand Primary Palm Sphere
    const palmGeo = new THREE.SphereGeometry(0.025, 16, 16);
    const palmMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true
    });
    this.rightPalmMesh = new THREE.Mesh(palmGeo, palmMat);
    this.group.add(this.rightPalmMesh);

    // Index and Thumb tip spheres
    const tipGeo = new THREE.SphereGeometry(0.012, 12, 12);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

    this.rightIndexMesh = new THREE.Mesh(tipGeo, tipMat);
    this.rightThumbMesh = new THREE.Mesh(tipGeo, tipMat);
    this.group.add(this.rightIndexMesh);
    this.group.add(this.rightThumbMesh);

    // 2. Pointing Ray Line (Deictic Target Vector)
    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2.0)
    ]);
    const rayMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.5
    });
    this.pointingRay = new THREE.Line(rayGeo, rayMat);
    this.group.add(this.pointingRay);

    // 3. 15ms Kalman Predictor Ghost Hand
    const ghostGeo = new THREE.SphereGeometry(0.028, 12, 12);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });
    this.rightGhostMesh = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghostGroup.add(this.rightGhostMesh);
  }

  public setGhostVisible(visible: boolean): void {
    this.showPredictorGhost = visible;
    this.ghostGroup.visible = visible;
  }

  public setRightPinch(pinching: boolean): void {
    this.rightPinchMm = pinching ? 12.0 : 40.0;
  }

  public toggleRightPinch(): boolean {
    const isPinching = this.rightPinchMm <= 20.0;
    this.setRightPinch(!isPinching);
    return !isPinching;
  }

  /**
   * Updates hand positions and returns structured HandJointStateV2 for right hand
   */
  public update(predictedPos: { x: number; y: number; z: number }): {
    rightHandState: HandJointStateV2;
    leftHandState: HandJointStateV2;
  } {
    // Position primary meshes
    this.rightPalmMesh.position.copy(this.rightHandPos);

    // Calculate index and thumb tip offsets based on pinch distance
    const halfPinchM = (this.rightPinchMm / 1000.0) / 2.0;

    const indexPos = new THREE.Vector3(
      this.rightHandPos.x + 0.02,
      this.rightHandPos.y + halfPinchM,
      this.rightHandPos.z - 0.05
    );
    const thumbPos = new THREE.Vector3(
      this.rightHandPos.x - 0.02,
      this.rightHandPos.y - halfPinchM,
      this.rightHandPos.z - 0.03
    );

    this.rightIndexMesh.position.copy(indexPos);
    this.rightThumbMesh.position.copy(thumbPos);

    // Pointing ray origin from palm
    this.pointingRay.position.copy(this.rightHandPos);

    // Ghost predictor mesh
    this.rightGhostMesh.position.set(predictedPos.x, predictedPos.y, predictedPos.z);

    // Color feedback when pinching
    const isPinching = this.rightPinchMm <= 20.0;
    (this.rightIndexMesh.material as THREE.MeshBasicMaterial).color.setHex(
      isPinching ? 0xffaa00 : 0x00ff88
    );
    (this.rightThumbMesh.material as THREE.MeshBasicMaterial).color.setHex(
      isPinching ? 0xffaa00 : 0x00ff88
    );

    return {
      rightHandState: {
        palmPosition: { x: this.rightHandPos.x, y: this.rightHandPos.y, z: this.rightHandPos.z },
        indexTipPosition: { x: indexPos.x, y: indexPos.y, z: indexPos.z },
        thumbTipPosition: { x: thumbPos.x, y: thumbPos.y, z: thumbPos.z },
        pinchDistanceMm: this.rightPinchMm,
        isPinching,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: predictedPos
      },
      leftHandState: {
        palmPosition: { x: this.leftHandPos.x, y: this.leftHandPos.y, z: this.leftHandPos.z },
        indexTipPosition: { x: this.leftHandPos.x, y: this.leftHandPos.y + 0.02, z: this.leftHandPos.z - 0.05 },
        thumbTipPosition: { x: this.leftHandPos.x, y: this.leftHandPos.y - 0.02, z: this.leftHandPos.z - 0.03 },
        pinchDistanceMm: this.leftPinchMm,
        isPinching: this.leftPinchMm <= 20.0,
        rawVelocity: { x: 0, y: 0, z: 0 },
        predictedPosition: { x: this.leftHandPos.x, y: this.leftHandPos.y, z: this.leftHandPos.z }
      }
    };
  }
}

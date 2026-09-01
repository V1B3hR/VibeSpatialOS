/**
 * VIBE SpatialOS - Multi-Node Spatial Sensor Array Visualizer
 * 4 Corner ToF Sensor Nodes with dynamic frustums and real-time 8x8 point clouds.
 */

import * as THREE from 'three';
import { DecodedSpatialFrameV2 } from '@vibe/spatial-core';

export interface SensorNodeInstance {
  id: number;
  name: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  group: THREE.Group;
  frustumLines: THREE.LineSegments;
  pointCloud: THREE.Points;
  positionsBuffer: Float32Array;
  colorsBuffer: Float32Array;
}

export class SensorNodesManager {
  public group: THREE.Group = new THREE.Group();
  public nodes: Map<number, SensorNodeInstance> = new Map();

  constructor() {
    this.createSensorNodes();
  }

  private createSensorNodes(): void {
    const nodeConfigs = [
      { id: 1, name: 'NODE_NW', pos: new THREE.Vector3(-1.4, 2.3, -1.4), target: new THREE.Vector3(0, 0.8, 0) },
      { id: 2, name: 'NODE_NE', pos: new THREE.Vector3(1.4, 2.3, -1.4), target: new THREE.Vector3(0, 0.8, 0) },
      { id: 3, name: 'NODE_SW', pos: new THREE.Vector3(-1.4, 2.3, 1.4), target: new THREE.Vector3(0, 0.8, 0) },
      { id: 4, name: 'NODE_SE', pos: new THREE.Vector3(1.4, 2.3, 1.4), target: new THREE.Vector3(0, 0.8, 0) }
    ];

    nodeConfigs.forEach(cfg => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.copy(cfg.pos);
      nodeGroup.lookAt(cfg.target);

      // Sensor Body (RP2040 + ToF Optical Module)
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.05, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x1a2234, metalness: 0.8, roughness: 0.2 })
      );
      nodeGroup.add(housing);

      // Optical ToF Lens (Dual Aperture)
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16),
        new THREE.MeshBasicMaterial({ color: 0x00f0ff })
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.025;
      nodeGroup.add(lens);

      // Status LED
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.005, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ff88 })
      );
      led.position.set(0.025, 0.015, 0.022);
      nodeGroup.add(led);

      // Sensor Frustum Pyramid (45° Field of View)
      const fovRad = (45 * Math.PI) / 180;
      const fDist = 1.8;
      const halfW = Math.tan(fovRad / 2) * fDist;

      const frustumGeo = new THREE.BufferGeometry();
      const frustumVertices = new Float32Array([
        0, 0, 0,  -halfW, -halfW, fDist,
        0, 0, 0,   halfW, -halfW, fDist,
        0, 0, 0,   halfW,  halfW, fDist,
        0, 0, 0,  -halfW,  halfW, fDist,
        -halfW, -halfW, fDist,  halfW, -halfW, fDist,
         halfW, -halfW, fDist,  halfW,  halfW, fDist,
         halfW,  halfW, fDist, -halfW,  halfW, fDist,
        -halfW,  halfW, fDist, -halfW, -halfW, fDist
      ]);
      frustumGeo.setAttribute('position', new THREE.BufferAttribute(frustumVertices, 3));
      const frustumMat = new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.15
      });
      const frustumLines = new THREE.LineSegments(frustumGeo, frustumMat);
      nodeGroup.add(frustumLines);

      // Point Cloud buffer for 64 points (8x8 ToF matrix)
      const pointCount = 64;
      const positionsBuffer = new Float32Array(pointCount * 3);
      const colorsBuffer = new Float32Array(pointCount * 3);

      const pcGeo = new THREE.BufferGeometry();
      pcGeo.setAttribute('position', new THREE.BufferAttribute(positionsBuffer, 3));
      pcGeo.setAttribute('color', new THREE.BufferAttribute(colorsBuffer, 3));

      const pcMat = new THREE.PointsMaterial({
        size: 0.02,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      });

      const pointCloud = new THREE.Points(pcGeo, pcMat);
      nodeGroup.add(pointCloud);

      this.group.add(nodeGroup);

      this.nodes.set(cfg.id, {
        id: cfg.id,
        name: cfg.name,
        position: cfg.pos,
        target: cfg.target,
        group: nodeGroup,
        frustumLines,
        pointCloud,
        positionsBuffer,
        colorsBuffer
      });
    });
  }

  /**
   * Ingests high-speed 60Hz ToF frame and projects 8x8 point cloud in node local space
   */
  public updateNodeFrame(frame: DecodedSpatialFrameV2): void {
    const node = this.nodes.get(frame.nodeId);
    if (!node) return;

    const fovRad = (45 * Math.PI) / 180;
    const halfAngle = fovRad / 2;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const idx = r * 8 + c;
        const depthM = (frame.depthMatrixMm[idx] || 500) / 1000.0;
        const conf = (frame.confidence[idx] || 255) / 255.0;

        // Angle offsets in frustum
        const u = (c - 3.5) / 3.5;
        const v = (r - 3.5) / 3.5;

        const x = Math.tan(u * halfAngle) * depthM;
        const y = Math.tan(v * halfAngle) * depthM;
        const z = depthM;

        node.positionsBuffer[idx * 3 + 0] = x;
        node.positionsBuffer[idx * 3 + 1] = y;
        node.positionsBuffer[idx * 3 + 2] = z;

        // Color based on confidence and depth
        node.colorsBuffer[idx * 3 + 0] = 0.0 + (1.0 - conf) * 0.8;
        node.colorsBuffer[idx * 3 + 1] = 0.8 * conf;
        node.colorsBuffer[idx * 3 + 2] = 1.0;
      }
    }

    node.pointCloud.geometry.attributes.position.needsUpdate = true;
    node.pointCloud.geometry.attributes.color.needsUpdate = true;
  }

  public update(time: number): void {
    // Subtle scanning laser pulse on frustums
    const pulseAlpha = 0.12 + 0.08 * Math.sin(time * 6.0);
    this.nodes.forEach(n => {
      (n.frustumLines.material as THREE.LineBasicMaterial).opacity = pulseAlpha;
    });
  }
}

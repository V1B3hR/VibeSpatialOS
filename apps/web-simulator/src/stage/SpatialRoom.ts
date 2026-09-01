/**
 * VIBE SpatialOS - 3x3x2.5m Spatial Metric Room & Stage
 * Transparent spatial volume bounds, high-precision metric floor grid,
 * active optical fiducials for Kabsch auto-calibration, and lighting.
 */

import * as THREE from 'three';

export interface FiducialMarker {
  id: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
}

export class SpatialRoom {
  public group: THREE.Group = new THREE.Group();
  public readonly roomWidth = 3.0;  // 3.0 meters (X)
  public readonly roomLength = 3.0; // 3.0 meters (Z)
  public readonly roomHeight = 2.5; // 2.5 meters (Y)
  public fiducials: FiducialMarker[] = [];

  constructor() {
    this.createRoomBounds();
    this.createMetricGrid();
    this.createActiveFiducials();
    this.createCoordinateAxes();
  }

  private createRoomBounds(): void {
    // Transparent Room Bounding Box
    const boxGeo = new THREE.BoxGeometry(this.roomWidth, this.roomHeight, this.roomLength);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35
    });
    const boundingWire = new THREE.LineSegments(boxEdges, lineMat);
    boundingWire.position.set(0, this.roomHeight / 2, 0);
    this.group.add(boundingWire);

    // Subtle volumetric corner accents
    const cornerMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8
    });

    const corners = [
      [-1.5, 0, -1.5], [1.5, 0, -1.5], [-1.5, 0, 1.5], [1.5, 0, 1.5],
      [-1.5, 2.5, -1.5], [1.5, 2.5, -1.5], [-1.5, 2.5, 1.5], [1.5, 2.5, 1.5]
    ];

    corners.forEach(([x, y, z]) => {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), cornerMat);
      marker.position.set(x, y, z);
      this.group.add(marker);
    });
  }

  private createMetricGrid(): void {
    // Floor Grid (3m x 3m, 0.2m major grid lines)
    const gridHelper = new THREE.GridHelper(3.0, 15, 0x00f0ff, 0x112233);
    gridHelper.position.set(0, 0.001, 0);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.4;
    this.group.add(gridHelper);

    // Floor holographic disc in center
    const discGeo = new THREE.RingGeometry(0.2, 0.22, 64);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    this.group.add(disc);
  }

  private createActiveFiducials(): void {
    // 4 Active Retroreflector Fiducials for Optical Calibration
    const fiducialCoords = [
      { id: 'FID_NW', pos: new THREE.Vector3(-1.2, 0.05, -1.2) },
      { id: 'FID_NE', pos: new THREE.Vector3(1.2, 0.05, -1.2) },
      { id: 'FID_SW', pos: new THREE.Vector3(-1.2, 0.05, 1.2) },
      { id: 'FID_SE', pos: new THREE.Vector3(1.2, 0.05, 1.2) }
    ];

    fiducialCoords.forEach(f => {
      const group = new THREE.Group();
      group.position.copy(f.pos);

      // Base ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.03, 0.05, 32),
        new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      );
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);

      // Glowing center retroreflector core
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffdd44 })
      );
      group.add(core);

      this.group.add(group);
      this.fiducials.push({ id: f.id, position: f.pos.clone(), mesh: core });
    });
  }

  private createCoordinateAxes(): void {
    const axes = new THREE.AxesHelper(0.3);
    axes.position.set(0, 0.01, 0);
    this.group.add(axes);
  }

  public update(time: number): void {
    // Subtle breathing glow on active fiducials
    const pulse = 1.0 + 0.3 * Math.sin(time * 4.0);
    this.fiducials.forEach(f => {
      f.mesh.scale.set(pulse, pulse, pulse);
    });
  }
}

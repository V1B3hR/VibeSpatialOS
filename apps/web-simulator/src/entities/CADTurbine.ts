/**
 * VIBE SpatialOS - CAD Jet Turbine Engine Entity
 * Interactive mechanical assembly with exploded disassembly (Semantic LOD),
 * multi-stage titanium rotor blades, central shaft, and holographic inspection.
 */

import * as THREE from 'three';
import { createHologramMaterial } from '../shaders/HologramShader.js';

export class CADTurbineEntity {
  public group: THREE.Group = new THREE.Group();
  public casingGroup: THREE.Group = new THREE.Group();
  public rotorGroup: THREE.Group = new THREE.Group();
  public shaftGroup: THREE.Group = new THREE.Group();
  public statorGroup: THREE.Group = new THREE.Group();

  private explosionProgress: number = 0.0;
  private targetExplosion: number = 0.0;
  private rotationSpeed: number = 2.0;

  constructor() {
    this.group.name = 'CAD_TURBINE_ASSEMBLY';
    this.buildTurbineModel();
  }

  private buildTurbineModel(): void {
    const holoMat = createHologramMaterial({
      glowColor: 0x00f0ff,
      baseColor: 0x001a33,
      opacity: 0.85
    });

    const rotorMat = createHologramMaterial({
      glowColor: 0x00ffaa,
      baseColor: 0x002222,
      opacity: 0.9
    });

    const shaftMat = createHologramMaterial({
      glowColor: 0xffaa00,
      baseColor: 0x221100,
      opacity: 0.95
    });

    // 1. Central Drive Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 32);
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.rotation.x = Math.PI / 2;
    this.shaftGroup.add(shaftMesh);

    // Shaft nose cone
    const noseGeo = new THREE.ConeGeometry(0.04, 0.1, 32);
    const noseMesh = new THREE.Mesh(noseGeo, shaftMat);
    noseMesh.rotation.x = -Math.PI / 2;
    noseMesh.position.z = 0.3;
    this.shaftGroup.add(noseMesh);

    // 2. Multi-Stage Rotor Blades
    const stageZ = [0.15, 0.0, -0.15];
    const bladeCounts = [16, 20, 24];
    const bladeRadii = [0.18, 0.15, 0.12];

    stageZ.forEach((z, stageIdx) => {
      const stageHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.02, 32),
        rotorMat
      );
      stageHub.rotation.x = Math.PI / 2;
      stageHub.position.z = z;
      this.rotorGroup.add(stageHub);

      const count = bladeCounts[stageIdx];
      const r = bladeRadii[stageIdx];

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const bladeGeo = new THREE.BoxGeometry(0.012, r - 0.04, 0.004);
        const bladeMesh = new THREE.Mesh(bladeGeo, rotorMat);

        bladeMesh.position.set(
          Math.cos(angle) * (r / 2 + 0.02),
          Math.sin(angle) * (r / 2 + 0.02),
          z
        );
        bladeMesh.rotation.z = angle + 0.4; // Aerodynamic pitch angle
        bladeMesh.rotation.x = 0.3;
        this.rotorGroup.add(bladeMesh);
      }
    });

    // 3. Stator Vanes (Stationary Guide Vanes)
    const statorZ = [0.075, -0.075];
    statorZ.forEach(z => {
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const vane = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.14, 0.003),
          holoMat
        );
        vane.position.set(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, z);
        vane.rotation.z = angle - 0.3;
        this.statorGroup.add(vane);
      }
    });

    // 4. Outer Casing Cowl (Upper and Lower Halves for Exploded Inspection)
    const cowlGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.55, 32, 1, true);
    const cowlMesh = new THREE.Mesh(cowlGeo, holoMat);
    cowlMesh.rotation.x = Math.PI / 2;
    this.casingGroup.add(cowlMesh);

    // Assemble Hierarchy
    this.group.add(this.shaftGroup);
    this.group.add(this.rotorGroup);
    this.group.add(this.statorGroup);
    this.group.add(this.casingGroup);

    // Initial scale and position
    this.group.scale.set(1, 1, 1);
  }

  public setExplosion(target: number): void {
    this.targetExplosion = Math.max(0.0, Math.min(1.0, target));
  }

  public toggleExplosion(): boolean {
    this.targetExplosion = this.targetExplosion > 0.5 ? 0.0 : 1.0;
    return this.targetExplosion > 0.5;
  }

  public update(deltaSec: number, timeSec: number): void {
    // 1. Rotate rotor blades and shaft
    this.rotorGroup.rotation.z += this.rotationSpeed * deltaSec;
    this.shaftGroup.rotation.z += this.rotationSpeed * deltaSec;

    // 2. Smooth Exploded Assembly Animation
    this.explosionProgress += (this.targetExplosion - this.explosionProgress) * 0.1;

    // Explode components along primary axes
    this.casingGroup.position.y = this.explosionProgress * 0.25;
    this.statorGroup.position.x = -this.explosionProgress * 0.2;
    this.shaftGroup.position.z = this.explosionProgress * 0.15;
    this.rotorGroup.position.z = -this.explosionProgress * 0.15;

    // Update material uniforms
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        if (child.material.uniforms?.time) {
          child.material.uniforms.time.value = timeSec;
        }
      }
    });
  }
}

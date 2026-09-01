/**
 * VIBE SpatialOS - Molecular Digital Twin Entity (Caffeine / Bio-Complex)
 * Interactive 3D Ball-and-Stick molecule with CPK colors, covalent bonds,
 * full progressive atomic disassembly, functional group isolation,
 * pulsing hydrogen bond lines, and quantum electron orbital shells.
 */

import * as THREE from 'three';
import { createHologramMaterial } from '../shaders/HologramShader.js';

interface AtomData {
  element: 'C' | 'N' | 'O' | 'H';
  pos: [number, number, number];
  color: number;
  radius: number;
  group: 'RING_CORE' | 'CARBONYL' | 'METHYL' | 'HYDROGEN';
}

export class MoleculeModelEntity {
  public group: THREE.Group = new THREE.Group();
  public atomsGroup: THREE.Group = new THREE.Group();
  public bondsGroup: THREE.Group = new THREE.Group();
  public hydrogenBondsGroup: THREE.Group = new THREE.Group();
  public orbitalShellsGroup: THREE.Group = new THREE.Group();

  public showHydrogenBonds: boolean = true;
  public showOrbitals: boolean = false;

  private atomMeshes: THREE.Mesh[] = [];
  private initialAtomPositions: THREE.Vector3[] = [];
  private atomDataList: AtomData[] = [];
  private bondMeshes: THREE.Mesh[] = [];
  private covalentBondPairs: [number, number][] = [];

  private targetDisassembly: number = 0.0;
  private disassemblyProgress: number = 0.0;

  constructor() {
    this.group.name = 'MOLECULE_CAFFEINE_COMPLEX';
    this.buildMolecule();
  }

  private buildMolecule(): void {
    // 3D Atomic Coordinates for Caffeine (C8 H10 N4 O2) centered in metric units
    this.atomDataList = [
      // 6-membered ring Carbons & Nitrogens
      { element: 'N', pos: [0.0, 0.12, 0.0], color: 0x3388ff, radius: 0.035, group: 'RING_CORE' },
      { element: 'C', pos: [0.11, 0.05, 0.0], color: 0x00ffff, radius: 0.038, group: 'RING_CORE' },
      { element: 'N', pos: [0.11, -0.09, 0.0], color: 0x3388ff, radius: 0.035, group: 'RING_CORE' },
      { element: 'C', pos: [0.0, -0.15, 0.0], color: 0x00ffff, radius: 0.038, group: 'RING_CORE' },
      { element: 'C', pos: [-0.11, -0.08, 0.0], color: 0x00ffff, radius: 0.038, group: 'RING_CORE' },
      { element: 'C', pos: [-0.11, 0.06, 0.0], color: 0x00ffff, radius: 0.038, group: 'RING_CORE' },

      // 5-membered ring (Imidazole)
      { element: 'N', pos: [-0.23, 0.11, 0.0], color: 0x3388ff, radius: 0.035, group: 'RING_CORE' },
      { element: 'C', pos: [-0.30, 0.0, 0.0], color: 0x00ffff, radius: 0.038, group: 'RING_CORE' },
      { element: 'N', pos: [-0.23, -0.11, 0.0], color: 0x3388ff, radius: 0.035, group: 'RING_CORE' },

      // Carbonyl Oxygens (=O)
      { element: 'O', pos: [0.22, 0.10, 0.0], color: 0xff3366, radius: 0.035, group: 'CARBONYL' },
      { element: 'O', pos: [0.0, -0.26, 0.0], color: 0xff3366, radius: 0.035, group: 'CARBONYL' },

      // Methyl groups (-CH3)
      { element: 'C', pos: [0.0, 0.26, 0.0], color: 0x00ffff, radius: 0.038, group: 'METHYL' },
      { element: 'C', pos: [0.23, -0.16, 0.0], color: 0x00ffff, radius: 0.038, group: 'METHYL' },
      { element: 'C', pos: [-0.27, 0.25, 0.0], color: 0x00ffff, radius: 0.038, group: 'METHYL' },

      // Hydrogens (Sample representative)
      { element: 'H', pos: [-0.40, 0.0, 0.0], color: 0xffffff, radius: 0.022, group: 'HYDROGEN' },
      { element: 'H', pos: [0.0, 0.32, 0.08], color: 0xffffff, radius: 0.022, group: 'HYDROGEN' },
      { element: 'H', pos: [0.0, 0.32, -0.08], color: 0xffffff, radius: 0.022, group: 'HYDROGEN' },
      { element: 'H', pos: [0.31, -0.11, 0.06], color: 0xffffff, radius: 0.022, group: 'HYDROGEN' },
      { element: 'H', pos: [0.24, -0.26, -0.06], color: 0xffffff, radius: 0.022, group: 'HYDROGEN' }
    ];

    // Atom Meshes
    this.atomDataList.forEach(atom => {
      const atomMat = createHologramMaterial({
        glowColor: atom.color,
        baseColor: 0x050d1a,
        opacity: 0.95
      });
      const atomMesh = new THREE.Mesh(
        new THREE.SphereGeometry(atom.radius, 24, 24),
        atomMat
      );
      const initPos = new THREE.Vector3(...atom.pos);
      atomMesh.position.copy(initPos);
      this.atomsGroup.add(atomMesh);
      this.atomMeshes.push(atomMesh);
      this.initialAtomPositions.push(initPos.clone());
    });

    // Covalent Bond Connections (Index pairs)
    this.covalentBondPairs = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], // 6-ring
      [5, 6], [6, 7], [7, 8], [8, 4],                 // 5-ring
      [1, 9], [3, 10],                                 // Carbonyls
      [0, 11], [2, 12], [6, 13],                       // Methyl Carbons
      [7, 14], [11, 15], [11, 16], [12, 17], [12, 18]  // Hydrogens
    ];

    const bondMat = createHologramMaterial({
      glowColor: 0x00f0ff,
      baseColor: 0x001122,
      opacity: 0.75
    });

    this.covalentBondPairs.forEach(([i, j]) => {
      const pA = this.initialAtomPositions[i];
      const pB = this.initialAtomPositions[j];
      const dist = pA.distanceTo(pB);

      const bondMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, dist, 12),
        bondMat.clone()
      );
      bondMesh.position.copy(pA).add(pB).multiplyScalar(0.5);
      bondMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        pB.clone().sub(pA).normalize()
      );
      this.bondsGroup.add(bondMesh);
      this.bondMeshes.push(bondMesh);
    });

    // Hydrogen Bonds (Pulsing dashed bridges)
    const hBondPairs = [
      [9, 15], // Oxygen to Methyl Hydrogen
      [10, 17] // Oxygen to Methyl Hydrogen
    ];

    const hBondMat = new THREE.LineDashedMaterial({
      color: 0xff33aa,
      dashSize: 0.015,
      gapSize: 0.01,
      transparent: true,
      opacity: 0.8
    });

    hBondPairs.forEach(([i, j]) => {
      const pA = this.initialAtomPositions[i];
      const pB = this.initialAtomPositions[j];

      const hGeo = new THREE.BufferGeometry().setFromPoints([pA, pB]);
      const hLine = new THREE.Line(hGeo, hBondMat);
      hLine.computeLineDistances();
      this.hydrogenBondsGroup.add(hLine);
    });

    // Quantum Orbital Clouds (Volumetric spheres around electronegative Oxygens & Nitrogens)
    [9, 10, 0, 2].forEach(idx => {
      const p = this.atomDataList[idx].pos;
      const orbitalMat = createHologramMaterial({
        glowColor: 0xa855f7,
        baseColor: 0x1a0033,
        opacity: 0.35,
        fresnelPower: 1.5
      });
      const orbitalMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 20, 20),
        orbitalMat
      );
      orbitalMesh.position.set(...p);
      this.orbitalShellsGroup.add(orbitalMesh);
    });

    this.group.add(this.atomsGroup);
    this.group.add(this.bondsGroup);
    this.group.add(this.hydrogenBondsGroup);
    this.group.add(this.orbitalShellsGroup);

    this.orbitalShellsGroup.visible = this.showOrbitals;
    this.hydrogenBondsGroup.visible = this.showHydrogenBonds;
  }

  public setHydrogenBondsVisible(visible: boolean): void {
    this.showHydrogenBonds = visible;
    this.hydrogenBondsGroup.visible = visible;
  }

  public setOrbitalsVisible(visible: boolean): void {
    this.showOrbitals = visible;
    this.orbitalShellsGroup.visible = visible;
  }

  public setDisassembly(progress: number): void {
    this.targetDisassembly = Math.max(0.0, Math.min(1.0, progress));
  }

  public isolateFunctionalGroup(group: 'ALL' | 'METHYL' | 'RING_CORE' | 'CARBONYL'): void {
    this.atomMeshes.forEach((mesh, idx) => {
      const data = this.atomDataList[idx];
      const isVisible = group === 'ALL' || data.group === group || (group === 'RING_CORE' && (data.group === 'RING_CORE' || data.group === 'HYDROGEN'));
      mesh.visible = isVisible;
    });
    this.bondMeshes.forEach((mesh, idx) => {
      const [i, j] = this.covalentBondPairs[idx];
      const meshA = this.atomMeshes[i];
      const meshB = this.atomMeshes[j];
      mesh.visible = meshA.visible && meshB.visible;
    });
  }

  public update(deltaSec: number, timeSec: number): void {
    // 1. Gentle floating rotation
    this.group.rotation.y += 0.4 * deltaSec;
    this.group.rotation.x = Math.sin(timeSec * 0.5) * 0.1;

    // 2. Smooth Atomic Disassembly Interpolation
    this.disassemblyProgress += (this.targetDisassembly - this.disassemblyProgress) * 0.1;

    if (this.disassemblyProgress > 0.001 || this.targetDisassembly > 0.001) {
      const factor = 1.0 + this.disassemblyProgress * 0.85;

      // Move atoms radially outward from center
      this.atomMeshes.forEach((mesh, idx) => {
        const initPos = this.initialAtomPositions[idx];
        mesh.position.set(initPos.x * factor, initPos.y * factor, initPos.z * factor);
      });

      // Update covalent bonds
      this.bondMeshes.forEach((bondMesh, idx) => {
        const [i, j] = this.covalentBondPairs[idx];
        const pA = this.atomMeshes[i].position;
        const pB = this.atomMeshes[j].position;
        const dist = pA.distanceTo(pB);

        bondMesh.position.copy(pA).add(pB).multiplyScalar(0.5);
        bondMesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          pB.clone().sub(pA).normalize()
        );
        bondMesh.scale.set(1.0, dist / (this.initialAtomPositions[i].distanceTo(this.initialAtomPositions[j])), 1.0);
      });
    }

    // 3. Pulse hydrogen bonds & orbital cloud breathing
    const hPulse = 0.6 + 0.4 * Math.sin(timeSec * 6.0);
    this.hydrogenBondsGroup.children.forEach(c => {
      if (c instanceof THREE.Line && c.material instanceof THREE.LineDashedMaterial) {
        c.material.opacity = hPulse;
      }
    });

    const orbScale = 1.0 + 0.08 * Math.sin(timeSec * 3.0);
    this.orbitalShellsGroup.children.forEach(c => {
      c.scale.set(orbScale, orbScale, orbScale);
    });

    // Update hologram shaders
    this.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        if (child.material.uniforms?.time) {
          child.material.uniforms.time.value = timeSec;
        }
      }
    });
  }
}

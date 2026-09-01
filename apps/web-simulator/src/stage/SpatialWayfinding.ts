/**
 * VIBE SpatialOS - Holographic 3D Wayfinding & Spatial Node Signposts
 * Renders floating billboard signposts, semi-transparent directional vector links,
 * flowing energy pulse particles, and macro-to-micro LOD cluster cages.
 */

import * as THREE from 'three';
import { SpatialNodeGraph, SpatialNodeV2, SpatialNodeLink } from '@vibe/spatial-core';

interface VisualNodeItem {
  node: SpatialNodeV2;
  group: THREE.Group;
  signpostSprite: THREE.Sprite;
  boundingCage: THREE.LineSegments;
}

interface VisualLinkItem {
  link: SpatialNodeLink;
  curve: THREE.CatmullRomCurve3;
  line: THREE.Line;
  arrowMeshes: THREE.Mesh[];
  pulseMesh: THREE.Mesh;
}

export class SpatialWayfinding {
  public group: THREE.Group = new THREE.Group();
  private visualNodes: Map<string, VisualNodeItem> = new Map();
  private visualLinks: VisualLinkItem[] = [];

  constructor(private nodeGraph: SpatialNodeGraph) {
    this.rebuildVisuals();
  }

  public rebuildVisuals(): void {
    // Clean and dispose previous WebGL GPU resources (geometries, materials, textures)
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m: any) => {
              if (m.map) m.map.dispose();
              m.dispose();
            });
          } else {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
        }
      });
    }
    this.visualNodes.clear();
    this.visualLinks = [];

    // 1. Build Visual Nodes & Holographic Signposts
    const allNodes = this.nodeGraph.getAllNodes();
    allNodes.forEach(node => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(node.position.x, node.position.y, node.position.z);

      // Signpost Billboard Sprite above node
      const sprite = this.createSignpostSprite(node);
      sprite.position.set(0, node.halfExtents.y + 0.22, 0);
      nodeGroup.add(sprite);

      // Macro Cluster Bounding Cage (Wireframe Box)
      const cageGeo = new THREE.BoxGeometry(
        node.halfExtents.x * 2.2,
        node.halfExtents.y * 2.2,
        node.halfExtents.z * 2.2
      );
      const cageEdges = new THREE.EdgesGeometry(cageGeo);
      const cageMat = new THREE.LineBasicMaterial({
        color: node.colorHex,
        transparent: true,
        opacity: 0.35
      });
      const boundingCage = new THREE.LineSegments(cageEdges, cageMat);
      nodeGroup.add(boundingCage);

      this.group.add(nodeGroup);
      this.visualNodes.set(node.id, {
        node,
        group: nodeGroup,
        signpostSprite: sprite,
        boundingCage
      });
    });

    // 2. Build Directional Tensor Links & Holographic Arrows
    const allLinks = this.nodeGraph.getLinks();
    allLinks.forEach(link => {
      const srcNode = this.nodeGraph.getNode(link.sourceNodeId);
      const dstNode = this.nodeGraph.getNode(link.targetNodeId);
      if (!srcNode || !dstNode) return;

      const pA = new THREE.Vector3(srcNode.position.x, srcNode.position.y, srcNode.position.z);
      const pB = new THREE.Vector3(dstNode.position.x, dstNode.position.y, dstNode.position.z);

      // Create slightly elevated arched curve
      const mid = pA.clone().add(pB).multiplyScalar(0.5);
      mid.y += 0.15; // Holographic arch

      const curve = new THREE.CatmullRomCurve3([pA, mid, pB]);
      const points = curve.getPoints(32);

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineDashedMaterial({
        color: link.colorHex,
        dashSize: 0.04,
        gapSize: 0.02,
        transparent: true,
        opacity: 0.6
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      this.group.add(line);

      // Directional Arrow Cones (3 spaced along curve)
      const arrowMeshes: THREE.Mesh[] = [];
      const arrowMat = new THREE.MeshBasicMaterial({
        color: link.colorHex,
        transparent: true,
        opacity: 0.85
      });

      for (let i = 1; i <= 2; i++) {
        const t = i / 3.0;
        const arrowGeo = new THREE.ConeGeometry(0.018, 0.045, 8);
        const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
        const pos = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        arrowMesh.position.copy(pos);
        arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        this.group.add(arrowMesh);
        arrowMeshes.push(arrowMesh);
      }

      // Moving Flux Pulse Marker
      const pulseGeo = new THREE.SphereGeometry(0.02, 12, 12);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: link.colorHex,
        transparent: true,
        opacity: 0.95
      });
      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
      this.group.add(pulseMesh);

      this.visualLinks.push({
        link,
        curve,
        line,
        arrowMeshes,
        pulseMesh
      });
    });
  }

  /**
   * Generates a high-res glowing canvas billboard badge for the node
   */
  private createSignpostSprite(node: SpatialNodeV2): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Background pill container
    ctx.fillStyle = 'rgba(7, 12, 22, 0.82)';
    ctx.strokeStyle = `#${node.colorHex.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(10, 10, 364, 108, 16);
    ctx.fill();
    ctx.stroke();

    // Category Tag Pill
    ctx.fillStyle = `#${node.colorHex.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.roundRect(24, 22, 130, 26, 6);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(node.category, 32, 40);

    // Node Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(node.name, 24, 76);

    // Coordinates footer
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '14px monospace';
    ctx.fillText(
      `POS: [${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)}]`,
      24,
      100
    );

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(0.65, 0.22, 1.0);
    return sprite;
  }

  public update(timeSec: number, cameraPos: THREE.Vector3): void {
    const isVisible = this.nodeGraph.isWayfindingVisible();
    this.group.visible = isVisible;
    if (!isVisible) return;

    // 1. Animate Moving Energy Pulse Spheres along link splines
    this.visualLinks.forEach(item => {
      const speed = 0.35 * (item.link.flowIntensity || 1.0);
      const t = (timeSec * speed) % 1.0;
      const pos = item.curve.getPoint(t);
      item.pulseMesh.position.copy(pos);

      // Pulse breathing scale
      const s = 1.0 + 0.3 * Math.sin(timeSec * 8.0);
      item.pulseMesh.scale.set(s, s, s);
    });

    // 2. Adjust Macro Cluster Opacity based on Camera Distance
    for (const item of this.visualNodes.values()) {
      const dist = item.group.position.distanceTo(cameraPos);
      const isZoomedOut = dist > 2.2;

      // Pulse signpost slightly when active focus
      const isFocused = this.nodeGraph.getActiveFocusNodeId() === item.node.id;
      const cageMat = item.boundingCage.material as THREE.LineBasicMaterial;

      if (isFocused) {
        cageMat.opacity = 0.8 + 0.2 * Math.sin(timeSec * 6.0);
      } else {
        cageMat.opacity = isZoomedOut ? 0.45 : 0.15;
      }
    }
  }
}

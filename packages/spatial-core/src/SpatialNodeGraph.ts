/**
 * VIBE SpatialOS - Hierarchical Spatial Node Graph & Wayfinding Engine
 * Partitions massive architectural, mechanical, and biological digital twins
 * into structured, color-coded spatial clusters with macro-to-micro LOD thresholding
 * and holographic directional tensor links.
 */

import { MathCore, Vector3 } from './MathCore.js';

export type SpatialNodeCategory =
  | 'ARCHITECTURAL'
  | 'MECHANICAL'
  | 'BIO_MOLECULAR'
  | 'INFRASTRUCTURE'
  | 'ELECTRICAL';

export type SpatialLinkType =
  | 'KINEMATIC_CHAIN'
  | 'STRUCTURAL_LOAD'
  | 'PIPING_FLUID'
  | 'DATA_BUS'
  | 'HIERARCHY';

export interface SpatialNodeV2 {
  id: string;
  name: string;
  category: SpatialNodeCategory;
  colorHex: number;
  position: Vector3;
  halfExtents: Vector3;
  objectIds: string[];
  lodLevel: 'MACRO' | 'SUB_ASSEMBLY' | 'COMPONENT' | 'ATOMIC';
  isActive: boolean;
  metadata: Record<string, any>;
}

export interface SpatialNodeLink {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: SpatialLinkType;
  colorHex: number;
  flowIntensity: number; // 0.0 to 1.0 (animated pulse speed/intensity)
  bidirectional: boolean;
  label?: string;
}

export class SpatialNodeGraph {
  private nodes: Map<string, SpatialNodeV2> = new Map();
  private links: Map<string, SpatialNodeLink> = new Map();
  private showWayfinding: boolean = true;
  private activeFocusNodeId: string | null = null;

  constructor() {}

  public registerNode(node: SpatialNodeV2): void {
    this.nodes.set(node.id, node);
  }

  public unregisterNode(id: string): boolean {
    // Also remove links referencing this node
    for (const [linkId, link] of this.links.entries()) {
      if (link.sourceNodeId === id || link.targetNodeId === id) {
        this.links.delete(linkId);
      }
    }
    return this.nodes.delete(id);
  }

  public getNode(id: string): SpatialNodeV2 | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): SpatialNodeV2[] {
    return Array.from(this.nodes.values());
  }

  public registerLink(link: SpatialNodeLink): void {
    this.links.set(link.id, link);
  }

  public unregisterLink(id: string): boolean {
    return this.links.delete(id);
  }

  public getLinks(): SpatialNodeLink[] {
    return Array.from(this.links.values());
  }

  public getLinksForNode(nodeId: string): SpatialNodeLink[] {
    return this.getLinks().filter(
      l => l.sourceNodeId === nodeId || l.targetNodeId === nodeId
    );
  }

  public setWayfindingVisible(visible: boolean): void {
    this.showWayfinding = visible;
  }

  public isWayfindingVisible(): boolean {
    return this.showWayfinding;
  }

  public setActiveFocusNode(nodeId: string | null): void {
    this.activeFocusNodeId = nodeId;
  }

  public getActiveFocusNodeId(): string | null {
    return this.activeFocusNodeId;
  }

  /**
   * Evaluates camera distance to each node and categorizes into Macro cluster vs Detailed Granular LOD
   */
  public evaluateLODForCamera(
    cameraPos: Vector3,
    macroDistanceThresholdM: number = 2.8
  ): {
    macroNodes: SpatialNodeV2[];
    detailNodes: SpatialNodeV2[];
  } {
    const macroNodes: SpatialNodeV2[] = [];
    const detailNodes: SpatialNodeV2[] = [];

    for (const node of this.nodes.values()) {
      const dist = MathCore.v3Distance(cameraPos, node.position);
      if (dist >= macroDistanceThresholdM) {
        macroNodes.push(node);
      } else {
        detailNodes.push(node);
      }
    }

    return { macroNodes, detailNodes };
  }

  /**
   * Searches for a node matching a voice keyword or name fragment
   */
  public findNodeByNameOrKeyword(keyword: string): SpatialNodeV2 | null {
    const q = keyword.trim().toLowerCase();
    for (const node of this.nodes.values()) {
      const nodeId = node.id.toLowerCase();
      const nodeName = node.name.toLowerCase();
      const category = node.category.toLowerCase();

      if (
        q.includes(nodeId) ||
        nodeId.includes(q) ||
        q.includes(nodeName) ||
        nodeName.includes(q) ||
        q.includes(category)
      ) {
        return node;
      }

      // Check word tokens from node name (e.g. "turbine" in "Turbine Assembly")
      const words = nodeName.split(/[\s_,-]+/);
      for (const word of words) {
        if (word.length >= 3 && q.includes(word)) {
          return node;
        }
      }
    }
    return null;
  }

  /**
   * Finds shortest navigational route (BFS) between two nodes across directional links
   */
  public findShortestPath(startNodeId: string, targetNodeId: string): string[] | null {
    if (!this.nodes.has(startNodeId) || !this.nodes.has(targetNodeId)) {
      return null;
    }
    if (startNodeId === targetNodeId) {
      return [startNodeId];
    }

    const queue: string[][] = [[startNodeId]];
    const visited = new Set<string>([startNodeId]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const currentNodeId = path[path.length - 1];

      if (currentNodeId === targetNodeId) {
        return path;
      }

      const adjacentLinks = this.getLinksForNode(currentNodeId);
      for (const link of adjacentLinks) {
        const neighborId =
          link.sourceNodeId === currentNodeId
            ? link.targetNodeId
            : link.bidirectional
            ? link.sourceNodeId
            : null;

        if (neighborId && !visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push([...path, neighborId]);
        }
      }
    }

    return null;
  }
}

/**
 * VIBE SpatialOS & Studio v2.0 - Main Application Orchestrator
 * Integrates Three.js 3D Digital Twin, Unified Coordinate Engine,
 * SVD Closed-Loop Calibration, Phased Array Haptics, and Multimodal Deictic AI.
 */

import * as THREE from 'three';
import {
  SpatialWorldEngineV2,
  HapticsAMSolver,
  MathCore,
  DecodedSpatialFrameV2
} from '@vibe/spatial-core';
import { KabschCalibrator } from '@vibe/closed-loop';
import { MultimodalSpatialAgent, SpatialAIResponse } from '@vibe/semantic-ai';

import { SpatialRoom } from './stage/SpatialRoom.js';
import { SensorNodesManager } from './stage/SensorNodes.js';
import { CADTurbineEntity } from './entities/CADTurbine.js';
import { MoleculeModelEntity } from './entities/MoleculeModel.js';
import { VirtualHandTracker } from './input/VirtualHandTracker.js';
import { HapticsVisualizer } from './ui/HapticsVisualizer.js';
import { SpatialHUD } from './ui/SpatialHUD.js';
import { CommandConsole } from './ui/CommandConsole.js';
import { SpatialWayfinding } from './stage/SpatialWayfinding.js';
import { SimulatedRFSource, RFFrame } from '@vibe/rf-sensing';
import { SpatialRFVisualizer } from './stage/SpatialRFVisualizer.js';

class SpatialStudioApp {
  // Three.js Core
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Spatial System Engines
  private worldEngine: SpatialWorldEngineV2;
  private hapticsSolver: HapticsAMSolver;
  private calibrator: KabschCalibrator;
  private aiAgent: MultimodalSpatialAgent;

  // Stage & Visual Entities
  private room: SpatialRoom;
  private sensorNodes: SensorNodesManager;
  private turbine: CADTurbineEntity;
  private molecule: MoleculeModelEntity;
  private handTracker: VirtualHandTracker;
  private wayfinding: SpatialWayfinding;
  private rfVisualizer: SpatialRFVisualizer;
  private rfSource: SimulatedRFSource;
  private latestRFFrame: RFFrame | null = null;

  // UI Components
  private hud: SpatialHUD;
  private hapticsViz: HapticsVisualizer;
  private console: CommandConsole;

  // Gateway Connection
  private ws: WebSocket | null = null;
  private clock: THREE.Clock = new THREE.Clock();

  // Mouse & Camera Control State
  private isOrbiting = false;
  private isHandMoving = false;
  private prevMouseX = 0;
  private prevMouseY = 0;
  private cameraTheta = 0.0;
  private cameraPhi = 0.35;
  private cameraDistance = 2.4;
  private cameraLookTarget = new THREE.Vector3(0, 1.2, -0.4);

  constructor() {
    this.canvas = document.getElementById('spatial-canvas') as HTMLCanvasElement;

    // 1. Initialize Three.js Engine
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07090e);

    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      20.0
    );
    this.updateCameraPosition();

    // 2. Instantiate Spatial Engines
    this.worldEngine = new SpatialWorldEngineV2();
    this.hapticsSolver = new HapticsAMSolver(4, 4, 0.015);
    this.calibrator = new KabschCalibrator(0.15);
    this.aiAgent = new MultimodalSpatialAgent(this.worldEngine);

    // 3. Construct 3D Stage & Models
    this.room = new SpatialRoom();
    this.scene.add(this.room.group);

    this.sensorNodes = new SensorNodesManager();
    this.scene.add(this.sensorNodes.group);

    this.turbine = new CADTurbineEntity();
    this.turbine.group.position.set(-0.35, 1.2, -0.4);
    this.scene.add(this.turbine.group);

    this.molecule = new MoleculeModelEntity();
    this.molecule.group.position.set(0.35, 1.2, -0.4);
    this.scene.add(this.molecule.group);

    this.handTracker = new VirtualHandTracker();
    this.scene.add(this.handTracker.group);

    // RF 17-Keypoint Human Skeleton & Vitals Visualizer
    this.rfVisualizer = new SpatialRFVisualizer();
    this.scene.add(this.rfVisualizer.group);

    this.rfSource = new SimulatedRFSource(20);
    this.rfSource.onFrame((frame) => {
      this.latestRFFrame = frame;
    });
    this.rfSource.connect();

    // 4. Register Spatial Objects with Metric Coordinates in World Engine
    this.worldEngine.registerObject({
      id: 'obj_turbine_cad',
      name: 'Turbina Lotnicza (CAD)',
      type: 'cad_part',
      position: { x: -0.35, y: 1.2, z: -0.4 },
      rotation: MathCore.quatIdentity(),
      scale: { x: 1, y: 1, z: 1 },
      halfExtents: { x: 0.22, y: 0.22, z: 0.28 },
      metadata: { exploded: false }
    });

    this.worldEngine.registerObject({
      id: 'obj_molecule_caffeine',
      name: 'Molekuła Kofeiny (Digital Twin)',
      type: 'molecule',
      position: { x: 0.35, y: 1.2, z: -0.4 },
      rotation: MathCore.quatIdentity(),
      scale: { x: 1, y: 1, z: 1 },
      halfExtents: { x: 0.35, y: 0.35, z: 0.25 },
      metadata: { showHydrogenBonds: true }
    });

    // 4.1 Register Spatial Nodes in Hierarchical Node Graph
    this.worldEngine.nodeGraph.registerNode({
      id: 'node_turbine',
      name: 'TURBINA LOTNICZA (CAD)',
      category: 'MECHANICAL',
      colorHex: 0x00f0ff,
      position: { x: -0.35, y: 1.2, z: -0.4 },
      halfExtents: { x: 0.25, y: 0.25, z: 0.3 },
      objectIds: ['obj_turbine_cad'],
      lodLevel: 'MACRO',
      isActive: true,
      metadata: { subAssemblies: 4 }
    });

    this.worldEngine.nodeGraph.registerNode({
      id: 'node_molecule',
      name: 'MOLEKUŁA CAFFEINE',
      category: 'BIO_MOLECULAR',
      colorHex: 0x00ff88,
      position: { x: 0.35, y: 1.2, z: -0.4 },
      halfExtents: { x: 0.35, y: 0.35, z: 0.3 },
      objectIds: ['obj_molecule_caffeine'],
      lodLevel: 'ATOMIC',
      isActive: true,
      metadata: { atomsCount: 24 }
    });

    this.worldEngine.nodeGraph.registerNode({
      id: 'node_sensor_grid',
      name: 'SENSOR GRID SVD',
      category: 'INFRASTRUCTURE',
      colorHex: 0xffaa00,
      position: { x: 0, y: 2.3, z: 0 },
      halfExtents: { x: 1.4, y: 0.2, z: 1.4 },
      objectIds: [],
      lodLevel: 'MACRO',
      isActive: true,
      metadata: { nodesCount: 4 }
    });

    // Register Directional Flux & Wayfinding Links
    this.worldEngine.nodeGraph.registerLink({
      id: 'link_sensor_to_turbine',
      sourceNodeId: 'node_sensor_grid',
      targetNodeId: 'node_turbine',
      type: 'STRUCTURAL_LOAD',
      colorHex: 0x00f0ff,
      flowIntensity: 1.0,
      bidirectional: false,
      label: 'Telemetry 60Hz'
    });

    this.worldEngine.nodeGraph.registerLink({
      id: 'link_sensor_to_molecule',
      sourceNodeId: 'node_sensor_grid',
      targetNodeId: 'node_molecule',
      type: 'DATA_BUS',
      colorHex: 0x00ff88,
      flowIntensity: 0.8,
      bidirectional: false,
      label: 'Digital Twin Stream'
    });

    this.worldEngine.nodeGraph.registerLink({
      id: 'link_turbine_to_molecule',
      sourceNodeId: 'node_turbine',
      targetNodeId: 'node_molecule',
      type: 'KINEMATIC_CHAIN',
      colorHex: 0xa855f7,
      flowIntensity: 0.6,
      bidirectional: true,
      label: 'Cross-Assembly Bus'
    });

    // 4.2 Initialize 3D Holographic Wayfinding Stage
    this.wayfinding = new SpatialWayfinding(this.worldEngine.nodeGraph);
    this.scene.add(this.wayfinding.group);

    // 5. Initialize UI Subsystems
    this.hud = new SpatialHUD();
    this.hapticsViz = new HapticsVisualizer('haptics-canvas', 'val-haptic-pressure');
    this.console = new CommandConsole(this.aiAgent, (res) => this.handleAIResponse(res));

    // 6. Setup Interaction & Window Listeners
    this.setupEventListeners();
    this.connectGateway();

    // 7. Start Render Loop
    this.animate();
  }

  private updateCameraPosition(): void {
    const x = this.cameraDistance * Math.sin(this.cameraTheta) * Math.cos(this.cameraPhi);
    const y = 1.2 + this.cameraDistance * Math.sin(this.cameraPhi);
    const z = this.cameraDistance * Math.cos(this.cameraTheta) * Math.cos(this.cameraPhi);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.cameraLookTarget);
  }

  private setupEventListeners(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Mouse Interaction for 3D Navigation and 6-DoF Hand Manipulation
    window.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') {
        if (e.button === 0 && !e.shiftKey) {
          this.isOrbiting = true;
        } else if (e.button === 2 || e.shiftKey) {
          this.isHandMoving = true;
        }
        this.prevMouseX = e.clientX;
        this.prevMouseY = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isOrbiting = false;
      this.isHandMoving = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.prevMouseX;
      const dy = e.clientY - this.prevMouseY;

      if (this.isOrbiting) {
        this.cameraTheta -= dx * 0.005;
        this.cameraPhi = Math.max(-0.4, Math.min(1.2, this.cameraPhi + dy * 0.005));
        this.updateCameraPosition();
      } else if (this.isHandMoving) {
        // Move virtual hand in camera-aligned space
        this.handTracker.rightHandPos.x += dx * 0.0015;
        this.handTracker.rightHandPos.y -= dy * 0.0015;
      }

      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;
    });

    window.addEventListener('wheel', (e) => {
      if (e.shiftKey) {
        // Move hand in Z depth
        this.handTracker.rightHandPos.z += e.deltaY * 0.001;
      } else {
        // Zoom camera
        this.cameraDistance = Math.max(1.0, Math.min(5.0, this.cameraDistance + e.deltaY * 0.002));
        this.updateCameraPosition();
      }
    });

    // Keyboard Hotkeys
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        const isPinching = this.handTracker.toggleRightPinch();
        this.hud.updateGestureState(this.handTracker.rightPinchMm, isPinching);
      }
    });

    // Control Buttons
    const btnPinch = document.getElementById('btn-toggle-pinch');
    btnPinch?.addEventListener('click', () => {
      const isPinching = this.handTracker.toggleRightPinch();
      this.hud.updateGestureState(this.handTracker.rightPinchMm, isPinching);
    });

    const btnGhost = document.getElementById('btn-toggle-ghost');
    btnGhost?.addEventListener('click', () => {
      const active = !this.handTracker.showPredictorGhost;
      this.handTracker.setGhostVisible(active);
      btnGhost.classList.toggle('active', active);
    });

    const btnReset = document.getElementById('btn-reset-pos');
    btnReset?.addEventListener('click', () => {
      this.handTracker.rightHandPos.set(0.25, 1.2, -0.4);
      this.turbine.group.position.set(-0.35, 1.2, -0.4);
      this.molecule.group.position.set(0.35, 1.2, -0.4);
    });

    // Auto-Calibrate SVD Button
    const btnCalib = document.getElementById('btn-calibrate');
    btnCalib?.addEventListener('click', () => this.runClosedLoopCalibration());

    // Flight Recorder Button
    const btnRec = document.getElementById('btn-recorder');
    btnRec?.addEventListener('click', () => {
      const rec = this.worldEngine.flightRecorder;
      if (rec.getIsRecording()) {
        const count = rec.stopRecording();
        btnRec.classList.remove('recording');
        btnRec.innerHTML = `<span class="rec-dot"></span> REC`;
        this.console.logMessage(`Zatrzymano rejestrację. Zapisano ${count} klatek 6-DoF.`);
      } else {
        rec.startRecording();
        btnRec.classList.add('recording');
        btnRec.innerHTML = `<span class="rec-dot"></span> STOP`;
        this.console.logMessage(`Rozpoczęto nagrywanie sesji przestrzennej...`);
      }
    });

    // Semantic LOD Buttons
    document.querySelectorAll('.lod-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.lod-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const lod = btn.getAttribute('data-lod') as any;
        this.aiAgent.setSemanticLOD(lod);
        this.applySemanticLOD(lod);
      });
    });

    // VIBE Pulse Wearable Trigger Listeners
    let emgSqueezeState = false;

    document.getElementById('btn-flick-left')?.addEventListener('click', () => {
      this.worldEngine.wearableManager.processIMUFrame({
        timestampMs: performance.now(),
        gyroDps: { x: 0, y: 0, z: -550.0 },
        accelG: { x: 0, y: 1.0, z: 0 },
        quaternion: MathCore.quatIdentity(),
        emgIntensity: 0.15,
        batteryPercent: 92
      });
      this.console.logMessage('VIBE Pulse: Wykryto Flick Nadgarstka w lewo -> Akcja: UNDO');
    });

    document.getElementById('btn-flick-right')?.addEventListener('click', () => {
      this.worldEngine.wearableManager.processIMUFrame({
        timestampMs: performance.now(),
        gyroDps: { x: 0, y: 0, z: 550.0 },
        accelG: { x: 0, y: 1.0, z: 0 },
        quaternion: MathCore.quatIdentity(),
        emgIntensity: 0.15,
        batteryPercent: 92
      });
      this.console.logMessage('VIBE Pulse: Wykryto Flick Nadgarstka w prawo -> Akcja: REDO');
    });

    document.getElementById('btn-tilt-pitch')?.addEventListener('click', () => {
      const qTilt = MathCore.quatFromAxisAngle({ x: 1, y: 0, z: 0 }, (45 * Math.PI) / 180);
      this.worldEngine.wearableManager.processIMUFrame({
        timestampMs: performance.now(),
        gyroDps: { x: 0, y: 0, z: 0 },
        accelG: { x: 0, y: 0.7, z: 0.7 },
        quaternion: qTilt,
        emgIntensity: 0.15,
        batteryPercent: 92
      });
      this.console.logMessage('VIBE Pulse: Przechył pionowy -> Zablokowano płaszczyznę modelowania XY');
    });

    document.getElementById('btn-squeeze-emg')?.addEventListener('click', () => {
      emgSqueezeState = !emgSqueezeState;
      const intensity = emgSqueezeState ? 0.88 : 0.12;
      this.worldEngine.wearableManager.processIMUFrame({
        timestampMs: performance.now(),
        gyroDps: { x: 0, y: 0, z: 0 },
        accelG: { x: 0, y: 1.0, z: 0 },
        quaternion: MathCore.quatIdentity(),
        emgIntensity: intensity,
        batteryPercent: 92
      });
      this.console.logMessage(
        `VIBE Pulse EMG Squeeze: ${emgSqueezeState ? 'ZACIŚNIĘCIE (Grip Active)' : 'ZWOLNIENIE (Relaxed)'}`
      );
    });
  }

  private handleAIResponse(res: SpatialAIResponse): void {
    if (!res.success) return;

    // 1. Scale & Deformation (Uniform Scale, Bimanual Scale, Axial Stretch)
    if (
      (res.actionType === 'SCALE' ||
        res.actionType === 'BIMANUAL_SCALE' ||
        res.actionType === 'STRETCH') &&
      res.targetObjectId
    ) {
      const obj = this.worldEngine.getObject(res.targetObjectId);
      if (obj) {
        if (obj.type === 'cad_part') {
          this.turbine.group.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
        } else if (obj.type === 'molecule') {
          this.molecule.group.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
        }
      }
    }

    // 2. 3D Rotation (Single-Hand 3D Rotation, Bimanual Dual-Hand 3D Rotation)
    else if (
      (res.actionType === 'ROTATE_3D' ||
        res.actionType === 'BIMANUAL_ROTATE' ||
        res.actionType === 'ROTATE') &&
      res.targetObjectId
    ) {
      const obj = this.worldEngine.getObject(res.targetObjectId);
      if (obj) {
        const q = obj.rotation;
        if (obj.type === 'cad_part') {
          this.turbine.group.quaternion.set(q.x, q.y, q.z, q.w);
        } else if (obj.type === 'molecule') {
          this.molecule.group.quaternion.set(q.x, q.y, q.z, q.w);
        }
      }
    }

    // 3. Translation / Spatial Repositioning
    else if (res.actionType === 'TRANSLATE' && res.targetObjectId) {
      const obj = this.worldEngine.getObject(res.targetObjectId);
      if (obj) {
        if (obj.type === 'cad_part') {
          this.turbine.group.position.set(obj.position.x, obj.position.y, obj.position.z);
        } else if (obj.type === 'molecule') {
          this.molecule.group.position.set(obj.position.x, obj.position.y, obj.position.z);
        }
      }
    }

    // 4. Semantic LOD & Component Expansion / Collapse
    else if (res.actionType === 'EXPAND' || res.actionType === 'COLLAPSE' || res.actionType === 'SEMANTIC_LOD') {
      const lod = res.payload?.lod || this.aiAgent.getSemanticLOD();
      this.applySemanticLOD(lod);

      // Sync active state on HUD LOD buttons
      document.querySelectorAll('.lod-btn').forEach(b => {
        if (b.getAttribute('data-lod') === lod) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    }

    // 5. Workspace Wipe / Hand-Wave Reset
    else if (res.actionType === 'WIPE' || res.actionType === 'RESET_SCENE') {
      this.turbine.group.scale.set(1, 1, 1);
      this.turbine.group.quaternion.identity();
      this.turbine.group.position.set(-0.35, 1.2, -0.4);
      this.turbine.setExplosion(0.0);
      this.turbine.group.visible = true;

      this.molecule.group.scale.set(1, 1, 1);
      this.molecule.group.quaternion.identity();
      this.molecule.group.position.set(0.35, 1.2, -0.4);
      this.molecule.setOrbitalsVisible(false);
      this.molecule.setHydrogenBondsVisible(true);
      this.molecule.group.visible = true;

      this.applySemanticLOD('MACRO_CAD');
      document.querySelectorAll('.lod-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-lod') === 'MACRO_CAD');
      });
    }

    // 6. Object Isolation / Focus
    else if (res.actionType === 'ISOLATE' || res.actionType === 'FOCUS') {
      const targetId = res.targetObjectId;
      if (targetId === 'obj_turbine_cad') {
        this.turbine.group.visible = true;
        this.molecule.group.visible = false;
      } else if (targetId === 'obj_molecule_caffeine') {
        this.molecule.group.visible = true;
        this.turbine.group.visible = false;
      }
    }

    // 7. Full Molecular Disassembly & Group Isolation
    else if (res.actionType === 'MOLECULAR_DISASSEMBLE') {
      this.molecule.setDisassembly(1.0);
      this.molecule.setOrbitalsVisible(true);
      this.molecule.setHydrogenBondsVisible(true);
      this.molecule.isolateFunctionalGroup('ALL');
    } else if (res.actionType === 'ISOLATE_GROUP') {
      this.molecule.isolateFunctionalGroup(res.payload.groupType);
    }

    // 8. Molecular Feature Toggles
    else if (res.actionType === 'TOGGLE_HYDROGEN_BONDS') {
      this.molecule.setHydrogenBondsVisible(res.payload.showHydrogenBonds);
    }

    // 9. System & Perimeter Calibration
    else if (res.actionType === 'CALIBRATE' || res.actionType === 'CALIBRATE_PERIMETER') {
      this.runClosedLoopCalibration();
    }

    // 10. Ultrasonic Haptics & Perimeter Tracing
    else if (res.actionType === 'TRIGGER_HAPTICS') {
      this.hapticsSolver.solveFocalPoint(res.payload.position);
    } else if (res.actionType === 'HAPTIC_TRACE_PERIMETER') {
      const obj = this.worldEngine.getObject(res.targetObjectId || 'obj_turbine_cad');
      const center = obj ? obj.position : { x: 0, y: 1.2, z: -0.4 };
      const r = obj ? obj.halfExtents.x + 0.05 : 0.25;
      const perimeterPoint = {
        x: center.x + r,
        y: center.y,
        z: center.z
      };
      this.hapticsSolver.solveFocalPoint(perimeterPoint);
    }

    // 11. Spatial Node Graph Navigation & Holographic Wayfinding
    else if (res.actionType === 'NODE_NAVIGATE') {
      const targetPos = res.payload?.targetPosition || { x: 0, y: 1.2, z: -0.4 };
      this.cameraLookTarget.set(targetPos.x, targetPos.y, targetPos.z);
      this.updateCameraPosition();
      this.worldEngine.nodeGraph.setActiveFocusNode(res.payload?.node?.id || null);
    } else if (res.actionType === 'NODE_GRAPH_TOGGLE') {
      const visible = !this.worldEngine.nodeGraph.isWayfindingVisible();
      this.worldEngine.nodeGraph.setWayfindingVisible(visible);
    } else if (res.actionType === 'SHOW_WAYFINDING') {
      this.worldEngine.nodeGraph.setWayfindingVisible(true);
    }

    // 12. Mid-Air Haptic Grid Snapping & Virtual Rulers
    else if (res.actionType === 'GRID_SNAP_CONFIG') {
      const snapRes = res.payload?.resolution || '10MM';
      this.console.logMessage(
        `Haptic Grid Snapping: ${res.payload?.enabled ? 'AKTYWNY [' + snapRes + ']' : 'WYŁĄCZONY'}`
      );
    }

    // 13. Universal CAD/BIM Bridge
    else if (res.actionType === 'CAD_CONNECT') {
      const host = res.payload?.host || 'SOLIDWORKS';
      this.console.logMessage(`Konektor CAD Bridge połączony z [${host}] (60 Hz B-Rep Sync).`);
    } else if (res.actionType === 'CAD_PARAMETRIC_EDIT') {
      this.console.logMessage(`Zaktualizowano wymiar parametryczny CAD: ${res.payload?.featureName} = ${res.payload?.value} mm.`);
    }

    // 14. RF Wi-Fi CSI Sensing (π RuView / rvCSI)
    else if (res.actionType === 'RF_SENSING_TOGGLE') {
      this.rfVisualizer.setVisible(true);
      this.console.logMessage('RF Wi-Fi Sensing: Wyświetlam neonowy szkielet 17-punktowy (rvCSI stream).');
    } else if (res.actionType === 'RF_VITALS_QUERY') {
      this.console.logMessage('Biometria RF CSI: Oddech: 15 bpm, Tętno: 72 bpm (Pewność sygnału: 94%).');
    }
  }

  private applySemanticLOD(lod: string): void {
    if (lod === 'MACRO_CAD') {
      this.turbine.setExplosion(0.0);
      this.molecule.setDisassembly(0.0);
      this.molecule.isolateFunctionalGroup('ALL');
      this.molecule.setOrbitalsVisible(false);
      this.turbine.group.visible = true;
      this.molecule.group.visible = true;
    } else if (lod === 'MECHANICAL_COMPONENT') {
      this.turbine.setExplosion(1.0);
      this.molecule.setOrbitalsVisible(false);
      this.turbine.group.visible = true;
    } else if (lod === 'CRYSTAL_LATTICE') {
      this.molecule.setHydrogenBondsVisible(true);
      this.molecule.setOrbitalsVisible(false);
    } else if (lod === 'MOLECULAR_ORBITAL') {
      this.molecule.setOrbitalsVisible(true);
      this.molecule.setHydrogenBondsVisible(true);
    }
  }

  /**
   * Executes 6-DoF Kabsch-Umeyama SVD Closed-Loop Calibration against 4 optical fiducials
   */
  private runClosedLoopCalibration(): void {
    const expected = this.room.fiducials.map(f => ({
      x: f.position.x,
      y: f.position.y,
      z: f.position.z
    }));

    // Synthesize slight thermal/optical drift noise on observed sensors
    const observed = expected.map(p => ({
      x: p.x + (Math.random() - 0.5) * 0.004,
      y: p.y + (Math.random() - 0.5) * 0.003,
      z: p.z + (Math.random() - 0.5) * 0.004
    }));

    const result = this.calibrator.solve(expected, observed);
    this.worldEngine.applyCalibrationMatrix(result.transformMatrix4x4);
    this.hud.setRMSError(result.rmsErrorMm);

    this.console.logMessage(
      `Auto-kalibracja SVD ukończona: Błąd resztkowy = ${result.rmsErrorMm.toFixed(2)} mm RMS (Zbieżność: ${result.converged ? 'TAK' : 'NIE'})`
    );
  }

  /**
   * Connects to high-speed Spatial Gateway WebSocket server
   */
  private connectGateway(): void {
    try {
      this.ws = new WebSocket('ws://localhost:8080');

      this.ws.onopen = () => {
        this.hud.setGatewayStatus('CONNECTED (60Hz)');
        this.console.logMessage('Połączono z bramką telemetryczną WebSocket (60 Hz).');
      };

      this.ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'SPATIAL_FRAME') {
            const frame: DecodedSpatialFrameV2 = packet.data;
            this.sensorNodes.updateNodeFrame(frame);
            this.hud.updateNodeMatrix(frame);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        this.hud.setGatewayStatus('DISCONNECTED');
        // Auto-reconnect after 3s
        setTimeout(() => this.connectGateway(), 3000);
      };

      this.ws.onerror = () => {
        this.hud.setGatewayStatus('DISCONNECTED');
      };
    } catch {
      this.hud.setGatewayStatus('DISCONNECTED');
    }
  }

  /**
   * Main Render and Physics Evaluation Loop
   */
  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    // 1. Update Hand State in World Engine with 15ms Kalman Extrapolation
    const currentPredictedPos = this.worldEngine.getUserState().rightHand.predictedPosition;
    const { rightHandState, leftHandState } = this.handTracker.update(currentPredictedPos);

    this.worldEngine.updateUserState({
      rightHand: rightHandState,
      leftHand: leftHandState,
      gazeRay: {
        origin: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
        direction: {
          x: -Math.sin(this.cameraTheta) * Math.cos(this.cameraPhi),
          y: -Math.sin(this.cameraPhi),
          z: -Math.cos(this.cameraTheta) * Math.cos(this.cameraPhi)
        }
      }
    }, performance.now());

    // 2. Evaluate Gestures (Pinch / Grab / Dual-Hand Scale)
    const gestureResult = this.worldEngine.processGestures();

    // Sync dragged 3D objects with Three.js scene
    if (gestureResult.action === 'PRECISION_GRAB' && gestureResult.targetId) {
      const obj = this.worldEngine.getObject(gestureResult.targetId);
      if (obj) {
        if (obj.type === 'cad_part') {
          this.turbine.group.position.set(obj.position.x, obj.position.y, obj.position.z);
        } else if (obj.type === 'molecule') {
          this.molecule.group.position.set(obj.position.x, obj.position.y, obj.position.z);
        }
      }
    }

    // 3. Update Ultrasonic Phased Array Haptics & Mid-Air Grid Snap Detents
    const velMagnitude = MathCore.v3Length(this.worldEngine.getUserState().rightHand.rawVelocity);
    const snapResult = this.worldEngine.gridSnapper.snap(rightHandState.predictedPosition, velMagnitude);

    const targetObj = this.worldEngine.resolveTargetCone(
      snapResult.snappedPosition,
      this.worldEngine.getUserState().gazeRay.direction
    );
    const focalPos = targetObj ? targetObj.position : snapResult.snappedPosition;
    this.hapticsSolver.solveFocalPoint(focalPos);

    // Compute acoustic field slice at focal position and render 2D heatmap
    const slice = this.hapticsSolver.computeFieldSlice(focalPos, 0.12, 32, 'XY');
    this.hapticsViz.renderSlice(slice, time);

    // 4. Update 3D Stage & Animated Entities
    this.room.update(time);
    this.sensorNodes.update(time);
    this.turbine.update(delta, time);
    this.molecule.update(delta, time);
    this.wayfinding.update(time, this.camera.position);
    this.rfVisualizer.update(this.latestRFFrame?.skeleton, time);

    // 5. Update HUD Telemetry
    this.hud.updateHandKinematics(velMagnitude);
    this.hud.updateLatency(delta * 1000.0);
    this.hud.updateGestureState(rightHandState.pinchDistanceMm, rightHandState.isPinching);

    // Update entity list highlighting
    this.hud.updateEntitiesList(
      this.worldEngine.getAllObjects().map(o => ({
        id: o.id,
        name: o.name,
        type: o.type,
        isTargeted: targetObj?.id === o.id
      }))
    );

    // Update VIBE Pulse Wearable HUD state
    const planeLock = this.worldEngine.wearableManager.getActivePlaneLock();
    const isSqueezing = this.worldEngine.wearableManager.isGripSqueezing();
    this.hud.updateWearableHUD(planeLock, isSqueezing ? 0.88 : 0.12, isSqueezing, null);

    // 6. Record snapshot in Flight Recorder if active
    this.worldEngine.snapshotFlightRecord(1.42, focalPos, gestureResult.action);

    // 7. Render Three.js Scene
    this.renderer.render(this.scene, this.camera);
  };
}

// Bootstrap Application on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  new SpatialStudioApp();
});

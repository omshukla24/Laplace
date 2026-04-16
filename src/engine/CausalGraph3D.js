/**
 * CausalGraph3D.js — 3D force-directed causal graph renderer.
 * Renders nodes as glowing spheres and edges as animated flowing lines.
 */
import * as THREE from 'three';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force-3d';

export class CausalGraph3D {
  constructor(sceneManager, graphData, audioEngine) {
    this.sceneManager = sceneManager;
    this.audioEngine = audioEngine;
    this.scene = sceneManager.scene;
    this.graphData = graphData;
    this.nodeMap = new Map();
    this.edgeMap = new Map();
    this.labelMap = new Map();
    this.ripples = [];
    this.tracerBeams = [];

    // Colors from categories
    this.categoryColors = graphData.categoryColors || {};

    this.buildGraph();
    this.sceneManager.onAnimate((dt, elapsed) => this.update(dt, elapsed));
  }

  buildGraph() {
    // Prepare nodes and links for d3-force-3d
    const simNodes = this.graphData.nodes.map(n => ({
      id: n.id,
      ...n,
    }));

    const simLinks = this.graphData.edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
      type: e.type,
    }));

    // Run force simulation synchronously (pre-compute layout)
    const sim = forceSimulation(simNodes, 3)
      .force('link', forceLink(simLinks).id(d => d.id).distance(35).strength(0.3))
      .force('charge', forceManyBody().strength(-120))
      .force('center', forceCenter(0, 0, 0))
      .force('collide', forceCollide(8))
      .stop();

    // Tick 300 iterations for stable layout
    for (let i = 0; i < 300; i++) sim.tick();

    // Create node meshes
    this.graphGroup = new THREE.Group();
    this.nodeGroup = new THREE.Group();
    this.edgeGroup = new THREE.Group();
    this.labelGroup = new THREE.Group();

    simNodes.forEach(node => {
      this.createNode(node);
    });

    simLinks.forEach(link => {
      this.createEdge(link);
    });

    this.graphGroup.add(this.edgeGroup);
    this.graphGroup.add(this.nodeGroup);
    this.graphGroup.add(this.labelGroup);
    this.scene.add(this.graphGroup);
  }

  createNode(node) {
    const categoryColor = this.categoryColors[node.category] || '#00f0ff';
    const color = new THREE.Color(categoryColor);
    const radius = 2.0 + (node.baseline || 0.5) * 1.5;

    // Main sphere
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.5,
      metalness: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 0.9,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(node.x || 0, node.y || 0, node.z || 0);
    mesh.userData = { nodeId: node.id, baseColor: color.clone(), radius };

    // Outer glow ring
    const glowGeometry = new THREE.SphereGeometry(radius * 1.4, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    mesh.add(glow);

    this.nodeGroup.add(mesh);
    this.nodeMap.set(node.id, mesh);

    // Floating label
    this.createLabel(node, mesh);
  }

  createLabel(node, mesh) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, 256, 64);

    ctx.font = '600 22px Inter, sans-serif';
    ctx.fillStyle = '#e8edf5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, 128, 24);

    // Value below
    ctx.font = '500 16px JetBrains Mono, monospace';
    ctx.fillStyle = '#8892a8';
    const val = (node.baseline * 100).toFixed(0);
    ctx.fillText(val + (node.unit === 'percent' ? '%' : ''), 128, 48);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    const spriteScale = 12;
    sprite.scale.set(spriteScale, spriteScale * (64 / 256), 1);
    sprite.position.copy(mesh.position);
    sprite.position.y += mesh.userData.radius + 4;

    this.labelGroup.add(sprite);
    this.labelMap.set(node.id, { sprite, canvas, ctx, texture });
  }

  createEdge(link) {
    const sourceNode = this.nodeMap.get(typeof link.source === 'object' ? link.source.id : link.source);
    const targetNode = this.nodeMap.get(typeof link.target === 'object' ? link.target.id : link.target);

    if (!sourceNode || !targetNode) return;

    const edgeId = `${typeof link.source === 'object' ? link.source.id : link.source}_${typeof link.target === 'object' ? link.target.id : link.target}`;

    // Edge line
    const points = [sourceNode.position.clone(), targetNode.position.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    const isPositive = link.weight >= 0;
    const color = isPositive ? new THREE.Color(0x00ff88) : new THREE.Color(0xff3355);
    const opacity = 0.15 + Math.abs(link.weight) * 0.35;

    const material = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const line = new THREE.Line(geometry, material);
    line.userData = { edgeId, weight: link.weight, type: link.type, baseColor: color.clone() };

    this.edgeGroup.add(line);
    this.edgeMap.set(edgeId, line);

    // Flow particles along edge
    this.createEdgeParticles(sourceNode, targetNode, link, edgeId);

    // Arrowhead indicator
    this.createArrowhead(sourceNode, targetNode, color, opacity);
  }

  createEdgeParticles(sourceNode, targetNode, link, edgeId) {
    const particleCount = 5;
    const positions = new Float32Array(particleCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const isPositive = link.weight >= 0;
    const color = isPositive ? 0x00ff88 : 0xff3355;

    const material = new THREE.PointsMaterial({
      color: color,
      size: 1.2,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    particles.userData = {
      source: sourceNode,
      target: targetNode,
      particleCount,
      offsets: Array.from({ length: particleCount }, (_, i) => i / particleCount),
      speed: 0.3 + Math.abs(link.weight) * 0.3,
    };

    this.edgeGroup.add(particles);

    // Store reference for updates
    if (!this.edgeParticles) this.edgeParticles = [];
    this.edgeParticles.push(particles);
  }

  createArrowhead(sourceNode, targetNode, color, opacity) {
    const dir = new THREE.Vector3().subVectors(targetNode.position, sourceNode.position);
    const length = dir.length();
    dir.normalize();

    // Position arrowhead 70% along the edge
    const arrowPos = new THREE.Vector3().lerpVectors(
      sourceNode.position,
      targetNode.position,
      0.7
    );

    const arrowGeom = new THREE.ConeGeometry(0.6, 2, 4);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: opacity * 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const arrow = new THREE.Mesh(arrowGeom, arrowMat);
    arrow.position.copy(arrowPos);

    // Orient arrow along edge direction
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(up, dir);
    arrow.setRotationFromQuaternion(quaternion);

    this.edgeGroup.add(arrow);
  }

  /** Update loop */
  update(dt, elapsed) {
    // Pulse node glow
    this.nodeMap.forEach((mesh) => {
      const emissiveIntensity = 0.4 + 0.2 * Math.sin(elapsed * 1.5 + mesh.position.x * 0.1);
      mesh.material.emissiveIntensity = emissiveIntensity;
    });

    // Animate edge flow particles
    if (this.edgeParticles) {
      this.edgeParticles.forEach(particles => {
        const { source, target, particleCount, offsets, speed } = particles.userData;
        const positions = particles.geometry.attributes.position.array;

        for (let i = 0; i < particleCount; i++) {
          offsets[i] = (offsets[i] + dt * speed) % 1;
          const t = offsets[i];
          const i3 = i * 3;
          positions[i3] = source.position.x + (target.position.x - source.position.x) * t;
          positions[i3 + 1] = source.position.y + (target.position.y - source.position.y) * t;
          positions[i3 + 2] = source.position.z + (target.position.z - source.position.z) * t;
        }

        particles.geometry.attributes.position.needsUpdate = true;
      });
    }

    // Update ripples
    this.updateRipples(dt);

    // Update tracer beams
    this.updateTracerBeams(dt);
  }

  // ========= Animation Methods =========

  /**
   * Highlight a specific node (e.g., during analysis)
   */
  highlightNode(nodeId, color = null, intensity = 1.5) {
    const mesh = this.nodeMap.get(nodeId);
    if (!mesh) return;

    const targetColor = color ? new THREE.Color(color) : mesh.userData.baseColor.clone();
    mesh.material.emissive.copy(targetColor);
    mesh.material.emissiveIntensity = intensity;
    mesh.material.opacity = 1.0;

    // Scale up
    const scale = 1.3;
    mesh.scale.set(scale, scale, scale);
  }

  /**
   * Reset a node to its default state
   */
  resetNode(nodeId) {
    const mesh = this.nodeMap.get(nodeId);
    if (!mesh) return;

    mesh.material.emissive.copy(mesh.userData.baseColor);
    mesh.material.emissiveIntensity = 0.5;
    mesh.material.opacity = 0.9;
    mesh.scale.set(1, 1, 1);
  }

  /**
   * Reset all nodes
   */
  resetAllNodes() {
    this.nodeMap.forEach((_, id) => this.resetNode(id));
  }

  /**
   * Highlight an edge
   */
  highlightEdge(sourceId, targetId, color = null) {
    const edgeId = `${sourceId}_${targetId}`;
    const line = this.edgeMap.get(edgeId);
    if (!line) return;

    const targetColor = color ? new THREE.Color(color) : line.userData.baseColor.clone();
    line.material.color.copy(targetColor);
    line.material.opacity = 0.8;
  }

  /**
   * Reset an edge
   */
  resetEdge(sourceId, targetId) {
    const edgeId = `${sourceId}_${targetId}`;
    const line = this.edgeMap.get(edgeId);
    if (!line) return;

    line.material.color.copy(line.userData.baseColor);
    line.material.opacity = 0.15 + Math.abs(line.userData.weight) * 0.35;
  }

  /**
   * Reset all edges
   */
  resetAllEdges() {
    this.edgeMap.forEach((line) => {
      line.material.color.copy(line.userData.baseColor);
      line.material.opacity = 0.15 + Math.abs(line.userData.weight) * 0.35;
    });
  }

  /**
   * Update node value and label
   */
  updateNodeValue(nodeId, newValue, unit = '') {
    const labelData = this.labelMap.get(nodeId);
    if (!labelData) return;

    const { canvas, ctx, texture } = labelData;
    const node = this.graphData.nodes.find(n => n.id === nodeId);

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '600 22px Inter, sans-serif';
    ctx.fillStyle = '#e8edf5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node?.label || nodeId, 128, 24);

    ctx.font = '500 16px JetBrains Mono, monospace';
    ctx.fillStyle = '#00f0ff';
    const displayVal = (newValue * 100).toFixed(0);
    ctx.fillText(displayVal + (unit || (node?.unit === 'percent' ? '%' : '')), 128, 48);

    texture.needsUpdate = true;
  }

  /**
   * Fire a causal ripple from a node
   */
  fireRipple(nodeId, color = '#00f0ff') {
    if (this.audioEngine) this.audioEngine.playRipple();
    const mesh = this.nodeMap.get(nodeId);
    if (!mesh) return;

    const rippleGeom = new THREE.RingGeometry(0.5, 1.5, 64);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const rippleMesh = new THREE.Mesh(rippleGeom, rippleMat);
    rippleMesh.position.copy(mesh.position);
    rippleMesh.lookAt(this.sceneManager.camera.position);

    rippleMesh.userData = {
      startTime: performance.now(),
      duration: 1500,
      maxScale: 15,
    };

    this.scene.add(rippleMesh);
    this.ripples.push(rippleMesh);
  }

  updateRipples(dt) {
    const now = performance.now();
    this.ripples = this.ripples.filter(ripple => {
      const elapsed = now - ripple.userData.startTime;
      const progress = elapsed / ripple.userData.duration;

      if (progress >= 1) {
        this.scene.remove(ripple);
        ripple.geometry.dispose();
        ripple.material.dispose();
        return false;
      }

      const scale = ripple.userData.maxScale * progress;
      ripple.scale.set(scale, scale, scale);
      ripple.material.opacity = 0.6 * (1 - progress);
      ripple.lookAt(this.sceneManager.camera.position);

      return true;
    });
  }

  /**
   * Animate a tracer beam along a path
   */
  fireTracerBeam(path, color = '#00f0ff', onComplete = null) {
    if (path.length < 2) return;

    const positions = path.map(id => {
      const mesh = this.nodeMap.get(id);
      return mesh ? mesh.position.clone() : new THREE.Vector3();
    });

    const beamGroup = new THREE.Group();

    // Create line segments for the path
    for (let i = 0; i < positions.length - 1; i++) {
      const geom = new THREE.BufferGeometry().setFromPoints([positions[i], positions[i + 1]]);
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        linewidth: 2,
      });
      const line = new THREE.Line(geom, mat);
      line.userData = {
        segmentIndex: i,
        revealDelay: i * 400,
      };
      beamGroup.add(line);
    }

    beamGroup.userData = {
      startTime: performance.now(),
      totalDuration: path.length * 400 + 600,
      onComplete,
    };

    this.scene.add(beamGroup);
    this.tracerBeams.push(beamGroup);
  }

  updateTracerBeams(dt) {
    const now = performance.now();
    this.tracerBeams = this.tracerBeams.filter(beam => {
      const elapsed = now - beam.userData.startTime;

      if (elapsed >= beam.userData.totalDuration) {
        // Fade out and remove
        beam.children.forEach(child => {
          child.material.opacity *= 0.95;
        });
        if (beam.children[0]?.material.opacity < 0.01) {
          beam.children.forEach(child => {
            child.geometry.dispose();
            child.material.dispose();
          });
          this.scene.remove(beam);
          if (beam.userData.onComplete) beam.userData.onComplete();
          return false;
        }
        return true;
      }

      // Reveal segments sequentially
      beam.children.forEach(child => {
        const delay = child.userData.revealDelay;
        if (elapsed > delay) {
          const segProgress = Math.min((elapsed - delay) / 300, 1);
          child.material.opacity = segProgress * 0.8;
        }
      });

      return true;
    });
  }

  /**
   * Change a node's color with animation
   */
  transitionNodeColor(nodeId, newColor, duration = 800) {
    const mesh = this.nodeMap.get(nodeId);
    if (!mesh) return;

    const startColor = mesh.material.color.clone();
    const endColor = new THREE.Color(newColor);
    const startEmissive = mesh.material.emissive.clone();
    const startTime = performance.now();

    const animate = () => {
      const t = Math.min((performance.now() - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      mesh.material.color.lerpColors(startColor, endColor, ease);
      mesh.material.emissive.lerpColors(startEmissive, endColor, ease);
      mesh.userData.baseColor.copy(endColor);

      // Update glow child
      if (mesh.children[0]) {
        mesh.children[0].material.color.copy(mesh.material.color);
      }

      if (t < 1) requestAnimationFrame(animate);
    };
    animate();
  }

  /**
   * Flash an edge to indicate weight correction
   */
  flashEdge(sourceId, targetId, flashColor = '#ff3355', newWeight = null) {
    const edgeId = `${sourceId}_${targetId}`;
    const line = this.edgeMap.get(edgeId);
    if (!line) return;

    // Flash
    line.material.color.set(flashColor);
    line.material.opacity = 1.0;

    // Update weight
    if (newWeight !== null) {
      line.userData.weight = newWeight;
      const isPositive = newWeight >= 0;
      const newColor = isPositive ? new THREE.Color(0x00ff88) : new THREE.Color(0xff3355);
      line.userData.baseColor.copy(newColor);
    }

    // Fade back
    setTimeout(() => {
      line.material.color.copy(line.userData.baseColor);
      line.material.opacity = 0.15 + Math.abs(line.userData.weight) * 0.35;
    }, 600);
  }

  /**
   * Focus camera on a specific node
   */
  focusOnNode(nodeId) {
    const mesh = this.nodeMap.get(nodeId);
    if (!mesh) return;

    const offset = new THREE.Vector3(15, 10, 15);
    const target = mesh.position.clone().add(offset);
    this.sceneManager.animateCameraTo(target, 1500);
    this.sceneManager.controls.target.copy(mesh.position);
  }

  /**
   * Reset camera to default overview
   */
  resetCamera() {
    this.sceneManager.animateCameraTo(new THREE.Vector3(0, 30, 80), 1500);
    this.sceneManager.controls.target.set(0, 0, 0);
  }
}

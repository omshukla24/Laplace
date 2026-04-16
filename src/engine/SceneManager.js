/**
 * SceneManager.js — Three.js scene, camera, renderer, post-processing, and starfield.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.animationCallbacks = [];

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initControls();
    this.initLights();
    this.initStarfield();
    this.initPostProcessing();
    this.initResize();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050810);
    this.scene.fog = new THREE.FogExp2(0x050810, 0.0015);
  }

  initCamera() {
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 30, 80);
    this.camera.lookAt(0, 0, 0);
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.8;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI * 0.85;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;
  }

  initLights() {
    // Subtle ambient
    const ambient = new THREE.AmbientLight(0x111827, 0.5);
    this.scene.add(ambient);

    // Key light (cool blue)
    const keyLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    keyLight.position.set(50, 50, 50);
    this.scene.add(keyLight);

    // Fill light (warm)
    const fillLight = new THREE.DirectionalLight(0xff8844, 0.15);
    fillLight.position.set(-50, -20, -50);
    this.scene.add(fillLight);
  }

  initStarfield() {
    const starCount = 8000;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      // Distribute in a large sphere
      const radius = 300 + Math.random() * 700;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      sizes[i] = Math.random() * 2 + 0.5;

      // Slightly colored stars
      const temp = Math.random();
      if (temp < 0.3) {
        colors[i3] = 0.7; colors[i3 + 1] = 0.8; colors[i3 + 2] = 1.0; // Blue
      } else if (temp < 0.6) {
        colors[i3] = 1.0; colors[i3 + 1] = 1.0; colors[i3 + 2] = 0.9; // White
      } else {
        colors[i3] = 1.0; colors[i3 + 1] = 0.9; colors[i3 + 2] = 0.7; // Warm
      }
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMaterial = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starfield = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starfield);
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.8,  // strength
      0.4,  // radius
      0.85  // threshold
    );
    this.composer.addPass(this.bloomPass);
  }

  initResize() {
    this._onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  /**
   * Register an animation callback
   * @param {Function} callback - Receives (deltaTime, elapsedTime)
   */
  onAnimate(callback) {
    this.animationCallbacks.push(callback);
  }

  /**
   * Start the render loop
   */
  start() {
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();

      // Update controls
      this.controls.update();

      // Slowly rotate starfield
      if (this.starfield) {
        this.starfield.rotation.y += delta * 0.01;
      }

      // Run animation callbacks
      this.animationCallbacks.forEach(cb => cb(delta, elapsed));

      // Render with post-processing
      this.composer.render();
    };

    animate();
  }

  /**
   * Animate camera to a new position
   */
  animateCameraTo(target, duration = 2000) {
    const startPos = this.camera.position.clone();
    const startTime = performance.now();

    const animate = () => {
      const now = performance.now();
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic

      this.camera.position.lerpVectors(startPos, target, ease);

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.controls.dispose();
  }
}

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CandidateSite, LanderProfile } from '../types';
import { assessLandingSiteRisk } from '../engine/riskEngine';
import { 
  Compass, 
  Layers, 
  RotateCw, 
  ZoomIn, 
  Maximize2, 
  Info
} from 'lucide-react';

interface LunarGlobe3DProps {
  sites: CandidateSite[];
  selectedSite: CandidateSite;
  onSelectSite: (site: CandidateSite) => void;
  sunIlluminationOffset?: number; // Days offset
  lander?: LanderProfile;
}

const MOON_RADIUS = 3.5;

// Convert Lunar latitude & longitude to 3D Cartesian coordinates
function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Generate photorealistic procedural Moon surface texture
function createLunarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // 1. Base Lunar Regolith
  ctx.fillStyle = '#64748b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Regolith micro-noise
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 28;
    const baseVal = 105 + noise;
    data[i] = baseVal;
    data[i + 1] = baseVal;
    data[i + 2] = baseVal + 3; // slight lunar bluish-slate tint
    data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // 2. Major Lunar Maria (Dark Basaltic Plains)
  const maria = [
    { x: 780, y: 340, rx: 240, ry: 190, dark: 0.38 }, // Oceanus Procellarum
    { x: 1080, y: 390, rx: 110, ry: 90, dark: 0.42 },  // Mare Tranquillitatis
    { x: 1040, y: 310, rx: 100, ry: 80, dark: 0.40 },  // Mare Serenitatis
    { x: 1240, y: 370, rx: 70, ry: 60, dark: 0.45 },   // Mare Crisium
    { x: 920, y: 460, rx: 120, ry: 90, dark: 0.35 },   // Mare Nubium
    { x: 1024, y: 880, rx: 280, ry: 100, dark: 0.55 }, // South Pole - Aitken Basin
  ];

  maria.forEach(m => {
    const grad = ctx.createRadialGradient(m.x, m.y, 10, m.x, m.y, Math.max(m.rx, m.ry));
    grad.addColorStop(0, `rgba(15, 23, 42, ${m.dark})`);
    grad.addColorStop(0.7, `rgba(30, 41, 59, ${m.dark * 0.6})`);
    grad.addColorStop(1, 'rgba(51, 65, 85, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. Procedural Craters & Ejecta Rays
  const craters = [
    { x: 980, y: 650, r: 24, rays: true },  // Tycho Crater
    { x: 820, y: 430, r: 20, rays: true },  // Copernicus
    { x: 740, y: 390, r: 18, rays: false }, // Kepler
    // South Pole Artemis interest craters
    { x: 1024, y: 990, r: 26, rays: true }, // Shackleton Crater area
    { x: 1060, y: 960, r: 22, rays: false }, // Malapert Mountain area
    { x: 1180, y: 970, r: 20, rays: false }, // Nobile Crater
    { x: 920, y: 980, r: 19, rays: false },  // Connecting Ridge area
  ];

  craters.forEach(c => {
    // Crater floor
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();

    // Crater bright rim
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.stroke();

    // Ejecta rays
    if (c.rays) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.25)';
      ctx.lineWidth = 1.2;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(
          c.x + Math.cos(angle) * (c.r * 6 + Math.random() * 40),
          c.y + Math.sin(angle) * (c.r * 6 + Math.random() * 40)
        );
        ctx.stroke();
      }
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// Generate NASA LOLA Slope Heatmap Texture (Green <5°, Yellow 5-15°, Red >15°)
function createLolaSlopeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Default moderate slope baseline (Yellow/Greenish rolling terrain)
  ctx.fillStyle = '#064e3b'; // Flat regolith base (<5 deg safe)
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Steep rugged highlands & crater walls (Red >15° and Amber 5-15°)
  const ruggedZones = [
    // South Pole rugged terrain
    { x: 1024, y: 950, rx: 350, ry: 74, color: '#b45309' }, // south pole ring (amber)
    { x: 1024, y: 990, rx: 28, ry: 20, color: '#dc2626' },  // Shackleton steep inner wall
    { x: 1180, y: 970, rx: 35, ry: 25, color: '#dc2626' },  // Nobile crater hazardous slopes
    { x: 1060, y: 960, rx: 25, ry: 20, color: '#f59e0b' },  // Malapert mountain flanks
    { x: 920, y: 980, rx: 30, ry: 15, color: '#f59e0b' },   // Connecting ridge flank
    // Equatorial highlands
    { x: 1400, y: 500, rx: 300, ry: 200, color: '#d97706' },
    { x: 400, y: 400, rx: 250, ry: 180, color: '#b45309' },
  ];

  ruggedZones.forEach(z => {
    const grad = ctx.createRadialGradient(z.x, z.y, 5, z.x, z.y, Math.max(z.rx, z.ry));
    grad.addColorStop(0, z.color);
    grad.addColorStop(0.7, '#f59e0b');
    grad.addColorStop(1, '#059669');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, z.rx, z.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Flat Safe Maria (< 3° Slope - Deep Green)
  const safeFlatMaria = [
    { x: 1080, y: 390, rx: 120, ry: 90 }, // Mare Tranquillitatis (Apollo 11 - extremely flat)
    { x: 780, y: 340, rx: 220, ry: 170 },  // Oceanus Procellarum
    { x: 1040, y: 310, rx: 90, ry: 70 },
  ];

  safeFlatMaria.forEach(m => {
    const grad = ctx.createRadialGradient(m.x, m.y, 10, m.x, m.y, Math.max(m.rx, m.ry));
    grad.addColorStop(0, '#10b981'); // Safe green
    grad.addColorStop(0.8, '#059669');
    grad.addColorStop(1, '#047857');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export const LunarGlobe3D: React.FC<LunarGlobe3DProps> = ({
  sites,
  selectedSite,
  onSelectSite,
  sunIlluminationOffset = 0,
  lander,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [showSlopeHeatmap, setShowSlopeHeatmap] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [isZoomedIn, setIsZoomedIn] = useState<boolean>(false);
  const [hoveredSite, setHoveredSite] = useState<CandidateSite | null>(null);

  // References to keep Three.js scene instances across re-renders
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const moonMeshRef = useRef<THREE.Mesh | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const landingZonesGroupRef = useRef<THREE.Group | null>(null);

  // Animation target states for smooth camera fly-to
  const animTargetCamPos = useRef<THREE.Vector3 | null>(null);
  const animTargetControlsTarget = useRef<THREE.Vector3 | null>(null);

  // Textures
  const naturalTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const slopeTextureRef = useRef<THREE.CanvasTexture | null>(null);

  // Fly camera to a specific landing site
  const flyToSite = useCallback((site: CandidateSite) => {
    if (!controlsRef.current || !cameraRef.current) return;
    const siteSurfacePos = latLonToVector3(site.coordinates.latitude, site.coordinates.longitude, MOON_RADIUS);
    const outwardNormal = siteSurfacePos.clone().normalize();
    // Position camera 1.8 units away from site surface (close descent inspection view)
    const targetCamPos = siteSurfacePos.clone().add(outwardNormal.multiplyScalar(2.0));
    
    animTargetCamPos.current = targetCamPos;
    animTargetControlsTarget.current = siteSurfacePos.clone();
    setIsZoomedIn(true);
  }, []);

  // Fly back out to orbital global overview
  const resetToGlobalView = useCallback(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    // Overview angled towards South Pole where Artemis sites cluster
    animTargetCamPos.current = new THREE.Vector3(0, -6.5, 7.5);
    animTargetControlsTarget.current = new THREE.Vector3(0, 0, 0);
    setIsZoomedIn(false);
  }, []);

  // Zoom specifically to Artemis South Pole
  const zoomToSouthPole = useCallback(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    animTargetCamPos.current = new THREE.Vector3(0, -5.8, 1.8);
    animTargetControlsTarget.current = new THREE.Vector3(0, -MOON_RADIUS, 0);
    setIsZoomedIn(true);
  }, []);

  // Setup Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight || 520;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, -5.5, 8.0); // Initial view angled toward south pole
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4.2;  // Close descent zoom
    controls.maxDistance = 16.0; // Distant orbital view
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.12);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.5);
    dirLight.position.set(10, 2, 5);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // Earthshine subtle fill light on dark side
    const earthshineLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    earthshineLight.position.set(-10, -2, -5);
    scene.add(earthshineLight);

    // 6. Textures & Moon Sphere
    naturalTextureRef.current = createLunarTexture();
    slopeTextureRef.current = createLolaSlopeTexture();

    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 64);
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: slopeTextureRef.current,
      roughness: 0.85,
      metalness: 0.1,
    });
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    scene.add(moonMesh);
    moonMeshRef.current = moonMesh;

    // Subtle atmospheric / limb glow halo
    const glowGeometry = new THREE.SphereGeometry(MOON_RADIUS * 1.018, 48, 48);
    const glowMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.68 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
          gl_FragColor = vec4(0.2, 0.7, 1.0, 1.0) * intensity * 0.45;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(glowMesh);

    // 7. Interactive Site Pins Group
    const pinsGroup = new THREE.Group();
    scene.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    // 8. High-Res Landing Zones Group (Footprint boundaries)
    const landingZonesGroup = new THREE.Group();
    scene.add(landingZonesGroup);
    landingZonesGroupRef.current = landingZonesGroup;

    // 9. Raycaster for clicking 3D pins
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(pinsGroup.children, true);

      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData?.site) {
          obj = obj.parent;
        }
        if (obj && obj.userData?.site) {
          onSelectSite(obj.userData.site);
        }
      }
    };

    const handlePointerMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(pinsGroup.children, true);

      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData?.site) {
          obj = obj.parent;
        }
        if (obj && obj.userData?.site) {
          setHoveredSite(obj.userData.site);
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredSite(null);
      renderer.domElement.style.cursor = 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    // 10. Resize handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight || 520;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    // 11. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth Camera Fly-To Interpolation
      if (animTargetCamPos.current && animTargetControlsTarget.current) {
        camera.position.lerp(animTargetCamPos.current, 0.06);
        controls.target.lerp(animTargetControlsTarget.current, 0.06);

        if (camera.position.distanceTo(animTargetCamPos.current) < 0.04) {
          animTargetCamPos.current = null;
          animTargetControlsTarget.current = null;
        }
      }

      // Idle Auto-Rotation
      if (autoRotate && !animTargetCamPos.current) {
        moonMesh.rotation.y += 0.002;
        glowMesh.rotation.y += 0.002;
        pinsGroup.rotation.y += 0.002;
        landingZonesGroup.rotation.y += 0.002;
      }

      // Animate pulsing landing beacon rings
      pinsGroup.children.forEach(pin => {
        const ring = pin.getObjectByName('pulseRing');
        if (ring) {
          const scale = 1.0 + Math.sin(elapsed * 4.0) * 0.25;
          ring.scale.set(scale, scale, scale);
        }
      });

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      }
      controls.dispose();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, []); // Run once on mount

  // Update Sunlight Position according to simulated offset
  useEffect(() => {
    if (!dirLightRef.current) return;
    const angle = (sunIlluminationOffset * 0.2) + Math.PI * 0.25;
    dirLightRef.current.position.set(
      Math.cos(angle) * 12,
      2,
      Math.sin(angle) * 12
    );
  }, [sunIlluminationOffset]);

  // Update Material texture when slope heatmap toggle changes
  useEffect(() => {
    if (!moonMeshRef.current) return;
    const mat = moonMeshRef.current.material as THREE.MeshStandardMaterial;
    if (showSlopeHeatmap && slopeTextureRef.current) {
      mat.map = slopeTextureRef.current;
    } else if (naturalTextureRef.current) {
      mat.map = naturalTextureRef.current;
    }
    mat.needsUpdate = true;
  }, [showSlopeHeatmap]);

  // Re-build 3D Pins & Landing Footprints whenever sites or selectedSite changes
  useEffect(() => {
    const pinsGroup = pinsGroupRef.current;
    const landingZonesGroup = landingZonesGroupRef.current;
    if (!pinsGroup || !landingZonesGroup) return;

    // Clear previous pins
    while (pinsGroup.children.length > 0) {
      pinsGroup.remove(pinsGroup.children[0]);
    }
    while (landingZonesGroup.children.length > 0) {
      landingZonesGroup.remove(landingZonesGroup.children[0]);
    }

    sites.forEach(site => {
      const isSelected = site.id === selectedSite.id;
      const pos = latLonToVector3(site.coordinates.latitude, site.coordinates.longitude, MOON_RADIUS);
      const normal = pos.clone().normalize();

      const siteGroup = new THREE.Group();
      siteGroup.position.copy(pos);
      siteGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      siteGroup.userData = { site };

      // Pin Color according to site risk with selected lander
      const siteRisk = assessLandingSiteRisk(site, undefined, undefined, lander);
      let pinColor = 0x10b981; // Green
      if (siteRisk.overall_status === 'RED') {
        pinColor = 0xef4444; // Red
      } else if (siteRisk.overall_status === 'YELLOW') {
        pinColor = 0xf59e0b; // Yellow
      }

      // 1. Beacon Stem (Mast)
      const stemHeight = isSelected ? 0.38 : 0.26;
      const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, stemHeight, 8);
      const stemMat = new THREE.MeshBasicMaterial({ color: isSelected ? 0xffffff : 0x94a3b8 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.y = stemHeight / 2;
      siteGroup.add(stemMesh);

      // 2. Beacon Glowing Head (Sphere)
      const headRadius = isSelected ? 0.08 : 0.055;
      const headGeo = new THREE.SphereGeometry(headRadius, 16, 16);
      const headMat = new THREE.MeshBasicMaterial({ 
        color: pinColor,
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.y = stemHeight;
      siteGroup.add(headMesh);

      // 3. Ground Landing Radar Target Circle (Pulsing ring)
      const ringGeo = new THREE.RingGeometry(0.08, 0.11, 24);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: pinColor, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.5,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.01;
      ringMesh.name = 'pulseRing';
      siteGroup.add(ringMesh);

      // 4. Outer Target Concentric Marker for Selected Site
      if (isSelected) {
        const outerRingGeo = new THREE.RingGeometry(0.16, 0.18, 32);
        const outerRingMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.8,
        });
        const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
        outerRing.rotation.x = Math.PI / 2;
        outerRing.position.y = 0.012;
        siteGroup.add(outerRing);
      }

      pinsGroup.add(siteGroup);

      // 5. Landing Footprint Zone with Slope Visualisation around selected site
      if (isSelected) {
        const zoneGroup = new THREE.Group();
        zoneGroup.position.copy(pos);
        zoneGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

        // Circular landing ellipse boundary (1 km nominal radius)
        const ellipseGeo = new THREE.RingGeometry(0.24, 0.28, 36);
        const ellipseMat = new THREE.MeshBasicMaterial({
          color: pinColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const ellipseMesh = new THREE.Mesh(ellipseGeo, ellipseMat);
        ellipseMesh.rotation.x = Math.PI / 2;
        ellipseMesh.position.y = 0.015;
        zoneGroup.add(ellipseMesh);

        // Crosshairs in landing target
        const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
        const crosshairPoints = [
          new THREE.Vector3(-0.35, 0.015, 0),
          new THREE.Vector3(0.35, 0.015, 0),
          new THREE.Vector3(0, 0.015, -0.35),
          new THREE.Vector3(0, 0.015, 0.35),
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(crosshairPoints);
        const crosshairs = new THREE.LineSegments(lineGeo, lineMat);
        zoneGroup.add(crosshairs);

        landingZonesGroup.add(zoneGroup);
      }
    });
  }, [sites, selectedSite, lander]);

  // When selectedSite changes externally, fly to it automatically
  useEffect(() => {
    flyToSite(selectedSite);
  }, [selectedSite, flyToSite]);

  return (
    <div className="relative w-full h-[520px] rounded-2xl overflow-hidden border border-slate-800 bg-space-950/80 shadow-2xl flex flex-col">
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Top HUD: Status Bar & Controls */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        {/* Left: View Mode Badge */}
        <div className="pointer-events-auto flex items-center gap-2 bg-space-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/80 text-xs font-mono text-slate-200 shadow-md">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>3D LUNAR VIEW: <span className="text-cyan-300 font-bold">{isZoomedIn ? 'DESCENT INSPECTION' : 'ORBITAL OVERVIEW'}</span></span>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Slope Map Toggle */}
          <button
            onClick={() => setShowSlopeHeatmap(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition shadow-md border ${
              showSlopeHeatmap 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' 
                : 'bg-space-900/85 text-slate-300 border-slate-700/80 hover:bg-space-800'
            }`}
            title="Toggle NASA LOLA Slope Heatmap"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>LOLA Slope: {showSlopeHeatmap ? 'ACTIVE' : 'NATURAL'}</span>
          </button>

          {/* Auto Rotate Toggle */}
          <button
            onClick={() => setAutoRotate(prev => !prev)}
            className={`p-2 rounded-lg text-xs transition border ${
              autoRotate 
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' 
                : 'bg-space-900/85 text-slate-400 border-slate-700/80 hover:text-slate-200'
            }`}
            title="Toggle Cinematic Orbit Rotation"
          >
            <RotateCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
          </button>

          {/* Zoom to South Pole */}
          <button
            onClick={zoomToSouthPole}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-space-900/85 hover:bg-space-800 border border-slate-700/80 text-xs font-mono text-slate-300 transition"
            title="Zoom into Artemis South Pole Target Zone"
          >
            <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
            <span>South Pole</span>
          </button>

          {/* Reset View */}
          <button
            onClick={resetToGlobalView}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-space-900/85 hover:bg-space-800 border border-slate-700/80 text-xs font-mono text-slate-300 transition"
            title="Reset to Full Lunar Globe View"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Hover Pin Tooltip HUD */}
      {hoveredSite && (
        <div className="absolute top-16 left-4 pointer-events-none bg-space-900/90 backdrop-blur-md px-3.5 py-2 rounded-lg border border-cyan-500/40 text-xs font-mono text-slate-200 shadow-xl flex items-center gap-2.5 animate-fadeIn">
          <div className={`w-2.5 h-2.5 rounded-full ${
            hoveredSite.terrain.slope_deg <= 6 ? 'bg-emerald-400' : hoveredSite.terrain.slope_deg <= 12 ? 'bg-amber-400' : 'bg-rose-400'
          }`} />
          <div>
            <div className="font-bold text-white">{hoveredSite.name}</div>
            <div className="text-[11px] text-slate-400">Slope: {hoveredSite.terrain.slope_deg}° • Illum: {hoveredSite.defaultIlluminationPct}%</div>
          </div>
        </div>
      )}

      {/* Bottom HUD: Dynamic Slope Legend & Coordinates Telemetry */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        {/* LOLA Slope Color Legend */}
        {showSlopeHeatmap && (
          <div className="pointer-events-auto bg-space-900/85 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-700/80 text-[11px] font-mono shadow-md flex items-center gap-4">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-cyan-400" /> LOLA Slope Index:
            </span>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>&lt; 5° (Safe)</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span>5°–15° (Caution)</span>
            </div>
            <div className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span>&gt; 15° (Hazard)</span>
            </div>
          </div>
        )}

        {/* Selected Site Coordinates Telemetry HUD */}
        <div className="pointer-events-auto ml-auto bg-space-900/85 backdrop-blur-md px-3.5 py-2 rounded-lg border border-slate-700/80 text-[11px] font-mono text-slate-300 shadow-md flex items-center gap-3">
          <span className="text-cyan-400 font-bold">{selectedSite.name}:</span>
          <span>Lat: {selectedSite.coordinates.latitude}°</span>
          <span>Lon: {selectedSite.coordinates.longitude}°</span>
          <span>Elev: {selectedSite.coordinates.elevation_m}m</span>
        </div>
      </div>

      {/* Interactive Helper Overlay note */}
      <div className="absolute bottom-16 right-4 pointer-events-none text-[10px] font-mono text-slate-500 bg-space-950/60 px-2 py-1 rounded border border-slate-800/40">
        Drag: Orbit • Scroll: Zoom • Click Pin: Fly to Site
      </div>
    </div>
  );
};

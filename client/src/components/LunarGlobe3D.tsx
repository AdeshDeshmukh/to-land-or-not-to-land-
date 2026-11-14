import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CandidateSite, LanderProfile } from '../types';
import { assessLandingSiteRisk } from '../engine/riskEngine';
import { vector3ToLatLon } from '../utils/lunarTelemetry';
import { 
  Compass, 
  Layers, 
  RotateCw, 
  ZoomIn, 
  Maximize2, 
  Info,
  MapPin
} from 'lucide-react';

interface LunarGlobe3DProps {
  sites: CandidateSite[];
  selectedSite: CandidateSite;
  onSelectSite: (site: CandidateSite) => void;
  sunIlluminationOffset?: number; // Days offset
  lander?: LanderProfile;
  onProbeCoordinate?: (lat: number, lon: number) => void;
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

// 1. Natural Lunar Texture: loads authentic NASA LRO LROC Polar 4K Photographic Mosaic
function loadNaturalLunarTexture(onLoad?: (texture: THREE.Texture) => void): THREE.Texture {
  const textureLoader = new THREE.TextureLoader();
  return textureLoader.load(
    '/textures/lroc_color_poles_4k.jpg',
    (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      if (onLoad) onLoad(tex);
    },
    undefined,
    () => {
      // Fallback to standard 2K map if 4K takes longer or fails
      textureLoader.load('/textures/lroc_color_2k.jpg', (fallbackTex) => {
        fallbackTex.wrapS = THREE.RepeatWrapping;
        fallbackTex.wrapT = THREE.ClampToEdgeWrapping;
        if (onLoad) onLoad(fallbackTex);
      });
    }
  );
}

// 2. LOLA Bump Map: loads authentic NASA LOLA elevation bump map for authentic crater rim relief
function loadLolaBumpMap(onLoad?: (texture: THREE.Texture) => void): THREE.Texture {
  const textureLoader = new THREE.TextureLoader();
  return textureLoader.load(
    '/textures/lola_bump_2k.jpg',
    (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      if (onLoad) onLoad(tex);
    }
  );
}

// 3. LOLA Slope Heatmap Texture: composites authentic NASA LRO LROC photographic surface with
// authentic NASA LOLA slope overlay (<5° safe green, 5-15° yellow, >15° red) and polar coordinate rings!
function createCompositeLolaSlopeTexture(onLoad?: (texture: THREE.Texture) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Immediate neutral dark regolith while authentic NASA 4K textures decode
  ctx.fillStyle = '#1c1f26';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.wrapS = THREE.RepeatWrapping;
  canvasTexture.wrapT = THREE.ClampToEdgeWrapping;

  let baseLoaded = false;
  let slopeLoaded = false;

  const baseImg = new Image();
  baseImg.crossOrigin = 'anonymous';
  const slopeImg = new Image();
  slopeImg.crossOrigin = 'anonymous';

  const renderComposite = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw authentic photographic Moon surface
    if (baseLoaded) {
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#1c1f26';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. Drape authentic NASA LOLA slope overlay (<5° green, 5-15° yellow, >15° red)
    if (slopeLoaded) {
      ctx.drawImage(slopeImg, 0, 0, canvas.width, canvas.height);

      // 3. Draw NASA MoonTrek-style Amber Polar Cartographic Grid Rings
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 6]);

      const southPoleY = 1000;
      const southPoleX = 1024;
      [40, 85, 140, 200].forEach(radius => {
        ctx.beginPath();
        ctx.ellipse(southPoleX, southPoleY, radius * 1.8, radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Radial meridians converging to pole
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        ctx.beginPath();
        ctx.moveTo(southPoleX, southPoleY);
        ctx.lineTo(
          southPoleX + Math.cos(angle) * 300,
          southPoleY + Math.sin(angle) * 180
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    canvasTexture.needsUpdate = true;
    if (onLoad) onLoad(canvasTexture);
  };

  baseImg.onload = () => {
    baseLoaded = true;
    renderComposite();
  };
  baseImg.onerror = () => {
    baseImg.src = '/textures/lroc_color_2k.jpg';
  };
  baseImg.src = '/textures/lroc_color_poles_4k.jpg';

  slopeImg.onload = () => {
    slopeLoaded = true;
    renderComposite();
  };
  slopeImg.src = '/textures/lola_slope_overlay_2k.png';

  return canvasTexture;
}

export const LunarGlobe3D: React.FC<LunarGlobe3DProps> = ({
  sites,
  selectedSite,
  onSelectSite,
  sunIlluminationOffset = 0,
  lander,
  onProbeCoordinate,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [showSlopeHeatmap, setShowSlopeHeatmap] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [isZoomedIn, setIsZoomedIn] = useState<boolean>(false);
  const [isProbeMode, setIsProbeMode] = useState<boolean>(false);
  const [hoveredSite, setHoveredSite] = useState<CandidateSite | null>(null);

  const isProbeModeRef = useRef<boolean>(false);
  isProbeModeRef.current = isProbeMode;

  const onProbeCoordinateRef = useRef(onProbeCoordinate);
  onProbeCoordinateRef.current = onProbeCoordinate;

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
  const naturalTextureRef = useRef<THREE.Texture | null>(null);
  const slopeTextureRef = useRef<THREE.Texture | null>(null);
  const bumpTextureRef = useRef<THREE.Texture | null>(null);

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

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

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

    // 6. Textures & Moon Sphere with authentic NASA datasets
    naturalTextureRef.current = loadNaturalLunarTexture((tex) => {
      if (!showSlopeHeatmap && moonMeshRef.current) {
        const mat = moonMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.map = tex;
        mat.needsUpdate = true;
      }
    });

    bumpTextureRef.current = loadLolaBumpMap((tex) => {
      if (moonMeshRef.current) {
        const mat = moonMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.bumpMap = tex;
        mat.bumpScale = 0.08;
        mat.needsUpdate = true;
      }
    });

    slopeTextureRef.current = createCompositeLolaSlopeTexture((tex) => {
      if (showSlopeHeatmap && moonMeshRef.current) {
        const mat = moonMeshRef.current.material as THREE.MeshStandardMaterial;
        mat.map = tex;
        mat.needsUpdate = true;
      }
    });

    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 64);
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: slopeTextureRef.current,
      bumpMap: bumpTextureRef.current,
      bumpScale: 0.08,
      roughness: 0.85,
      metalness: 0.04,
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

      // 1. Probe Mode: Click anywhere on Moon surface to probe coordinates
      if (isProbeModeRef.current && moonMeshRef.current) {
        const moonIntersects = raycaster.intersectObject(moonMeshRef.current);
        if (moonIntersects.length > 0) {
          const hit = moonIntersects[0].point;
          const { latitude, longitude } = vector3ToLatLon(hit.x, hit.y, hit.z, MOON_RADIUS);
          if (onProbeCoordinateRef.current) {
            onProbeCoordinateRef.current(latitude, longitude);
          }
          setIsProbeMode(false);
          return;
        }
      }

      // 2. Normal Mode: Click to select existing pins
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

      if (isProbeModeRef.current) {
        renderer.domElement.style.cursor = 'crosshair';
        return;
      }

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

    // 10. Resize handler & ResizeObserver
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

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
      resizeObserver.disconnect();
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      }
      controls.dispose();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, []); // Run once on mount

  // Update Sunlight Position according to simulated synodic offset
  useEffect(() => {
    if (!dirLightRef.current) return;
    // Synodic month is 29.53 days: advance full 2*PI across the period
    const synodicAngle = ((sunIlluminationOffset * 2 * Math.PI) / 29.53) + Math.PI * 0.25;
    // Lunar axial tilt (obliquity to ecliptic) is 1.54 deg, creating grazing polar sun angles
    const sunHeight = 1.0 + Math.sin(synodicAngle) * 0.35;
    dirLightRef.current.position.set(
      Math.cos(synodicAngle) * 14,
      sunHeight,
      Math.sin(synodicAngle) * 14
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
    <div className="relative w-full h-full overflow-hidden bg-space-950 flex flex-col">
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
          {/* Drop-a-Pin Coordinate Probe Mode Button */}
          <button
            onClick={() => setIsProbeMode(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition shadow-md border ${
              isProbeMode 
                ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] animate-pulse' 
                : 'bg-space-900/85 text-slate-300 border-slate-700/80 hover:bg-space-800'
            }`}
            title="Click anywhere on the 3D Moon to probe local landing parameters"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isProbeMode ? 'CLICK ON MOON' : 'PROBE MODE'}</span>
          </button>

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

      {/* Active Probe Banner */}
      {isProbeMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-cyan-950/90 border border-cyan-400 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-mono text-cyan-200 shadow-2xl flex items-center gap-2 animate-bounce z-10 pointer-events-none">
          <MapPin className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>Click anywhere on lunar surface to probe coordinates</span>
        </div>
      )}

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
      <div className="absolute bottom-16 right-4 pointer-events-none text-[10px] font-mono text-slate-400 bg-space-950/80 px-2.5 py-1 rounded-md border border-slate-800/60 shadow">
        NASA LRO LROC/LOLA Data • Drag: Orbit • Scroll: Zoom
      </div>
    </div>
  );
};

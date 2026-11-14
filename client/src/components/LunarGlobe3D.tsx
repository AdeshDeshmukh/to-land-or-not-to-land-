import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CandidateSite, LanderProfile, RiskLevel } from '../types';
import { assessLandingSiteRisk } from '../engine/riskEngine';
import {
  vector3ToLatLon,
  computeSiteIllumination,
  computeSiteEarthLos,
} from '../utils/lunarTelemetry';
import {
  Compass,
  RotateCw,
  ZoomIn,
  Maximize2,
  MapPin,
} from 'lucide-react';

interface LunarGlobe3DProps {
  sites: CandidateSite[];
  selectedSite: CandidateSite;
  onSelectSite: (site: CandidateSite) => void;
  sunIlluminationOffset?: number; // Days offset
  lander?: LanderProfile;
  onProbeCoordinate?: (lat: number, lon: number) => void;
  leftDrawerOpen?: boolean;
  rightDrawerOpen?: boolean;
}

interface TerrainGrid {
  width: number;
  height: number;
  slopeDeg: Float32Array;
  roughnessCode: Uint8Array; // 0 = LOW, 1 = MODERATE, 2 = HIGH
  baseIllumPct: Float32Array;
  baseEarthLos: Uint8Array; // 1 = LOS, 0 = blocked
}

interface ProjectedPin {
  site: CandidateSite;
  status: RiskLevel;
  illumPct: number;
  sx: number;
  sy: number;
  labelX: number;
  labelY: number;
  align: 'left' | 'right';
}

const MOON_RADIUS = 3.5;
const GRID_W = 512;
const GRID_H = 256;

const INITIAL_CAM_POS = new THREE.Vector3(6.8, -5.2, -1.5);

const SHORT_NAMES: Record<string, string> = {
  shackleton_rim: 'SHACKLETON',
  malapert_mountain: 'MALAPERT PK',
  nobile_crater_rim: 'NOBILE RGN',
  mare_tranquillitatis: 'APOLLO 11',
  connecting_ridge: 'CONN RIDGE',
};

const LABEL_OFFSETS: Record<string, { dx: number; dy: number; align: 'left' | 'right' }> = {
  shackleton_rim: { dx: -36, dy: -38, align: 'left' },
  connecting_ridge: { dx: -36, dy: 28, align: 'left' },
  malapert_mountain: { dx: 40, dy: -42, align: 'right' },
  nobile_crater_rim: { dx: 40, dy: 26, align: 'right' },
  mare_tranquillitatis: { dx: 34, dy: -22, align: 'right' },
};

// Convert Lunar latitude & longitude to 3D Cartesian coordinates
function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// 1. Monochrome High-Contrast Lunar Base Texture (LRO LROC 4K desaturated + LOLA contrast)
function createMonochromeLunarTexture(onLoad?: (texture: THREE.Texture) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#24262b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.wrapS = THREE.RepeatWrapping;
  canvasTexture.wrapT = THREE.ClampToEdgeWrapping;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  let triedFallback = false;

  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Strip any warm/teal tint -> pure high-contrast monochrome regolith
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const norm = lum / 255;
      const contrasted = Math.min(255, Math.max(0, Math.round(Math.pow(norm, 1.08) * 235 + 10)));
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    ctx.putImageData(imgData, 0, 0);

    canvasTexture.needsUpdate = true;
    if (onLoad) onLoad(canvasTexture);
  };

  img.onerror = () => {
    if (!triedFallback) {
      triedFallback = true;
      img.src = '/textures/lroc_color_2k.jpg';
    }
  };

  img.src = '/textures/lroc_color_poles_4k.jpg';
  return canvasTexture;
}

// 2. LOLA Bump Map: authentic crater relief
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

// 3. Build 512x256 lunar terrain parameter grid from LOLA elevation image + preset site regional anchors
function buildTerrainGrid(sites: CandidateSite[], bumpImg?: HTMLImageElement): TerrainGrid {
  const w = GRID_W;
  const h = GRID_H;
  const n = w * h;

  const elev = new Float32Array(n);

  if (bumpImg) {
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d')!;
    tctx.drawImage(bumpImg, 0, 0, w, h);
    const px = tctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < n; i++) {
      elev[i] = px[i * 4];
    }
  } else {
    // Immediate deterministic elevation seed before bump image finishes decoding
    for (let y = 0; y < h; y++) {
      const lat = 90 - ((y + 0.5) / h) * 180;
      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w) * 360 - 180;
        const val =
          128 +
          Math.sin(lat * 0.25 + lon * 0.18) * 32 +
          Math.cos(lon * 0.42 - lat * 0.31) * 24 +
          (Math.abs(lat) > 72 ? Math.sin(lon * 0.9) * 22 : 0);
        elev[y * w + x] = Math.max(0, Math.min(255, val));
      }
    }
  }

  const slopeDeg = new Float32Array(n);
  const roughnessCode = new Uint8Array(n);
  const baseIllumPct = new Float32Array(n);
  const baseEarthLos = new Uint8Array(n);

  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    const absLat = Math.abs(lat);
    const cosLat = Math.max(0.18, Math.cos((lat * Math.PI) / 180));
    const yUp = Math.max(0, y - 1);
    const yDn = Math.min(h - 1, y + 1);

    for (let x = 0; x < w; x++) {
      const xLt = (x - 1 + w) % w;
      const xRt = (x + 1) % w;
      const idx = y * w + x;
      const lon = ((x + 0.5) / w) * 360 - 180;
      const absLon = Math.abs(lon);

      const eC = elev[idx];
      const eL = elev[y * w + xLt];
      const eR = elev[y * w + xRt];
      const eU = elev[yUp * w + x];
      const eD = elev[yDn * w + x];

      const dx = (eR - eL) / (2 * cosLat);
      const dy = (eD - eU) / 2;
      const grad = Math.sqrt(dx * dx + dy * dy);
      const localMean = (eL + eR + eU + eD) * 0.25;
      const laplacian = Math.abs(eC - localMean);

      // Map gradient into realistic 1° - 22° lunar regional slopes
      const baseSlope = 1.6 + grad * 0.52 + (absLat > 78 ? 1.8 : 0);
      slopeDeg[idx] = Math.max(1.0, Math.min(22.0, baseSlope));

      // Roughness tier from local elevation curvature
      roughnessCode[idx] = laplacian > 7.5 || grad > 22 ? 2 : laplacian > 3.2 || grad > 11 ? 1 : 0;

      // Base Illumination %: grazing polar angles create strong peak vs crater floor contrast
      const relPeak = eC - localMean;
      let illum = 86 - absLat * 0.25 + relPeak * 1.15;
      if (absLat > 75) {
        illum = 58 + relPeak * 1.8 - grad * 0.85;
      }
      baseIllumPct[idx] = Math.max(12, Math.min(96, illum));

      // Base Direct Earth LOS (tidally locked Near Side + illuminated polar peaks)
      const nearSide = absLon <= 85;
      const polarRimPeak = absLat > 82 && nearSide && relPeak >= -1.2 && slopeDeg[idx] < 14;
      const equatorialClear = absLat <= 82 && nearSide;
      baseEarthLos[idx] = equatorialClear || polarRimPeak ? 1 : 0;
    }
  }

  // Blend Gaussian regional patches around each preset candidate site so the globe surface
  // around each marker mirrors that site's exact evaluated terrain & telemetry thresholds
  for (const site of sites) {
    const sLat = site.coordinates.latitude;
    const sLon = site.coordinates.longitude;
    const cosSiteLat = Math.max(0.08, Math.cos((sLat * Math.PI) / 180));
    const sigmaDeg = 5.2;
    const sigma2 = 2 * sigmaDeg * sigmaDeg;
    const siteRough =
      site.terrain.roughness === 'HIGH' ? 2 : site.terrain.roughness === 'MODERATE' ? 1 : 0;

    const minY = Math.max(0, Math.floor(((90 - (sLat + 14)) / 180) * h));
    const maxY = Math.min(h - 1, Math.ceil(((90 - (sLat - 14)) / 180) * h));

    for (let y = minY; y <= maxY; y++) {
      const lat = 90 - ((y + 0.5) / h) * 180;
      const dLat = lat - sLat;
      if (Math.abs(dLat) > 13) continue;

      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w) * 360 - 180;
        let dLon = lon - sLon;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        const scaledDLon = dLon * cosSiteLat;
        const d2 = dLat * dLat + scaledDLon * scaledDLon;
        if (d2 > 140) continue;

        const weight = Math.exp(-d2 / sigma2);
        if (weight < 0.05) continue;

        const idx = y * w + x;
        slopeDeg[idx] = slopeDeg[idx] * (1 - weight) + site.terrain.slope_deg * weight;
        baseIllumPct[idx] =
          baseIllumPct[idx] * (1 - weight) + site.defaultIlluminationPct * weight;
        if (weight > 0.45) {
          roughnessCode[idx] = siteRough;
          baseEarthLos[idx] = site.defaultEarthLos ? 1 : 0;
        }
      }
    }
  }

  return { width: w, height: h, slopeDeg, roughnessCode, baseIllumPct, baseEarthLos };
}

// 4. Write RYG assessment colors directly into the overlay CanvasTexture from live parameters + time
function paintDynamicOverlayTexture(
  grid: TerrainGrid,
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
  lander: LanderProfile | undefined,
  sunOffsetDays: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height, slopeDeg, roughnessCode, baseIllumPct, baseEarthLos } = grid;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const maxSlope = lander ? lander.maxSlopeDeg : 15.0;
  const cautionSlope = lander ? lander.maxSlopeDeg * 0.75 : 5.0;
  const minIllum = lander ? lander.minIlluminationPct : 70;
  const criticalIllum = lander ? lander.minIlluminationPct * 0.5 : 30;
  const requiresLos = lander ? lander.requiresEarthLos : true;
  const maxRoughCode =
    !lander ? 0 : lander.maxRoughness === 'HIGH' ? 2 : lander.maxRoughness === 'MODERATE' ? 1 : 0;

  const timeDeltaIllum =
    Math.abs(sunOffsetDays) < 0.05 ? 0 : -Math.sin(sunOffsetDays * 0.4) * 25;
  const timeLosBlocked = 12.5 + Math.sin(sunOffsetDays * 0.4) * 4.2 <= 0;

  const total = width * height;
  for (let i = 0; i < total; i++) {
    const s = slopeDeg[i];
    const r = roughnessCode[i];
    const ill = Math.max(5, Math.min(100, baseIllumPct[i] + timeDeltaIllum));
    const hasLos = !timeLosBlocked && baseEarthLos[i] === 1;

    let isRed = false;
    let isYellow = false;

    // 1. Slope check
    if (s > maxSlope) isRed = true;
    else if (s >= cautionSlope) isYellow = true;

    // 2. Illumination check
    if (!isRed) {
      if (ill < criticalIllum) isRed = true;
      else if (ill < minIllum) isYellow = true;
    }

    // 3. Roughness check
    if (!isRed) {
      if (lander) {
        if (r === 2) {
          if (maxRoughCode === 2) isYellow = true;
          else isRed = true;
        } else if (r === 1 && maxRoughCode === 0) {
          isYellow = true;
        }
      } else {
        if (r === 2) isRed = true;
        else if (r === 1) isYellow = true;
      }
    }

    // 4. Earth LOS check
    if (!isRed && !hasLos) {
      if (requiresLos) isRed = true;
      else isYellow = true;
    }

    const p = i * 4;
    if (isRed) {
      // Surgical Crimson #EF4444
      data[p] = 239;
      data[p + 1] = 68;
      data[p + 2] = 68;
      data[p + 3] = 210;
    } else if (isYellow) {
      // Surgical Amber #F59E0B
      data[p] = 245;
      data[p + 1] = 158;
      data[p + 2] = 11;
      data[p + 3] = 210;
    } else {
      // Surgical Emerald #10B981
      data[p] = 16;
      data[p + 1] = 185;
      data[p + 2] = 129;
      data[p + 3] = 205;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  texture.needsUpdate = true;
}

export const LunarGlobe3D: React.FC<LunarGlobe3DProps> = ({
  sites,
  selectedSite,
  onSelectSite,
  sunIlluminationOffset = 0,
  lander,
  onProbeCoordinate,
  leftDrawerOpen = false,
  rightDrawerOpen = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [showAssessmentOverlay, setShowAssessmentOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(55);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [isZoomedIn, setIsZoomedIn] = useState<boolean>(false);
  const [isProbeMode, setIsProbeMode] = useState<boolean>(false);
  const [hoveredSite, setHoveredSite] = useState<CandidateSite | null>(null);
  const [projectedPins, setProjectedPins] = useState<ProjectedPin[]>([]);

  const isProbeModeRef = useRef<boolean>(false);
  isProbeModeRef.current = isProbeMode;

  const onProbeCoordinateRef = useRef(onProbeCoordinate);
  onProbeCoordinateRef.current = onProbeCoordinate;

  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  // Dynamic telemetry snapshot per site for crisp 2D projected pins
  const siteMetricsMap = useMemo(() => {
    const map = new Map<string, { status: RiskLevel; illumPct: number }>();
    sites.forEach((site) => {
      const illumPct = computeSiteIllumination(site, sunIlluminationOffset);
      const hasLos = computeSiteEarthLos(site, sunIlluminationOffset);
      const risk = assessLandingSiteRisk(site, illumPct, hasLos, lander);
      map.set(site.id, { status: risk.overall_status, illumPct });
    });
    return map;
  }, [sites, sunIlluminationOffset, lander]);

  const siteMetricsRef = useRef(siteMetricsMap);
  siteMetricsRef.current = siteMetricsMap;

  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  const landerRef = useRef(lander);
  landerRef.current = lander;

  const sunOffsetRef = useRef(sunIlluminationOffset);
  sunOffsetRef.current = sunIlluminationOffset;

  // Scene & WebGL refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const moonMeshRef = useRef<THREE.Mesh | null>(null);
  const overlayMeshRef = useRef<THREE.Mesh | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const landingZonesGroupRef = useRef<THREE.Group | null>(null);

  // Terrain & Dynamic Overlay Canvas refs
  const terrainGridRef = useRef<TerrainGrid | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const bumpImgRef = useRef<HTMLImageElement | undefined>(undefined);

  // Camera fly-to refs
  const animTargetCamPos = useRef<THREE.Vector3 | null>(null);
  const animTargetControlsTarget = useRef<THREE.Vector3 | null>(null);
  const hasMountedFlyRef = useRef<boolean>(false);

  // Fly camera to a specific landing site
  const flyToSite = useCallback((site: CandidateSite) => {
    if (!controlsRef.current || !cameraRef.current) return;
    const siteSurfacePos = latLonToVector3(
      site.coordinates.latitude,
      site.coordinates.longitude,
      MOON_RADIUS
    );
    const outwardNormal = siteSurfacePos.clone().normalize();
    const targetCamPos = siteSurfacePos.clone().add(outwardNormal.multiplyScalar(2.4));

    animTargetCamPos.current = targetCamPos;
    animTargetControlsTarget.current = siteSurfacePos.clone();
    setIsZoomedIn(true);
  }, []);

  // Fly back out to orbital overview showing Near Side + South Pole
  const resetToGlobalView = useCallback(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    animTargetCamPos.current = INITIAL_CAM_POS.clone();
    animTargetControlsTarget.current = new THREE.Vector3(0, 0, 0);
    setIsZoomedIn(false);
  }, []);

  // Zoom directly over the Artemis South Pole cluster
  const zoomToSouthPole = useCallback(() => {
    if (!controlsRef.current || !cameraRef.current) return;
    animTargetCamPos.current = new THREE.Vector3(0.4, -5.8, -1.6);
    animTargetControlsTarget.current = new THREE.Vector3(0, -MOON_RADIUS, 0);
    setIsZoomedIn(true);
  }, []);

  // Setup Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.copy(INITIAL_CAM_POS);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4.2;
    controls.maxDistance = 16.0;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Monochrome lighting (crisp white solar directional light + faint neutral regolith bounce)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.08);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.6);
    dirLight.position.set(10, 2, 5);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const earthshineLight = new THREE.DirectionalLight(0x9ca3af, 0.08);
    earthshineLight.position.set(-10, -2, -5);
    scene.add(earthshineLight);

    // 1. Monochrome Lunar Base Sphere (high-contrast grayscale LROC + LOLA bump relief)
    const monoTexture = createMonochromeLunarTexture();
    const bumpTexture = loadLolaBumpMap();

    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 72, 72);
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: monoTexture,
      bumpMap: bumpTexture,
      bumpScale: 0.11,
      roughness: 0.9,
      metalness: 0.0,
    });
    const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
    scene.add(moonMesh);
    moonMeshRef.current = moonMesh;

    // 2. Separate Dynamic RYG Assessment Overlay Sphere
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = GRID_W;
    overlayCanvas.height = GRID_H;
    overlayCanvasRef.current = overlayCanvas;

    const overlayTexture = new THREE.CanvasTexture(overlayCanvas);
    overlayTexture.wrapS = THREE.RepeatWrapping;
    overlayTexture.wrapT = THREE.ClampToEdgeWrapping;
    overlayTexture.minFilter = THREE.LinearFilter;
    overlayTexture.magFilter = THREE.LinearFilter;
    overlayTextureRef.current = overlayTexture;

    const overlayGeo = new THREE.SphereGeometry(MOON_RADIUS * 1.002, 72, 72);
    const overlayMat = new THREE.MeshLambertMaterial({
      map: overlayTexture,
      transparent: true,
      opacity: (overlayOpacity / 100) * 0.75,
      depthWrite: false,
    });
    const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
    overlayMesh.visible = showAssessmentOverlay && overlayOpacity > 0;
    scene.add(overlayMesh);
    overlayMeshRef.current = overlayMesh;

    // Seed terrain grid immediately, then refine once /textures/lola_bump_2k.jpg loads
    terrainGridRef.current = buildTerrainGrid(sitesRef.current);
    paintDynamicOverlayTexture(
      terrainGridRef.current,
      overlayCanvas,
      overlayTexture,
      lander,
      sunIlluminationOffset
    );

    const bumpImg = new Image();
    bumpImg.crossOrigin = 'anonymous';
    bumpImg.onload = () => {
      bumpImgRef.current = bumpImg;
      terrainGridRef.current = buildTerrainGrid(sitesRef.current, bumpImg);
      if (overlayCanvasRef.current && overlayTextureRef.current) {
        paintDynamicOverlayTexture(
          terrainGridRef.current,
          overlayCanvasRef.current,
          overlayTextureRef.current,
          landerRef.current,
          sunOffsetRef.current
        );
      }
    };
    bumpImg.src = '/textures/lola_bump_2k.jpg';

    // 3. Pickable 3D Hit Spheres & Static Selected Target Ring
    const pinsGroup = new THREE.Group();
    scene.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    const landingZonesGroup = new THREE.Group();
    scene.add(landingZonesGroup);
    landingZonesGroupRef.current = landingZonesGroup;

    // 4. Raycaster for clicking pins or probing surface coordinates
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

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

      const intersects = raycaster.intersectObjects(pinsGroup.children, true);
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData?.site) {
          obj = obj.parent;
        }
        if (obj && obj.userData?.site) {
          onSelectSiteRef.current(obj.userData.site);
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

    // 5. ResizeObserver
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

    // 6. Screen-space projection for clean SpaceX telemetry markers & non-overlapping leader lines
    let lastProjectionSig = '';
    const camToSite = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    const surfaceNormal = new THREE.Vector3();
    const ndc = new THREE.Vector3();

    const computeProjectedPins = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const currentSites = sitesRef.current;
      const metricsMap = siteMetricsRef.current;

      const raw: ProjectedPin[] = [];
      for (const site of currentSites) {
        const localPos = latLonToVector3(
          site.coordinates.latitude,
          site.coordinates.longitude,
          MOON_RADIUS * 1.005
        );
        worldPos.copy(localPos).applyEuler(moonMesh.rotation);
        surfaceNormal.copy(worldPos).normalize();
        camToSite.copy(camera.position).sub(worldPos).normalize();

        // Hide markers behind the Moon horizon
        if (surfaceNormal.dot(camToSite) <= 0.02) continue;

        ndc.copy(worldPos).project(camera);
        if (ndc.z > 1) continue;

        const sx = (ndc.x * 0.5 + 0.5) * w;
        const sy = (-ndc.y * 0.5 + 0.5) * h;

        const offset = LABEL_OFFSETS[site.id] || {
          dx: ndc.x < 0 ? -36 : 36,
          dy: ndc.y > 0 ? 22 : -28,
          align: ndc.x < 0 ? ('left' as const) : ('right' as const),
        };

        const labelX =
          offset.align === 'left'
            ? Math.max(158, Math.min(w - 16, sx + offset.dx))
            : Math.max(16, Math.min(w - 158, sx + offset.dx));
        const labelY = Math.max(66, Math.min(h - 76, sy + offset.dy));
        const metric = metricsMap.get(site.id) || {
          status: 'GREEN' as RiskLevel,
          illumPct: site.defaultIlluminationPct,
        };

        raw.push({
          site,
          status: metric.status,
          illumPct: metric.illumPct,
          sx,
          sy,
          labelX,
          labelY,
          align: offset.align,
        });
      }

      // Vertical de-overlapping pass for left and right clusters so labels never collide
      const resolveOverlap = (items: ProjectedPin[]) => {
        items.sort((a, b) => a.labelY - b.labelY);
        const minGap = 28;
        for (let i = 1; i < items.length; i++) {
          if (
            Math.abs(items[i].labelX - items[i - 1].labelX) < 185 &&
            items[i].labelY - items[i - 1].labelY < minGap
          ) {
            items[i].labelY = Math.min(h - 76, items[i - 1].labelY + minGap);
          }
        }
      };

      resolveOverlap(raw.filter((p) => p.align === 'left'));
      resolveOverlap(raw.filter((p) => p.align === 'right'));

      const sig = raw
        .map(
          (p) =>
            `${p.site.id}:${p.status}:${p.illumPct}:${Math.round(p.sx)}:${Math.round(p.sy)}:${Math.round(p.labelY)}`
        )
        .join('|');

      if (sig !== lastProjectionSig) {
        lastProjectionSig = sig;
        setProjectedPins(raw);
      }
    };

    // 7. Render Loop (strictly non-blinking)
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (animTargetCamPos.current && animTargetControlsTarget.current) {
        camera.position.lerp(animTargetCamPos.current, 0.06);
        controls.target.lerp(animTargetControlsTarget.current, 0.06);

        if (camera.position.distanceTo(animTargetCamPos.current) < 0.04) {
          animTargetCamPos.current = null;
          animTargetControlsTarget.current = null;
        }
      }

      if (autoRotateRef.current && !animTargetCamPos.current) {
        moonMesh.rotation.y += 0.0018;
        overlayMesh.rotation.y += 0.0018;
        pinsGroup.rotation.y += 0.0018;
        landingZonesGroup.rotation.y += 0.0018;
      }

      controls.update();
      renderer.render(scene, camera);
      computeProjectedPins();
    };
    animate();

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

  // Sync Overlay visibility & smooth opacity
  useEffect(() => {
    const mesh = overlayMeshRef.current;
    if (!mesh) return;
    mesh.visible = showAssessmentOverlay && overlayOpacity > 0;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    mat.opacity = (overlayOpacity / 100) * 0.75;
    mat.needsUpdate = true;
  }, [showAssessmentOverlay, overlayOpacity]);

  // Recompute RYG Assessment Overlay whenever landing parameters, sites, or synodic date offset changes
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const tex = overlayTextureRef.current;
    if (!canvas || !tex) return;

    if (!terrainGridRef.current || sites.length !== 5) {
      terrainGridRef.current = buildTerrainGrid(sites, bumpImgRef.current);
    }

    paintDynamicOverlayTexture(
      terrainGridRef.current,
      canvas,
      tex,
      lander,
      sunIlluminationOffset
    );
  }, [lander, sunIlluminationOffset, sites]);

  // Update Sunlight Terminator Position according to simulated synodic offset
  useEffect(() => {
    if (!dirLightRef.current) return;
    const synodicAngle = (sunIlluminationOffset * 2 * Math.PI) / 29.53 + Math.PI * 0.25;
    const sunHeight = 1.0 + Math.sin(synodicAngle) * 0.35;
    dirLightRef.current.position.set(
      Math.cos(synodicAngle) * 14,
      sunHeight,
      Math.sin(synodicAngle) * 14
    );
  }, [sunIlluminationOffset]);

  // Rebuild pick spheres & single static thin ring around ONLY the selected site
  useEffect(() => {
    const pinsGroup = pinsGroupRef.current;
    const landingZonesGroup = landingZonesGroupRef.current;
    if (!pinsGroup || !landingZonesGroup) return;

    while (pinsGroup.children.length > 0) {
      pinsGroup.remove(pinsGroup.children[0]);
    }
    while (landingZonesGroup.children.length > 0) {
      landingZonesGroup.remove(landingZonesGroup.children[0]);
    }

    sites.forEach((site) => {
      const isSelected = site.id === selectedSite.id;
      const pos = latLonToVector3(
        site.coordinates.latitude,
        site.coordinates.longitude,
        MOON_RADIUS * 1.005
      );
      const normal = pos.clone().normalize();

      // Invisible surface hit target for 3D raycasting
      const hitGeo = new THREE.SphereGeometry(0.11, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.copy(pos);
      hitMesh.userData = { site };
      pinsGroup.add(hitMesh);

      // Static thin ring around the currently selected site ONLY
      if (isSelected) {
        const ringGeo = new THREE.RingGeometry(0.095, 0.11, 48);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(pos);
        ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        ringMesh.rotateX(Math.PI / 2);
        landingZonesGroup.add(ringMesh);
      }
    });
  }, [sites, selectedSite]);

  // Only fly camera when user changes selectedSite after initial orbital overview
  useEffect(() => {
    if (!hasMountedFlyRef.current) {
      hasMountedFlyRef.current = true;
      return;
    }
    flyToSite(selectedSite);
  }, [selectedSite, flyToSite]);

  const statusHex = (status: RiskLevel) => {
    if (status === 'RED') return '#EF4444';
    if (status === 'YELLOW') return '#F59E0B';
    return '#10B981';
  };

  const hoveredMetric = hoveredSite ? siteMetricsMap.get(hoveredSite.id) : null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black flex flex-col">
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Projected Screen-Space SpaceX Telemetry Markers (Non-Blinking) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {/* SVG Leader Lines */}
        <svg className="absolute inset-0 w-full h-full">
          {projectedPins.map((pin) => {
            const isSelected = pin.site.id === selectedSite.id;
            return (
              <line
                key={`line-${pin.site.id}`}
                x1={pin.sx}
                y1={pin.sy}
                x2={pin.labelX}
                y2={pin.labelY}
                stroke={isSelected ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.32)'}
                strokeWidth={1}
              />
            );
          })}
        </svg>

        {/* Crisp Telemetry Dots + Static Ring (Selected Only) + Offset Labels */}
        {projectedPins.map((pin) => {
          const isSelected = pin.site.id === selectedSite.id;
          const hex = statusHex(pin.status);
          const shortName = SHORT_NAMES[pin.site.id] || pin.site.name.toUpperCase().slice(0, 12);

          return (
            <React.Fragment key={pin.site.id}>
              {/* 7px Dot with 1px white border + optional static selection ring */}
              <div
                style={{
                  position: 'absolute',
                  left: pin.sx,
                  top: pin.sy,
                  transform: 'translate(-50%, -50%)',
                }}
                className="pointer-events-auto cursor-pointer flex items-center justify-center"
                onClick={() => onSelectSite(pin.site)}
                onMouseEnter={() => setHoveredSite(pin.site)}
                onMouseLeave={() => setHoveredSite(null)}
              >
                {isSelected && (
                  <span
                    className="absolute w-[19px] h-[19px] rounded-full border border-white/90"
                    aria-hidden="true"
                  />
                )}
                <span
                  style={{ backgroundColor: hex }}
                  className="w-[7px] h-[7px] rounded-full border border-white block"
                />
              </div>

              {/* Crisp Carbon Leader-Line Label */}
              <button
                type="button"
                onClick={() => onSelectSite(pin.site)}
                onMouseEnter={() => setHoveredSite(pin.site)}
                onMouseLeave={() => setHoveredSite(null)}
                style={{
                  position: 'absolute',
                  left: pin.labelX,
                  top: pin.labelY,
                  transform:
                    pin.align === 'left' ? 'translate(-100%, -50%)' : 'translate(0, -50%)',
                }}
                className={`pointer-events-auto cursor-pointer flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors ${
                  isSelected
                    ? 'bg-[#090A0D] border-white/60 text-white'
                    : 'bg-[#090A0D]/90 border-white/[0.14] text-[#9CA3AF] hover:text-white hover:border-white/35'
                }`}
              >
                <span
                  style={{ backgroundColor: hex }}
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                />
                <span className="font-semibold text-white">{shortName}</span>
                <span className="text-[#6B7280] tabular-nums">
                  {pin.site.terrain.slope_deg.toFixed(1)}° · {pin.illumPct}%
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Top HUD: View Mode, Floating Overlay Control Pill, Camera Actions */}
      <div
        className={`absolute top-3 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} ${rightDrawerOpen ? 'lg:right-[512px] right-3' : 'right-3'} flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20 transition-all duration-300`}
      >
        {/* Left: View Mode Readout */}
        <div className="pointer-events-auto flex items-center gap-2 bg-[#090A0D]/95 px-2.5 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF]">
          <Compass className="w-3.5 h-3.5 text-white" />
          <span>
            VIEW //{' '}
            <span className="text-white font-semibold">
              {isZoomedIn ? 'DESCENT INSPECTION' : 'ORBITAL OVERVIEW'}
            </span>
          </span>
        </div>

        {/* Center: Floating HUD Overlay Control Pill */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 bg-[#090A0D]/95 px-3 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setShowAssessmentOverlay((prev) => !prev)}
            aria-pressed={showAssessmentOverlay}
            className="flex items-center gap-2 text-white hover:opacity-90 transition"
            title="Toggle dynamic Red / Yellow / Green landing assessment overlay"
          >
            <span className="text-[#9CA3AF]">Landing Assessment Overlay:</span>
            <span
              className={`px-1.5 py-0.5 rounded-[2px] border font-bold ${
                showAssessmentOverlay
                  ? 'bg-white text-black border-white'
                  : 'bg-[#12141A] text-[#9CA3AF] border-white/[0.14]'
              }`}
            >
              {showAssessmentOverlay ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="h-3.5 w-px bg-white/[0.14] hidden sm:block" />

          <div className="flex items-center gap-2">
            <label htmlFor="overlay-opacity-slider" className="text-[#9CA3AF] whitespace-nowrap">
              Overlay Opacity
            </label>
            <input
              id="overlay-opacity-slider"
              type="range"
              min={0}
              max={100}
              step={1}
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-white font-bold tabular-nums w-8 text-right">
              {overlayOpacity}%
            </span>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={() => setIsProbeMode((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition border ${
              isProbeMode
                ? 'bg-white text-black font-bold border-white'
                : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/35'
            }`}
            title="Click anywhere on the lunar surface to probe local terrain parameters"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isProbeMode ? 'CLICK SURFACE' : 'PROBE'}</span>
          </button>

          <button
            onClick={() => setAutoRotate((prev) => !prev)}
            className={`p-1.5 rounded-[2px] text-[10px] transition border ${
              autoRotate
                ? 'bg-white text-black border-white'
                : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/35'
            }`}
            title="Toggle orbital rotation"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={zoomToSouthPole}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/[0.14] hover:border-white/35 text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] hover:text-white transition"
            title="Zoom into Artemis South Pole cluster"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>South Pole</span>
          </button>

          <button
            onClick={resetToGlobalView}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/[0.14] hover:border-white/35 text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] hover:text-white transition"
            title="Reset to orbital overview"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Active Probe Banner */}
      {isProbeMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-[#090A0D]/95 border border-white/40 px-3.5 py-1 rounded-[2px] text-[10px] font-mono uppercase tracking-wider text-white flex items-center gap-2 z-20 pointer-events-none">
          <MapPin className="w-3.5 h-3.5 text-white" />
          <span>Click anywhere on lunar surface to probe coordinates</span>
        </div>
      )}

      {/* Hover Pin Tooltip HUD */}
      {hoveredSite && hoveredMetric && (
        <div
          className={`absolute top-14 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} pointer-events-none bg-[#090A0D]/95 px-3 py-1.5 rounded-[2px] border border-white/[0.14] text-[11px] font-mono text-white flex items-center gap-2 z-20 transition-all duration-300`}
        >
          <div
            style={{ backgroundColor: statusHex(hoveredMetric.status) }}
            className="w-2 h-2 rounded-full border border-white shrink-0"
          />
          <div>
            <div className="font-bold uppercase tracking-wider text-white">{hoveredSite.name}</div>
            <div className="text-[10px] text-[#9CA3AF] tabular-nums">
              SLOPE {hoveredSite.terrain.slope_deg.toFixed(1)}° · ILLUM {hoveredMetric.illumPct}% ·{' '}
              {hoveredSite.defaultEarthLos ? 'DTE OK' : 'NO DTE'}
            </div>
          </div>
        </div>
      )}

      {/* Bottom HUD: Dynamic Overlay Legend & Selected Site Coordinates */}
      <div
        className={`absolute bottom-3 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} ${rightDrawerOpen ? 'lg:right-[512px] right-3' : 'right-3'} flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20 transition-all duration-300`}
      >
        {showAssessmentOverlay && overlayOpacity > 0 && (
          <div className="pointer-events-auto bg-[#090A0D]/95 px-3 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider flex items-center gap-3.5">
            <span className="text-[#6B7280]">RYG Assessment</span>
            <div className="flex items-center gap-1.5 text-[#10B981]">
              <span className="w-2 h-2 rounded-full bg-[#10B981] border border-white/60" />
              <span>GO</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#F59E0B]">
              <span className="w-2 h-2 rounded-full bg-[#F59E0B] border border-white/60" />
              <span>CAUTION</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#EF4444]">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] border border-white/60" />
              <span>NO-GO</span>
            </div>
          </div>
        )}

        <div className="pointer-events-auto ml-auto bg-[#090A0D]/95 px-3 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] flex items-center gap-3 tabular-nums">
          <span className="text-white font-semibold">{selectedSite.name}</span>
          <span>LAT {selectedSite.coordinates.latitude}°</span>
          <span>LON {selectedSite.coordinates.longitude}°</span>
          <span>ELEV {selectedSite.coordinates.elevation_m}M</span>
        </div>
      </div>
    </div>
  );
};

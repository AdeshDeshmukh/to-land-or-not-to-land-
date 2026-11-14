import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CandidateSite, LanderProfile, RiskLevel } from '../types';
import {
  computeSiteEarthLos,
  computeSolarTelemetryAtTime,
  getEarthPoint,
  getSubsolarPoint,
} from '../utils/lunarTelemetry';
import {
  ArrowLeft,
  BarChart3,
  Crosshair,
  Eye,
  Grid,
  Layers,
  Mountain,
  RotateCcw,
} from 'lucide-react';

export interface LocalSurfaceDetailViewProps {
  site: CandidateSite;
  lander?: LanderProfile;
  sunIlluminationOffset: number;
  showAssessmentOverlay: boolean;
  overlayOpacity: number;
  leftDrawerOpen?: boolean;
  rightDrawerOpen?: boolean;
  onClose: () => void;
  onOpenTelemetryDrawer?: () => void;
}

type SurfaceLayerMode = 'REGOLITH' | 'RYG_HAZARD' | 'HYPSOMETRIC';

interface LocalCrater {
  xM: number;
  zM: number;
  rM: number;
  depthM: number;
  rimM: number;
  floorRatio: number;
}

interface LocalBoulder {
  xM: number;
  zM: number;
  radiusM: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotY: number;
  rotX: number;
}

interface LocalDemData {
  gridRes: number;
  elevRelM: Float32Array;
  slopeDeg: Float32Array;
  roughnessLocal: Float32Array;
  craters: LocalCrater[];
  boulders: LocalBoulder[];
  minRelM: number;
  maxRelM: number;
}

interface PadTelemetry {
  xM: number;
  zM: number;
  latDeg: number;
  lonDeg: number;
  elevM: number;
  slopeDeg: number;
  nearestBoulderM: number;
  boulderRadiusM: number;
  solarIllumPct: number;
  isSunlit: boolean;
  hasEarthDte: boolean;
  status: RiskLevel;
  reason: string;
}

const PATCH_SIZE_M = 2400;
const HALF_PATCH_M = PATCH_SIZE_M / 2;
const GRID_SEGMENTS = 159;
const GRID_RES = GRID_SEGMENTS + 1; // 160x160 vertices -> 15.09 m/cell
const STEP_M = PATCH_SIZE_M / GRID_SEGMENTS;
const WORLD_SIZE = 10;
const M_TO_WORLD = WORLD_SIZE / PATCH_SIZE_M;
const WORLD_TO_M = PATCH_SIZE_M / WORLD_SIZE;
const LUNAR_MEAN_RADIUS_M = 1737400;

function statusHex(level: RiskLevel): string {
  if (level === 'GREEN') return '#10B981';
  if (level === 'YELLOW') return '#F59E0B';
  return '#EF4444';
}

function statusText(level: RiskLevel): string {
  if (level === 'GREEN') return 'GO';
  if (level === 'YELLOW') return 'CAUTION';
  return 'NO-GO';
}

function createMulberry32(seedInit: number): () => number {
  let state = seedInit >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix: number, iz: number, seed: number): number {
  let n = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2D(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const v00 = hash2D(ix, iz, seed);
  const v10 = hash2D(ix + 1, iz, seed);
  const v01 = hash2D(ix, iz + 1, seed);
  const v11 = hash2D(ix + 1, iz + 1, seed);
  const a = v00 + (v10 - v00) * ux;
  const b = v01 + (v11 - v01) * ux;
  return (a + (b - a) * uz) * 2 - 1;
}

function fbm2D(x: number, z: number, seed: number): number {
  return (
    valueNoise2D(x, z, seed) * 0.56 +
    valueNoise2D(x * 2.17 + 17.3, z * 2.17 - 9.1, seed + 13) * 0.29 +
    valueNoise2D(x * 4.53 - 23.7, z * 4.53 + 31.2, seed + 29) * 0.15
  );
}

function generateLocalDem(site: CandidateSite): LocalDemData {
  const latKey = Math.round((site.coordinates.latitude + 90) * 10000);
  const lonKey = Math.round((site.coordinates.longitude + 180) * 10000);
  const seed = (latKey * 73856093) ^ (lonKey * 19349663) ^ 0x9e3779b9;
  const rng = createMulberry32(seed);

  const roughnessAmp =
    site.terrain.roughness === 'HIGH'
      ? 6.2
      : site.terrain.roughness === 'MODERATE'
        ? 3.4
        : 1.5;

  // Regional tilt calibrated to site macro slope while keeping summit crests above nearby craters
  const tiltAz = rng() * Math.PI * 2;
  const macroSlopeRad = (Math.min(26, Math.max(0.6, site.terrain.slope_deg)) * Math.PI) / 180;
  const tiltMag = Math.tan(macroSlopeRad) * (site.terrain.slope_deg < 7.5 ? 0.22 : 0.72);
  const tiltDx = Math.cos(tiltAz) * tiltMag;
  const tiltDz = Math.sin(tiltAz) * tiltMag;
  const isSummitRidge = site.coordinates.elevation_m >= 2500;

  // Build deterministic crater population across the 2.4 km patch
  const craters: LocalCrater[] = [];
  const keepCenterClearR = site.terrain.slope_deg < 7.5 ? 190 : 75;

  // Primary impact craters (160 m - 420 m radius)
  const numPrimary = site.terrain.roughness === 'HIGH' ? 7 : 5;
  for (let i = 0; i < numPrimary; i++) {
    let xM = (rng() * 2 - 1) * 980;
    let zM = (rng() * 2 - 1) * 980;
    const rM = 155 + rng() * 245;
    if (Math.hypot(xM, zM) < keepCenterClearR + rM * 0.65) {
      const pushAng = rng() * Math.PI * 2;
      const dist = keepCenterClearR + rM * 0.78;
      xM = Math.cos(pushAng) * dist;
      zM = Math.sin(pushAng) * dist;
    }
    const depthScale = 0.11 + rng() * 0.05;
    craters.push({
      xM,
      zM,
      rM,
      depthM: rM * depthScale,
      rimM: rM * depthScale * 0.26,
      floorRatio: 0.36 + rng() * 0.22,
    });
  }

  // Secondary craters (38 m - 115 m radius)
  const numSecondary = 20;
  for (let i = 0; i < numSecondary; i++) {
    let xM = (rng() * 2 - 1) * 1120;
    let zM = (rng() * 2 - 1) * 1120;
    const rM = 38 + rng() * 75;
    if (Math.hypot(xM, zM) < keepCenterClearR * 0.6 + rM * 0.45) {
      const ang = rng() * Math.PI * 2;
      const dist = keepCenterClearR * 0.75 + rM * 0.8;
      xM = Math.cos(ang) * dist;
      zM = Math.sin(ang) * dist;
    }
    const depthScale = 0.10 + rng() * 0.05;
    craters.push({
      xM,
      zM,
      rM,
      depthM: rM * depthScale,
      rimM: rM * depthScale * 0.24,
      floorRatio: 0.30 + rng() * 0.18,
    });
  }

  // Tertiary micro-craters (11 m - 32 m radius)
  const numMicro = 56;
  for (let i = 0; i < numMicro; i++) {
    const xM = (rng() * 2 - 1) * 1160;
    const zM = (rng() * 2 - 1) * 1160;
    const rM = 11 + rng() * 21;
    const depthScale = 0.09 + rng() * 0.04;
    craters.push({
      xM,
      zM,
      rM,
      depthM: rM * depthScale,
      rimM: rM * depthScale * 0.22,
      floorRatio: 0.28 + rng() * 0.16,
    });
  }

  const count = GRID_RES * GRID_RES;
  const elevRelM = new Float32Array(count);
  const slopeDeg = new Float32Array(count);
  const roughnessLocal = new Float32Array(count);

  const evalHeightAt = (xM: number, zM: number): number => {
    let h = xM * tiltDx + zM * tiltDz;

    // Gentle highland ridge undulation
    h += fbm2D(xM / 520, zM / 520, seed + 3) * (isSummitRidge ? 7.5 : 14.0 + roughnessAmp * 2.2);
    // Medium regolith undulation
    h += fbm2D(xM / 115, zM / 115, seed + 47) * roughnessAmp;
    // Fine 15m micro-regolith roughness
    h += valueNoise2D(xM / 28, zM / 28, seed + 101) * (roughnessAmp * 0.26);

    // High South Pole summits/rims sit on sunlit crest topography above surrounding basins
    if (isSummitRidge) {
      h += 48.0 * Math.exp(-(xM * xM + zM * zM) / (460 * 460));
    }

    for (let ci = 0; ci < craters.length; ci++) {
      const c = craters[ci];
      const dx = xM - c.xM;
      const dz = zM - c.zM;
      const maxR = c.rM * 1.48;
      if (Math.abs(dx) > maxR || Math.abs(dz) > maxR) continue;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= maxR) continue;

      const rNorm = dist / c.rM;
      if (rNorm < 1.0) {
        const floorR = c.floorRatio;
        if (rNorm <= floorR) {
          h += -c.depthM + c.rimM * Math.pow(rNorm, 3.0);
        } else {
          const u = (rNorm - floorR) / Math.max(0.05, 1.0 - floorR);
          const smooth = u * u * (3 - 2 * u);
          h += -c.depthM * (1.0 - smooth) + c.rimM * Math.pow(rNorm, 3.0);
        }
      } else {
        const t = (rNorm - 1.0) / 0.48;
        const apron = 1.0 - t;
        h += c.rimM * apron * apron;
      }
    }
    return h;
  };

  // Normalize so (0, 0) center equals exact reported site elevation
  const centerBiasM = evalHeightAt(0, 0);
  let minRelM = Infinity;
  let maxRelM = -Infinity;

  for (let iz = 0; iz < GRID_RES; iz++) {
    const zM = -HALF_PATCH_M + iz * STEP_M;
    const row = iz * GRID_RES;
    for (let ix = 0; ix < GRID_RES; ix++) {
      const xM = -HALF_PATCH_M + ix * STEP_M;
      const h = evalHeightAt(xM, zM) - centerBiasM;
      elevRelM[row + ix] = h;
      if (h < minRelM) minRelM = h;
      if (h > maxRelM) maxRelM = h;
    }
  }

  for (let iz = 0; iz < GRID_RES; iz++) {
    const izUp = Math.max(0, iz - 1);
    const izDn = Math.min(GRID_RES - 1, iz + 1);
    const dzSpan = (izDn - izUp) * STEP_M;
    const row = iz * GRID_RES;

    for (let ix = 0; ix < GRID_RES; ix++) {
      const ixL = Math.max(0, ix - 1);
      const ixR = Math.min(GRID_RES - 1, ix + 1);
      const dxSpan = (ixR - ixL) * STEP_M;

      const dHdx = (elevRelM[row + ixR] - elevRelM[row + ixL]) / dxSpan;
      const dHdz = (elevRelM[izDn * GRID_RES + ix] - elevRelM[izUp * GRID_RES + ix]) / dzSpan;
      const grad = Math.sqrt(dHdx * dHdx + dHdz * dHdz);
      slopeDeg[row + ix] = (Math.atan(grad) * 180) / Math.PI;

      const avgNbr =
        (elevRelM[row + ixR] +
          elevRelM[row + ixL] +
          elevRelM[izDn * GRID_RES + ix] +
          elevRelM[izUp * GRID_RES + ix]) *
        0.25;
      roughnessLocal[row + ix] = Math.abs(elevRelM[row + ix] - avgNbr);
    }
  }

  // Deterministic 3D boulder field concentrated near crater ejecta rims
  const boulderTarget =
    site.terrain.roughness === 'HIGH' ? 150 : site.terrain.roughness === 'MODERATE' ? 88 : 40;
  const boulders: LocalBoulder[] = [];
  for (let bi = 0; bi < boulderTarget; bi++) {
    let xM: number;
    let zM: number;
    if (bi < boulderTarget * 0.68 && craters.length > 0) {
      const c = craters[bi % Math.min(craters.length, 16)];
      const ang = rng() * Math.PI * 2;
      const rad = c.rM * (0.94 + rng() * 0.42);
      xM = c.xM + Math.cos(ang) * rad;
      zM = c.zM + Math.sin(ang) * rad;
    } else {
      xM = (rng() * 2 - 1) * (HALF_PATCH_M - 60);
      zM = (rng() * 2 - 1) * (HALF_PATCH_M - 60);
    }

    if (Math.abs(xM) > HALF_PATCH_M - 40 || Math.abs(zM) > HALF_PATCH_M - 40) continue;
    // Keep immediate 45m center zone clear for LOW roughness landing sites
    if (site.terrain.roughness === 'LOW' && Math.hypot(xM, zM) < 48) continue;

    const baseSizeM =
      site.terrain.roughness === 'HIGH'
        ? 2.2 + Math.pow(rng(), 1.6) * 5.6
        : site.terrain.roughness === 'MODERATE'
          ? 1.5 + Math.pow(rng(), 1.8) * 3.8
          : 1.0 + Math.pow(rng(), 2.1) * 2.2;

    boulders.push({
      xM,
      zM,
      radiusM: baseSizeM,
      scaleX: baseSizeM * (0.78 + rng() * 0.48),
      scaleY: baseSizeM * (0.48 + rng() * 0.36),
      scaleZ: baseSizeM * (0.74 + rng() * 0.50),
      rotY: rng() * Math.PI * 2,
      rotX: (rng() - 0.5) * 0.55,
    });
  }

  return {
    gridRes: GRID_RES,
    elevRelM,
    slopeDeg,
    roughnessLocal,
    craters,
    boulders,
    minRelM,
    maxRelM,
  };
}

function sampleDemField(dem: LocalDemData, arr: Float32Array, xM: number, zM: number): number {
  const gx = Math.max(0, Math.min(dem.gridRes - 1.001, (xM + HALF_PATCH_M) / STEP_M));
  const gz = Math.max(0, Math.min(dem.gridRes - 1.001, (zM + HALF_PATCH_M) / STEP_M));
  const ix0 = Math.floor(gx);
  const iz0 = Math.floor(gz);
  const ix1 = Math.min(dem.gridRes - 1, ix0 + 1);
  const iz1 = Math.min(dem.gridRes - 1, iz0 + 1);
  const tx = gx - ix0;
  const tz = gz - iz0;
  const w = dem.gridRes;
  const a = arr[iz0 * w + ix0] + (arr[iz0 * w + ix1] - arr[iz0 * w + ix0]) * tx;
  const b = arr[iz1 * w + ix0] + (arr[iz1 * w + ix1] - arr[iz1 * w + ix0]) * tx;
  return a + (b - a) * tz;
}

/**
 * Compute local East-North-Up solar & Earth directions for shadow ray-marching.
 */
function getLocalEnuVectors(
  site: CandidateSite,
  offsetDays: number
): {
  sunEast: number;
  sunSouth: number;
  sunUp: number;
  sunAzRad: number;
  earthAzRad: number;
  effectiveSunElevDeg: number;
  baseIllumPct: number;
  hasEarthDte: boolean;
} {
  const latRad = (site.coordinates.latitude * Math.PI) / 180;
  const lonRad = (site.coordinates.longitude * Math.PI) / 180;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinLon = Math.sin(lonRad);
  const cosLon = Math.cos(lonRad);

  // Tangent frame aligned with Three.js sphere axes
  const ex = -sinLon;
  const ez = -cosLon;
  const nxAxis = -sinLat * cosLon;
  const nyAxis = cosLat;
  const nzAxis = sinLat * sinLon;

  const { sunVec } = getSubsolarPoint(offsetDays);
  const { sunVec: earthVec } = getEarthPoint(offsetDays);

  const solarTel = computeSolarTelemetryAtTime(
    site.coordinates.latitude,
    site.coordinates.longitude,
    offsetDays,
    site
  );
  const hasEarthDte = computeSiteEarthLos(site, offsetDays);

  let sEast = sunVec.x * ex + sunVec.z * ez;
  let sNorth = sunVec.x * nxAxis + sunVec.y * nyAxis + sunVec.z * nzAxis;
  const sHoriz = Math.hypot(sEast, sNorth);
  if (sHoriz > 1e-4) {
    sEast /= sHoriz;
    sNorth /= sHoriz;
  } else {
    sEast = 0.85;
    sNorth = 0.52;
  }

  const elevRad = (solarTel.effectiveSunElevDeg * Math.PI) / 180;
  const cosEl = Math.cos(elevRad);

  let eEast = earthVec.x * ex + earthVec.z * ez;
  let eNorth = earthVec.x * nxAxis + earthVec.y * nyAxis + earthVec.z * nzAxis;
  if (Math.hypot(eEast, eNorth) < 1e-4) {
    eEast = 0;
    eNorth = 1;
  }

  return {
    sunEast: sEast * cosEl,
    sunSouth: -sNorth * cosEl,
    sunUp: Math.sin(elevRad),
    sunAzRad: Math.atan2(sEast, sNorth),
    earthAzRad: Math.atan2(eEast, eNorth),
    effectiveSunElevDeg: solarTel.effectiveSunElevDeg,
    baseIllumPct: solarTel.illuminationPct,
    hasEarthDte,
  };
}

function isPointLocallyShadowed(
  dem: LocalDemData,
  xM: number,
  zM: number,
  enu: ReturnType<typeof getLocalEnuVectors>
): boolean {
  if (enu.effectiveSunElevDeg <= 0) return true;
  const tanEl = Math.tan((Math.max(1.2, enu.effectiveSunElevDeg) * Math.PI) / 180);
  if (tanEl >= 1.2) return false;

  const horizLen = Math.max(1e-4, Math.hypot(enu.sunEast, enu.sunSouth));
  const dirX = enu.sunEast / horizLen;
  const dirZ = enu.sunSouth / horizLen;
  const h0 = sampleDemField(dem, dem.elevRelM, xM, zM);

  // March along local solar ray across surrounding rims (up to 720 m)
  const stepDist = 28;
  for (let s = 1; s <= 24; s++) {
    const dist = s * stepDist;
    const rx = xM + dirX * dist;
    const rz = zM + dirZ * dist;
    if (Math.abs(rx) > HALF_PATCH_M || Math.abs(rz) > HALF_PATCH_M) break;
    const hSample = sampleDemField(dem, dem.elevRelM, rx, rz);
    if (hSample > h0 + dist * tanEl + 0.6) {
      return true;
    }
  }
  return false;
}

function offsetMetersToLatLon(
  baseLat: number,
  baseLon: number,
  eastM: number,
  southM: number
): { latDeg: number; lonDeg: number } {
  const northM = -southM;
  const dLatDeg = (northM / LUNAR_MEAN_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.max(0.035, Math.cos((baseLat * Math.PI) / 180));
  const dLonDeg = (eastM / (LUNAR_MEAN_RADIUS_M * cosLat)) * (180 / Math.PI);
  const latDeg = Math.max(-90, Math.min(90, baseLat + dLatDeg));
  const rawLon = baseLon + dLonDeg;
  const lonDeg = ((rawLon + 180) % 360 + 360) % 360 - 180;
  return { latDeg, lonDeg };
}

export const LocalSurfaceDetailView: React.FC<LocalSurfaceDetailViewProps> = ({
  site,
  lander,
  sunIlluminationOffset,
  showAssessmentOverlay,
  overlayOpacity,
  leftDrawerOpen = false,
  rightDrawerOpen = false,
  onClose,
  onOpenTelemetryDrawer,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const miniMapCanvasRef = useRef<HTMLCanvasElement>(null);

  const [layerMode, setLayerMode] = useState<SurfaceLayerMode>(() =>
    showAssessmentOverlay && overlayOpacity > 0 ? 'RYG_HAZARD' : 'REGOLITH'
  );
  const [wireframeEnabled, setWireframeEnabled] = useState(false);
  const [padPosM, setPadPosM] = useState<{ xM: number; zM: number }>({ xM: 0, zM: 0 });
  const [camPresetTick, setCamPresetTick] = useState<{
    yaw: number;
    pitch: number;
    dist: number;
    seq: number;
  }>({ yaw: 0.58, pitch: 0.62, dist: 5.4, seq: 0 });

  // Reset pad back to patch center whenever inspected coordinate/site changes
  useEffect(() => {
    setPadPosM({ xM: 0, zM: 0 });
  }, [site.id, site.coordinates.latitude, site.coordinates.longitude]);

  const dem = useMemo(() => generateLocalDem(site), [
    site.id,
    site.coordinates.latitude,
    site.coordinates.longitude,
    site.terrain.slope_deg,
    site.terrain.roughness,
  ]);

  const enu = useMemo(
    () => getLocalEnuVectors(site, sunIlluminationOffset),
    [site, sunIlluminationOffset]
  );

  const maxSlopeLimit = lander?.maxSlopeDeg ?? 10;
  const minIllumLimit = lander?.minIlluminationPct ?? 60;
  const requiresEarthLos = lander?.requiresEarthLos ?? true;

  // Evaluate exact local micro-pad safety at (padPosM.xM, padPosM.zM)
  const padTelemetry: PadTelemetry = useMemo(() => {
    const xM = Math.max(-HALF_PATCH_M + 80, Math.min(HALF_PATCH_M - 80, padPosM.xM));
    const zM = Math.max(-HALF_PATCH_M + 80, Math.min(HALF_PATCH_M - 80, padPosM.zM));

    const elevRel = sampleDemField(dem, dem.elevRelM, xM, zM);
    const pointElevM = Math.round(site.coordinates.elevation_m + elevRel);

    // Sample worst-case local slope within a 30 m lander footprint
    let footprintMaxSlope = sampleDemField(dem, dem.slopeDeg, xM, zM);
    const sampleR = 24;
    for (let a = 0; a < 8; a++) {
      const th = (a * Math.PI) / 4;
      const s = sampleDemField(
        dem,
        dem.slopeDeg,
        xM + Math.cos(th) * sampleR,
        zM + Math.sin(th) * sampleR
      );
      if (s > footprintMaxSlope) footprintMaxSlope = s;
    }

    let nearestBoulderM = 9999;
    let nearestRadiusM = 0;
    for (const b of dem.boulders) {
      const edgeDist = Math.hypot(xM - b.xM, zM - b.zM) - b.radiusM;
      if (edgeDist < nearestBoulderM) {
        nearestBoulderM = edgeDist;
        nearestRadiusM = b.radiusM;
      }
    }

    const shadowed = isPointLocallyShadowed(dem, xM, zM, enu);
    const solarIllumPct = shadowed
      ? Math.max(0, Math.min(18, enu.baseIllumPct))
      : Math.max(enu.baseIllumPct, enu.effectiveSunElevDeg > 0 ? 78 : 8);

    let status: RiskLevel = 'GREEN';
    let reason = 'CLEAR 50M FOOTPRINT & SUNLIT';

    if (footprintMaxSlope > maxSlopeLimit * 1.15) {
      status = 'RED';
      reason = `EXCESSIVE LOCAL SLOPE (${footprintMaxSlope.toFixed(1)}°)`;
    } else if (nearestBoulderM < 16) {
      status = 'RED';
      reason = `BOULDER OBSTACLE (${Math.max(0, nearestBoulderM).toFixed(0)}M AWAY)`;
    } else if (shadowed && solarIllumPct < minIllumLimit * 0.5) {
      status = 'RED';
      reason = 'CRATER SELF-SHADOW / LOW POWER';
    } else if (requiresEarthLos && !enu.hasEarthDte) {
      status = 'RED';
      reason = 'EARTH DTE OCCLUDED BY HORIZON';
    } else if (
      footprintMaxSlope > maxSlopeLimit * 0.72 ||
      nearestBoulderM < 34 ||
      solarIllumPct < minIllumLimit
    ) {
      status = 'YELLOW';
      reason =
        nearestBoulderM < 34
          ? `BOULDER PROXIMITY (${nearestBoulderM.toFixed(0)}M)`
          : footprintMaxSlope > maxSlopeLimit * 0.72
            ? `MARGINAL SLOPE (${footprintMaxSlope.toFixed(1)}°)`
            : `MARGINAL SOLAR FLUX (${solarIllumPct}%)`;
    }

    const { latDeg, lonDeg } = offsetMetersToLatLon(
      site.coordinates.latitude,
      site.coordinates.longitude,
      xM,
      zM
    );

    return {
      xM,
      zM,
      latDeg,
      lonDeg,
      elevM: pointElevM,
      slopeDeg: Number(footprintMaxSlope.toFixed(1)),
      nearestBoulderM: Math.max(0, Math.round(nearestBoulderM)),
      boulderRadiusM: Number(nearestRadiusM.toFixed(1)),
      solarIllumPct,
      isSunlit: !shadowed && enu.effectiveSunElevDeg > 0,
      hasEarthDte: enu.hasEarthDte,
      status,
      reason,
    };
  }, [dem, padPosM, site, enu, maxSlopeLimit, minIllumLimit, requiresEarthLos]);

  // Refs shared with WebGL loop
  const demRef = useRef(dem);
  demRef.current = dem;
  const layerModeRef = useRef(layerMode);
  layerModeRef.current = layerMode;
  const wireframeRef = useRef(wireframeEnabled);
  wireframeRef.current = wireframeEnabled;
  const overlayOpacityRef = useRef(overlayOpacity);
  overlayOpacityRef.current = overlayOpacity;
  const enuRef = useRef(enu);
  enuRef.current = enu;
  const maxSlopeLimitRef = useRef(maxSlopeLimit);
  maxSlopeLimitRef.current = maxSlopeLimit;
  const padTelemetryRef = useRef(padTelemetry);
  padTelemetryRef.current = padTelemetry;

  // Imperative scene updater handles
  const terrainGeomRef = useRef<THREE.PlaneGeometry | null>(null);
  const wireMeshRef = useRef<THREE.Mesh | null>(null);
  const boulderMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const padGroupRef = useRef<THREE.Group | null>(null);
  const padRingsRef = useRef<THREE.Mesh[]>([]);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const camOrbitRef = useRef<{ yaw: number; pitch: number; dist: number; targetX: number; targetZ: number }>({
    yaw: 0.58,
    pitch: 0.62,
    dist: 5.4,
    targetX: 0,
    targetZ: 0,
  });

  // Apply camera presets smoothly
  useEffect(() => {
    if (camPresetTick.seq === 0) return;
    camOrbitRef.current.yaw = camPresetTick.yaw;
    camOrbitRef.current.pitch = camPresetTick.pitch;
    camOrbitRef.current.dist = camPresetTick.dist;
    camOrbitRef.current.targetX = padTelemetryRef.current.xM * M_TO_WORLD * 0.45;
    camOrbitRef.current.targetZ = padTelemetryRef.current.zM * M_TO_WORLD * 0.45;
  }, [camPresetTick]);

  // Helper to paint terrain geometry vertices & colors on mode/DEM/time change
  const syncDemGeometry = useMemo(
    () => () => {
      const geom = terrainGeomRef.current;
      if (!geom) return;
      const curDem = demRef.current;
      const mode = layerModeRef.current;
      const curEnu = enuRef.current;
      const slopeLimit = maxSlopeLimitRef.current;
      const opFactor = Math.max(0.2, Math.min(1, overlayOpacityRef.current / 100));

      const posAttr = geom.attributes.position as THREE.BufferAttribute;
      let colorAttr = geom.attributes.color as THREE.BufferAttribute | undefined;
      if (!colorAttr) {
        colorAttr = new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3);
        geom.setAttribute('color', colorAttr);
      }

      const spanM = Math.max(12, curDem.maxRelM - curDem.minRelM);

      for (let i = 0; i < posAttr.count; i++) {
        const iz = Math.floor(i / GRID_RES);
        const ix = i - iz * GRID_RES;
        const relM = curDem.elevRelM[i];
        posAttr.setY(i, relM * M_TO_WORLD * 1.45);

        const slp = curDem.slopeDeg[i];
        const rough = curDem.roughnessLocal[i];
        const xM = -HALF_PATCH_M + ix * STEP_M;
        const zM = -HALF_PATCH_M + iz * STEP_M;

        // Subtle deterministic regolith grain
        const grain = hash2D(ix, iz, 911) * 0.08 - 0.04;
        const baseShade = Math.max(
          0.32,
          Math.min(0.88, 0.56 + ((relM - curDem.minRelM) / spanM - 0.5) * 0.24 + grain)
        );

        let r = baseShade;
        let g = baseShade;
        let b = baseShade * 1.01;

        if (mode === 'RYG_HAZARD') {
          const shadowed = isPointLocallyShadowed(curDem, xM, zM, curEnu);
          let hr = 0.06;
          let hg = 0.72;
          let hb = 0.50;
          if (slp > slopeLimit * 1.05 || shadowed || rough > 2.4) {
            hr = 0.94;
            hg = 0.27;
            hb = 0.27;
          } else if (slp > slopeLimit * 0.65 || rough > 1.3) {
            hr = 0.96;
            hg = 0.62;
            hb = 0.04;
          }
          const blend = 0.55 * opFactor;
          r = r * (1 - blend) + hr * blend;
          g = g * (1 - blend) + hg * blend;
          b = b * (1 - blend) + hb * blend;
        } else if (mode === 'HYPSOMETRIC') {
          const t = (relM - curDem.minRelM) / spanM;
          const contourDist = Math.abs((((relM % 20) + 20) % 20) - 10);
          const isContour = contourDist > 9.15;
          if (isContour) {
            r = 0.96;
            g = 0.98;
            b = 1.0;
          } else {
            r = 0.14 + t * 0.62;
            g = 0.18 + t * 0.66;
            b = 0.24 + t * 0.68;
          }
        }

        colorAttr.setXYZ(i, r, g, b);
      }

      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geom.computeVertexNormals();
      geom.computeBoundingSphere();

      // Position boulders onto updated DEM elevation
      const bMesh = boulderMeshRef.current;
      if (bMesh) {
        const dummy = new THREE.Object3D();
        bMesh.count = curDem.boulders.length;
        for (let bi = 0; bi < curDem.boulders.length; bi++) {
          const bd = curDem.boulders[bi];
          const bElevM = sampleDemField(curDem, curDem.elevRelM, bd.xM, bd.zM);
          dummy.position.set(
            bd.xM * M_TO_WORLD,
            bElevM * M_TO_WORLD * 1.45 + bd.scaleY * M_TO_WORLD * 0.55,
            bd.zM * M_TO_WORLD
          );
          dummy.rotation.set(bd.rotX, bd.rotY, 0);
          dummy.scale.set(
            bd.scaleX * M_TO_WORLD * 1.8,
            bd.scaleY * M_TO_WORLD * 1.8,
            bd.scaleZ * M_TO_WORLD * 1.8
          );
          dummy.updateMatrix();
          bMesh.setMatrixAt(bi, dummy.matrix);
        }
        bMesh.instanceMatrix.needsUpdate = true;
      }

      // Sync sun light position
      if (sunLightRef.current) {
        const lightUp = Math.max(0.14, curEnu.sunUp * 2.2);
        sunLightRef.current.position.set(
          curEnu.sunEast * 18,
          lightUp * 18,
          curEnu.sunSouth * 18
        );
        sunLightRef.current.intensity = curEnu.effectiveSunElevDeg <= 0 ? 0.55 : 3.2;
      }
    },
    []
  );

  // Sync pad marker position & color whenever pad moves
  useEffect(() => {
    const grp = padGroupRef.current;
    if (!grp) return;
    const hM = sampleDemField(dem, dem.elevRelM, padTelemetry.xM, padTelemetry.zM);
    grp.position.set(
      padTelemetry.xM * M_TO_WORLD,
      hM * M_TO_WORLD * 1.45 + 0.042,
      padTelemetry.zM * M_TO_WORLD
    );
    const hex = statusHex(padTelemetry.status);
    for (const rMesh of padRingsRef.current) {
      const mat = rMesh.material as THREE.MeshBasicMaterial;
      mat.color.set(hex);
    }
  }, [dem, padTelemetry]);

  // Trigger geometry refresh when mode/site/time/overlay changes
  useEffect(() => {
    syncDemGeometry();
    if (wireMeshRef.current) {
      wireMeshRef.current.visible = wireframeEnabled;
    }
  }, [dem, layerMode, wireframeEnabled, overlayOpacity, sunIlluminationOffset, maxSlopeLimit, syncDemGeometry]);

  // Draw Interactive 2D Top-Down Slope & Contour Mini-Map
  useEffect(() => {
    const canvas = miniMapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const spanM = Math.max(12, dem.maxRelM - dem.minRelM);

    for (let py = 0; py < h; py++) {
      const zM = -HALF_PATCH_M + ((py + 0.5) / h) * PATCH_SIZE_M;
      for (let px = 0; px < w; px++) {
        const xM = -HALF_PATCH_M + ((px + 0.5) / w) * PATCH_SIZE_M;
        const elev = sampleDemField(dem, dem.elevRelM, xM, zM);
        const slp = sampleDemField(dem, dem.slopeDeg, xM, zM);

        let base = Math.round(40 + ((elev - dem.minRelM) / spanM) * 145);
        const contourMod = ((elev % 18) + 18) % 18;
        const onContour = contourMod < 1.35;

        let r = base;
        let g = base;
        let b = base;

        if (slp > maxSlopeLimit * 1.05) {
          r = Math.round(r * 0.5 + 239 * 0.5);
          g = Math.round(g * 0.5 + 68 * 0.5);
          b = Math.round(b * 0.5 + 68 * 0.5);
        } else if (slp > maxSlopeLimit * 0.65) {
          r = Math.round(r * 0.55 + 245 * 0.45);
          g = Math.round(g * 0.55 + 158 * 0.45);
          b = Math.round(b * 0.55 + 11 * 0.45);
        } else {
          r = Math.round(r * 0.65 + 16 * 0.35);
          g = Math.round(g * 0.65 + 185 * 0.35);
          b = Math.round(b * 0.65 + 129 * 0.35);
        }

        if (onContour) {
          r = Math.min(255, r + 48);
          g = Math.min(255, g + 48);
          b = Math.min(255, b + 48);
        }

        const p4 = (py * w + px) * 4;
        data[p4] = r;
        data[p4 + 1] = g;
        data[p4 + 2] = b;
        data[p4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Draw 500m grid ticks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      const p = (k / 4) * w;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }

    // Draw boulders
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    for (const bd of dem.boulders) {
      const bx = ((bd.xM + HALF_PATCH_M) / PATCH_SIZE_M) * w;
      const by = ((bd.zM + HALF_PATCH_M) / PATCH_SIZE_M) * h;
      ctx.fillRect(bx - 1, by - 1, 2.2, 2.2);
    }

    // Draw Sun azimuth indicator from center edge
    const sunSx = w / 2 + enu.sunEast * 44;
    const sunSy = h / 2 + enu.sunSouth * 44;
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(sunSx, sunSy);
    ctx.stroke();
    ctx.fillStyle = '#FACC15';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('SUN', Math.max(4, Math.min(w - 22, sunSx - 8)), Math.max(10, Math.min(h - 4, sunSy - 3)));

    // Draw touchdown crosshair
    const px = ((padTelemetry.xM + HALF_PATCH_M) / PATCH_SIZE_M) * w;
    const py = ((padTelemetry.zM + HALF_PATCH_M) / PATCH_SIZE_M) * h;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 9, py);
    ctx.lineTo(px + 9, py);
    ctx.moveTo(px, py - 9);
    ctx.lineTo(px, py + 9);
    ctx.stroke();
  }, [dem, enu, maxSlopeLimit, padTelemetry.xM, padTelemetry.zM]);

  // Mount Three.js 3D Surface Patch Scene with clean resource disposal
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.032);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 120);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.16);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xffffff, 3.2);
    sunLight.position.set(14, 6, 8);
    scene.add(sunLight);
    sunLightRef.current = sunLight;

    const rimFill = new THREE.DirectionalLight(0x9ca3af, 0.22);
    rimFill.position.set(-10, 5, -10);
    scene.add(rimFill);

    // 1. High-Res 160x160 Terrain Patch Geometry
    const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GRID_SEGMENTS, GRID_SEGMENTS);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeomRef.current = terrainGeo;

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
      flatShading: false,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    scene.add(terrainMesh);

    // Optional LiDAR wireframe overlay mesh sharing the geometry
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xe5e7eb,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    const wireMesh = new THREE.Mesh(terrainGeo, wireMat);
    wireMesh.position.y = 0.008;
    wireMesh.visible = wireframeRef.current;
    scene.add(wireMesh);
    wireMeshRef.current = wireMesh;

    // 2. Angular 3D Lunar Boulders (InstancedMesh)
    const boulderGeo = new THREE.IcosahedronGeometry(1, 0);
    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0xa1a5ad,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: true,
    });
    const maxBoulders = 180;
    const boulderMesh = new THREE.InstancedMesh(boulderGeo, boulderMat, maxBoulders);
    boulderMesh.count = 0;
    scene.add(boulderMesh);
    boulderMeshRef.current = boulderMesh;

    // 3. 3D Touchdown Target Pad & Simplified Descent Stage Lander
    const padGroup = new THREE.Group();
    const innerRingGeo = new THREE.RingGeometry(45 * M_TO_WORLD, 53 * M_TO_WORLD, 48);
    innerRingGeo.rotateX(-Math.PI / 2);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: statusHex(padTelemetryRef.current.status),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);

    const outerRingGeo = new THREE.RingGeometry(116 * M_TO_WORLD, 122 * M_TO_WORLD, 64);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: statusHex(padTelemetryRef.current.status),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    padRingsRef.current = [innerRingMesh, outerRingMesh];
    padGroup.add(innerRingMesh);
    padGroup.add(outerRingMesh);

    // Simplified 3D lunar descent stage (~18m visible engineering scale marker)
    const stageGeo = new THREE.CylinderGeometry(0.055, 0.068, 0.045, 8);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.35,
      metalness: 0.75,
    });
    const stageMesh = new THREE.Mesh(stageGeo, stageMat);
    stageMesh.position.y = 0.032;
    padGroup.add(stageMesh);

    const cabinGeo = new THREE.CylinderGeometry(0.036, 0.046, 0.036, 8);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0xf3f4f6,
      roughness: 0.4,
      metalness: 0.3,
    });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.y = 0.072;
    padGroup.add(cabinMesh);

    const beaconGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.09, 0),
      new THREE.Vector3(0, 0.85, 0),
    ]);
    const beaconMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
    });
    const beaconLine = new THREE.Line(beaconGeo, beaconMat);
    padGroup.add(beaconLine);

    scene.add(padGroup);
    padGroupRef.current = padGroup;

    // Initial vertex/boulder population
    syncDemGeometry();
    const initH = sampleDemField(demRef.current, demRef.current.elevRelM, padTelemetryRef.current.xM, padTelemetryRef.current.zM);
    padGroup.position.set(
      padTelemetryRef.current.xM * M_TO_WORLD,
      initH * M_TO_WORLD * 1.45 + 0.042,
      padTelemetryRef.current.zM * M_TO_WORLD
    );

    // Smooth Orbit & Click-to-Relocate Touchdown Pad Handlers
    let isDragging = false;
    let didDrag = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      isDragging = true;
      didDrag = false;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const totalDx = e.clientX - downX;
      const totalDy = e.clientY - downY;
      if (!didDrag && totalDx * totalDx + totalDy * totalDy > 16) {
        didDrag = true;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      camOrbitRef.current.yaw -= dx * 0.0065;
      camOrbitRef.current.pitch = Math.max(
        0.16,
        Math.min(1.48, camOrbitRef.current.pitch + dy * 0.0055)
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      const wasDrag = didDrag;
      isDragging = false;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      renderer.domElement.style.cursor = 'crosshair';

      if (wasDrag) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(terrainMesh);
      if (hits.length > 0) {
        const pt = hits[0].point;
        const xM = Math.max(-HALF_PATCH_M + 80, Math.min(HALF_PATCH_M - 80, pt.x * WORLD_TO_M));
        const zM = Math.max(-HALF_PATCH_M + 80, Math.min(HALF_PATCH_M - 80, pt.z * WORLD_TO_M));
        setPadPosM({ xM: Math.round(xM), zM: Math.round(zM) });
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.max(0.75, Math.min(1.35, 1 + e.deltaY * 0.001));
      camOrbitRef.current.dist = Math.max(1.2, Math.min(11.5, camOrbitRef.current.dist * factor));
    };

    const domEl = renderer.domElement;
    domEl.style.cursor = 'crosshair';
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointercancel', onPointerUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    const handleResize = () => {
      if (!container) return;
      const nw = container.clientWidth || window.innerWidth;
      const nh = container.clientHeight || window.innerHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    let animId = 0;
    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      const { yaw, pitch, dist, targetX, targetZ } = camOrbitRef.current;
      const horizR = Math.cos(pitch) * dist;
      const vy = Math.sin(pitch) * dist;
      camera.position.set(
        targetX + Math.sin(yaw) * horizR,
        vy + 0.15,
        targetZ + Math.cos(yaw) * horizR
      );
      camera.lookAt(targetX, 0.0, targetZ);
      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(animId);
      resizeObs.disconnect();
      window.removeEventListener('resize', handleResize);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointercancel', onPointerUp);
      domEl.removeEventListener('wheel', onWheel);

      terrainGeo.dispose();
      terrainMat.dispose();
      wireMat.dispose();
      boulderGeo.dispose();
      boulderMat.dispose();
      innerRingGeo.dispose();
      innerRingMat.dispose();
      outerRingGeo.dispose();
      outerRingMat.dispose();
      stageGeo.dispose();
      stageMat.dispose();
      cabinGeo.dispose();
      cabinMat.dispose();
      beaconGeo.dispose();
      beaconMat.dispose();
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
      terrainGeomRef.current = null;
      wireMeshRef.current = null;
      boulderMeshRef.current = null;
      padGroupRef.current = null;
      padRingsRef.current = [];
      sunLightRef.current = null;
    };
  }, [syncDemGeometry]);

  const handleMiniMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = miniMapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const xM = Math.max(-HALF_PATCH_M + 80, Math.min(HALF_PATCH_M - 80, (rx - 0.5) * PATCH_SIZE_M));
    const zM = Math.max(-HALF_PATCH_M + 80, Math.min(HALF_PATCH_M - 80, (ry - 0.5) * PATCH_SIZE_M));
    setPadPosM({ xM: Math.round(xM), zM: Math.round(zM) });
  };

  return (
    <div
      data-testid="local-surface-detail-view"
      className="absolute inset-0 bg-[#000000] z-30 flex flex-col overflow-hidden select-none"
    >
      {/* Fullscreen 3D Local Terrain Canvas */}
      <div ref={mountRef} className="w-full h-full absolute inset-0" />

      {/* Top Controls Bar (respecting Left & Right Drawers) */}
      <div
        className={`pointer-events-none absolute top-3 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} ${rightDrawerOpen ? 'lg:right-[512px] right-3' : 'right-3'} flex flex-wrap items-center justify-between gap-2 z-20 transition-all duration-300`}
      >
        {/* Left: Back to 3D Globe + Title Badge */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="close-local-surface-btn"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black hover:bg-neutral-200 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to 3D Globe</span>
          </button>

          <div className="hidden sm:flex items-center gap-2 bg-[#090A0D]/95 px-2.5 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF]">
            <Mountain className="w-3.5 h-3.5 text-white" />
            <span>
              LOCAL DEM // <strong className="text-white">2.4 KM × 2.4 KM · 15M/PX</strong>
            </span>
          </div>
        </div>

        {/* Center: Surface Layer & Wireframe Toggles */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 bg-[#090A0D]/95 p-1 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setLayerMode('REGOLITH')}
            className={`px-2 py-1 rounded-[2px] transition ${layerMode === 'REGOLITH'
              ? 'bg-white text-black font-bold'
              : 'text-[#9CA3AF] hover:text-white'
              }`}
          >
            Regolith
          </button>
          <button
            type="button"
            onClick={() => setLayerMode('RYG_HAZARD')}
            className={`px-2 py-1 rounded-[2px] transition ${layerMode === 'RYG_HAZARD'
              ? 'bg-white text-black font-bold'
              : 'text-[#9CA3AF] hover:text-white'
              }`}
          >
            RYG Hazard
          </button>
          <button
            type="button"
            onClick={() => setLayerMode('HYPSOMETRIC')}
            className={`px-2 py-1 rounded-[2px] transition ${layerMode === 'HYPSOMETRIC'
              ? 'bg-white text-black font-bold'
              : 'text-[#9CA3AF] hover:text-white'
              }`}
          >
            Topo Contours
          </button>
          <div className="w-px h-3.5 bg-white/[0.14] mx-0.5" />
          <button
            type="button"
            onClick={() => setWireframeEnabled((prev) => !prev)}
            className={`flex items-center gap-1 px-2 py-1 rounded-[2px] transition ${wireframeEnabled
              ? 'bg-white text-black font-bold'
              : 'text-[#9CA3AF] hover:text-white'
              }`}
          >
            <Grid className="w-3 h-3" />
            <span>Mesh</span>
          </button>
        </div>

        {/* Right: Camera Angle Presets */}
        <div className="pointer-events-auto flex items-center gap-1 bg-[#090A0D]/95 p-1 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider">
          <button
            type="button"
            onClick={() =>
              setCamPresetTick((p) => ({ yaw: 0.58, pitch: 0.62, dist: 5.4, seq: p.seq + 1 }))
            }
            className="flex items-center gap-1 px-2 py-1 text-[#9CA3AF] hover:text-white hover:bg-white/10 rounded-[2px] transition"
            title="Oblique orbital descent approach angle"
          >
            <Eye className="w-3 h-3" />
            <span>Oblique</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setCamPresetTick((p) => ({ yaw: 0.85, pitch: 0.24, dist: 2.8, seq: p.seq + 1 }))
            }
            className="px-2 py-1 text-[#9CA3AF] hover:text-white hover:bg-white/10 rounded-[2px] transition"
            title="Low grazing hover angle inspecting boulder & rim horizon relief"
          >
            Low Grazing
          </button>
          <button
            type="button"
            onClick={() =>
              setCamPresetTick((p) => ({ yaw: 0.0, pitch: 1.44, dist: 7.4, seq: p.seq + 1 }))
            }
            className="flex items-center gap-1 px-2 py-1 text-[#9CA3AF] hover:text-white hover:bg-white/10 rounded-[2px] transition"
            title="Top-down LiDAR hazard mapping view"
          >
            <Layers className="w-3 h-3" />
            <span>Overhead</span>
          </button>
          <button
            type="button"
            onClick={() => setPadPosM({ xM: 0, zM: 0 })}
            className="p-1 text-[#9CA3AF] hover:text-white hover:bg-white/10 rounded-[2px] transition"
            title="Recenter lander touchdown pad to coordinate center"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Bottom Left: Local Micro-Pad Touchdown & Boulder Hazard HUD */}
      <div
        data-testid="local-pad-hud"
        className={`pointer-events-auto absolute bottom-4 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} w-[328px] max-w-[calc(100vw-24px)] bg-[#090A0D]/95 backdrop-blur-md border border-white/[0.16] rounded-[2px] p-3 font-mono z-20 transition-all duration-300`}
      >
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/[0.12]">
          <div className="min-w-0">
            <div className="text-[9px] text-[#6B7280] uppercase tracking-widest">
              CLICK TERRAIN TO RELOCATE TOUCHDOWN PAD
            </div>
            <div className="text-xs font-bold text-white uppercase tracking-wider truncate mt-0.5">
              {site.name}
            </div>
          </div>
          <span
            style={{
              color: statusHex(padTelemetry.status),
              borderColor: `${statusHex(padTelemetry.status)}66`,
              backgroundColor: `${statusHex(padTelemetry.status)}1A`,
            }}
            className="shrink-0 px-2 py-0.5 rounded-[2px] border text-[10px] font-bold uppercase tracking-wider"
          >
            {statusText(padTelemetry.status)}
          </span>
        </div>

        <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wider py-1.5 border-b border-white/[0.10] truncate">
          {padTelemetry.reason}
        </div>

        <div className="grid grid-cols-3 gap-1.5 py-2 border-b border-white/[0.10] text-[10px] tabular-nums">
          <div className="bg-black/70 border border-white/[0.10] rounded-[2px] px-2 py-1">
            <span className="block text-[8px] text-[#6B7280] uppercase tracking-widest">PAD LAT</span>
            <span className="text-white font-semibold">{padTelemetry.latDeg.toFixed(4)}°</span>
          </div>
          <div className="bg-black/70 border border-white/[0.10] rounded-[2px] px-2 py-1">
            <span className="block text-[8px] text-[#6B7280] uppercase tracking-widest">PAD LON</span>
            <span className="text-white font-semibold">{padTelemetry.lonDeg.toFixed(4)}°</span>
          </div>
          <div className="bg-black/70 border border-white/[0.10] rounded-[2px] px-2 py-1">
            <span className="block text-[8px] text-[#6B7280] uppercase tracking-widest">REL / ELEV</span>
            <span className="text-white font-semibold">{padTelemetry.elevM}M</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 py-2 text-[10px] tabular-nums">
          <div className="bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
            <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
              50M PAD SLOPE
            </span>
            <span className="text-white font-semibold">{padTelemetry.slopeDeg.toFixed(1)}°</span>
          </div>
          <div className="bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
            <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
              BOULDER CLEARANCE
            </span>
            <span className="text-white font-semibold">
              {padTelemetry.nearestBoulderM}M (R {padTelemetry.boulderRadiusM}M)
            </span>
          </div>
          <div className="bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
            <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
              LOCAL SOLAR
            </span>
            <span className="text-white font-semibold">
              {padTelemetry.solarIllumPct}% ({padTelemetry.isSunlit ? 'SUNLIT' : 'SHADOW'})
            </span>
          </div>
          <div className="bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
            <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
              PATCH OFFSET
            </span>
            <span className="text-white font-semibold">
              {padTelemetry.xM >= 0 ? '+' : ''}
              {padTelemetry.xM}M, {padTelemetry.zM >= 0 ? '+' : ''}
              {-padTelemetry.zM}M N
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() =>
              setCamPresetTick((p) => ({ yaw: 0.58, pitch: 0.45, dist: 2.6, seq: p.seq + 1 }))
            }
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.16] rounded-[2px] text-[10px] font-bold uppercase tracking-wider text-white transition"
          >
            <Crosshair className="w-3 h-3" />
            <span>Zoom Pad</span>
          </button>
          {onOpenTelemetryDrawer && (
            <button
              type="button"
              onClick={onOpenTelemetryDrawer}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-white hover:bg-neutral-200 rounded-[2px] text-[10px] font-bold uppercase tracking-wider text-black transition"
            >
              <BarChart3 className="w-3 h-3" />
              <span>Telemetry</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom Right: 2D High-Res Slope & Elevation Contour Mini-Map */}
      <div
        className={`pointer-events-auto hidden sm:flex flex-col gap-1.5 bg-[#090A0D]/95 border border-white/[0.16] rounded-[2px] p-2.5 font-mono z-20 absolute bottom-4 ${rightDrawerOpen ? 'lg:right-[512px] right-3' : 'right-3'} transition-all duration-300`}
      >
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-[#9CA3AF]">
          <span>2D SLOPE &amp; CONTOUR MAP</span>
          <span className="text-white tabular-nums">N ↑ · 2.4 KM</span>
        </div>
        <canvas
          ref={miniMapCanvasRef}
          width={184}
          height={184}
          onClick={handleMiniMapClick}
          className="border border-white/[0.14] rounded-[2px] cursor-crosshair block"
          title="Click anywhere on 2D contour map to place touchdown pad"
        />
        <div className="flex items-center justify-between text-[8px] text-[#6B7280] uppercase tracking-wider">
          <span>20M CONTOURS · {dem.boulders.length} BOULDERS</span>
          <span className="text-white">SUN {enu.effectiveSunElevDeg.toFixed(1)}°</span>
        </div>
      </div>
    </div>
  );
};

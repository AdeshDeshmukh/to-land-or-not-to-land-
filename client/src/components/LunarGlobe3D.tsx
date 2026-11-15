import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { CandidateSite, LanderProfile, RiskLevel } from '../types';
import { assessLandingSiteRisk } from '../engine/riskEngine';
import {
  vector3ToLatLon,
  latLonToCartesian,
  getSubsolarPoint,
  getEarthPoint,
  sampleCraterField,
  sunElevToIlluminationPct,
  computeSolarTelemetryAtTime,
  computeSiteIllumination,
  computeSiteEarthLos,
  getSouthPoleCraters,
  getCanonicalSiteSunCutoffDeg,
  formatMissionUtc,
  parseMissionUtcInputs,
} from '../utils/lunarTelemetry';
import {
  BarChart3,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Focus,
  Globe,
  GraduationCap,
  Grid,
  Info,
  Layers,
  Mountain,
  Navigation,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { LocalSurfaceDetailView } from './LocalSurfaceDetailView';
import { RISK_THRESHOLDS } from '../engine/riskEngine';
import {
  buildCelestialSpaceEnvironment,
  CelestialSpaceEnvironment,
} from '../utils/celestialSkybox3D';

interface LunarGlobe3DProps {
  sites: CandidateSite[];
  selectedSite: CandidateSite;
  onSelectSite: (site: CandidateSite, options?: { openDrawer?: boolean }) => void;
  sunIlluminationOffset?: number; // Days offset
  lander?: LanderProfile;
  onProbeCoordinate?: (
    lat: number,
    lon: number,
    customName?: string,
    sampledSlopeDeg?: number,
    sampledElevM?: number
  ) => void;
  missionEpochOffset?: number;
  onChangeDateOffset?: (offsetDays: number) => void;
  onChangeMissionEpoch?: (epochOffsetDays: number) => void;
  onOpenTelemetryDrawer?: () => void;
  leftDrawerOpen?: boolean;
  rightDrawerOpen?: boolean;
  rightDrawerWide?: boolean;
  compareSiteIds?: string[];
  onToggleCompareSite?: (site: CandidateSite) => void;
  viewMode?: 'planner' | 'educator';
}

interface TerrainGrid {
  width: number;
  height: number;
  slopeDeg: Float32Array;
  elevM: Float32Array;
  roughnessCode: Uint8Array; // 0 = LOW, 1 = MODERATE, 2 = HIGH
  horizonCutoffDeg: Float32Array;
  earthCutoffDeg: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
}

const MOON_RADIUS = 3.5;
const GRID_W = 1024;
const GRID_H = 512;
const ALBEDO_TEX_W = 4096;
const ALBEDO_TEX_H = 2048;
const NORM_TEX_W = 2048;
const NORM_TEX_H = 1024;
const MIN_CAM_DIST = 4.10;
const MAX_CAM_DIST = 22.0;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const INITIAL_CAM_LAT = -46;
const INITIAL_CAM_LON = 0;
const INITIAL_CAM_DIST = 10.2;
const MIN_CAM_LAT = -90;
const MAX_CAM_LAT = 90;

function clampCamLat(lat: number): number {
  return Math.max(MIN_CAM_LAT, Math.min(MAX_CAM_LAT, lat));
}

function wrapLon(lon: number): number {
  let w = (((lon + 180) % 360) + 360) % 360 - 180;
  if (w === -180) w = 180;
  return w;
}

// Analytical northward meridian tangent at (latDeg, lonDeg) for Moon Trek North-Up orientation
function getNorthUpVector(latDeg: number, lonDeg: number, out?: THREE.Vector3): THREE.Vector3 {
  const phi = (90 - latDeg) * DEG2RAD;
  const theta = (lonDeg + 180) * DEG2RAD;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const target = out || new THREE.Vector3();
  target.set(
    cosPhi * Math.cos(theta),
    sinPhi,
    -cosPhi * Math.sin(theta)
  );
  return target.normalize();
}

function applySelenographicCamera(
  cam: THREE.PerspectiveCamera,
  latDeg: number,
  lonDeg: number,
  dist: number
) {
  const clampedLat = clampCamLat(latDeg);
  const phi = (90 - clampedLat) * DEG2RAD;
  const theta = (lonDeg + 180) * DEG2RAD;
  const sinPhi = Math.sin(phi);
  cam.position.set(
    -(dist * sinPhi * Math.cos(theta)),
    dist * Math.cos(phi),
    dist * sinPhi * Math.sin(theta)
  );
  getNorthUpVector(clampedLat, lonDeg, cam.up);
  cam.lookAt(0, 0, 0);
}

interface GraticuleMeridianLabel {
  id: string;
  lon: number;
  text: string;
  isPrime?: boolean;
}

interface GraticuleParallelLabel {
  id: string;
  lat: number;
  text: string;
  isEquator?: boolean;
}

const GRATICULE_MERIDIANS: GraticuleMeridianLabel[] = [
  { id: 'lon-0', lon: 0, text: '0°', isPrime: true },
  { id: 'lon-30e', lon: 30, text: '30°E' },
  { id: 'lon-60e', lon: 60, text: '60°E' },
  { id: 'lon-90e', lon: 90, text: '90°E' },
  { id: 'lon-120e', lon: 120, text: '120°E' },
  { id: 'lon-150e', lon: 150, text: '150°E' },
  { id: 'lon-180', lon: 180, text: '180°', isPrime: true },
  { id: 'lon-150w', lon: -150, text: '150°W' },
  { id: 'lon-120w', lon: -120, text: '120°W' },
  { id: 'lon-90w', lon: -90, text: '90°W' },
  { id: 'lon-60w', lon: -60, text: '60°W' },
  { id: 'lon-30w', lon: -30, text: '30°W' },
];

const GRATICULE_PARALLELS: GraticuleParallelLabel[] = [
  { id: 'lat-80n', lat: 80, text: '80°N' },
  { id: 'lat-60n', lat: 60, text: '60°N' },
  { id: 'lat-30n', lat: 30, text: '30°N' },
  { id: 'lat-0', lat: 0, text: '0° EQ', isEquator: true },
  { id: 'lat-30s', lat: -30, text: '30°S' },
  { id: 'lat-60s', lat: -60, text: '60°S' },
  { id: 'lat-80s', lat: -80, text: '80°S' },
];

const GRATICULE_POLES = [
  { id: 'pole-north', lat: 90, lon: 0, text: '▲ 90°N NORTH POLE' },
  { id: 'pole-south', lat: -90, lon: 0, text: '▼ 90°S SOUTH POLE' },
] as const;

const SHORT_NAMES: Record<string, string> = {
  cabeus_b_peak: 'CABEUS B PK',
  haworth: 'HAWORTH',
  malapert_massif: 'MALAPERT',
  mons_mouton: 'MONS MOUTON',
  mons_mouton_plateau: 'MOUTON PLT',
  nobile_rim_1: 'NOBILE RIM 1',
  nobile_rim_2: 'NOBILE RIM 2',
  de_gerlache_rim_2: 'DE GERLACHE',
  slater_plain: 'SLATER PLN',
  shackleton_rim: 'SHACKLETON',
  malapert_mountain: 'MALAPERT PK',
  nobile_crater_rim: 'NOBILE RGN',
  mare_tranquillitatis: 'APOLLO 11',
  connecting_ridge: 'CONN RIDGE',
};

const LABEL_OFFSETS: Record<string, { dx: number; dy: number; align: 'left' | 'right' }> = {
  cabeus_b_peak: { dx: -36, dy: -22, align: 'left' },
  haworth: { dx: -34, dy: 20, align: 'left' },
  malapert_massif: { dx: 34, dy: -36, align: 'right' },
  mons_mouton: { dx: 42, dy: -16, align: 'right' },
  mons_mouton_plateau: { dx: 42, dy: -52, align: 'right' },
  nobile_rim_1: { dx: 36, dy: 14, align: 'right' },
  nobile_rim_2: { dx: 42, dy: 42, align: 'right' },
  de_gerlache_rim_2: { dx: -38, dy: 44, align: 'left' },
  slater_plain: { dx: 36, dy: 64, align: 'right' },
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

interface CraterDescriptor {
  cx: number;
  cy: number;
  cz: number;
  rRad: number;
  rOuterRad: number;
  cosOuter: number;
  depthNorm: number;
  rimNorm: number;
  floorRatio: number;
  steepScale: number;
}

let cachedCraterDescriptors: CraterDescriptor[] | null = null;
function getCraterDescriptors(): CraterDescriptor[] {
  if (cachedCraterDescriptors) return cachedCraterDescriptors;
  cachedCraterDescriptors = getSouthPoleCraters().map((c) => {
    const center = latLonToCartesian(c.lat, c.lon, 1);
    const rRad = (c.radiusDeg * Math.PI) / 180;
    const rOuterRad = rRad * 1.48;
    const steepScale = 0.052 * Math.min(1.20, 0.78 + 0.22 / Math.sqrt(Math.max(0.22, c.radiusDeg)));
    return {
      cx: center.x,
      cy: center.y,
      cz: center.z,
      rRad,
      rOuterRad,
      cosOuter: Math.cos(rOuterRad),
      depthNorm: c.depthNorm,
      rimNorm: c.rimNorm,
      floorRatio: c.floorRadiusRatio ?? 0.42,
      steepScale,
    };
  });
  return cachedCraterDescriptors;
}

// Fast separable [0.25, 0.5, 0.25] smoothing over Float32 equirectangular buffers (removes 8-bit JPEG block chatter)
function smoothFloatGridSeparable(
  bufA: Float32Array,
  w: number,
  h: number,
  passes: number
): Float32Array {
  if (passes <= 0) return bufA;
  const bufB = new Float32Array(bufA.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const xm = x === 0 ? w - 1 : x - 1;
        const xp = x === w - 1 ? 0 : x + 1;
        bufB[row + x] = bufA[row + xm] * 0.25 + bufA[row + x] * 0.5 + bufA[row + xp] * 0.25;
      }
    }
    for (let y = 0; y < h; y++) {
      const ym = y === 0 ? 0 : y - 1;
      const yp = y === h - 1 ? h - 1 : y + 1;
      const rC = y * w;
      const rM = ym * w;
      const rP = yp * w;
      for (let x = 0; x < w; x++) {
        bufA[rC + x] = bufB[rM + x] * 0.25 + bufB[rC + x] * 0.5 + bufB[rP + x] * 0.25;
      }
    }
  }
  return bufA;
}

function buildSmoothedElevationFloatGrid(
  bumpImg: HTMLImageElement | undefined,
  w: number,
  h: number,
  passes: number
): Float32Array {
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
    for (let y = 0; y < h; y++) {
      const lat = 90 - ((y + 0.5) / h) * 180;
      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w) * 360 - 180;
        const val =
          128 +
          Math.sin(lat * 0.25 + lon * 0.18) * 26 +
          Math.cos(lon * 0.42 - lat * 0.31) * 18;
        elev[y * w + x] = Math.max(0, Math.min(255, val));
      }
    }
  }

  return smoothFloatGridSeparable(elev, w, h, passes);
}

// Bilinearly sample a Float32Array equirectangular grid along a 3D unit vector
function sampleFloatEquirectBilinear(
  arr: Float32Array,
  w: number,
  h: number,
  vx: number,
  vy: number,
  vz: number
): number {
  const invLen = 1.0 / Math.sqrt(vx * vx + vy * vy + vz * vz);
  const ny = Math.max(-1, Math.min(1, vy * invLen));
  const lat = Math.asin(ny);
  const lon = Math.atan2(-vz * invLen, vx * invLen);

  let fx = (lon / (2 * Math.PI) + 0.5) * w - 0.5;
  fx = ((fx % w) + w) % w;
  let fy = (0.5 - lat / Math.PI) * h - 0.5;
  if (fy < 0) fy = 0;
  else if (fy > h - 1) fy = h - 1;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = (x0 + 1) % w;
  const y1 = y0 < h - 1 ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;

  const r0 = y0 * w;
  const r1 = y1 * w;
  const v00 = arr[r0 + x0];
  const v10 = arr[r0 + x1];
  const v01 = arr[r1 + x0];
  const v11 = arr[r1 + x1];

  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

// Lookup local slope & elevation directly from TerrainGrid at arbitrary (lat, lon)
function sampleTerrainGrid(
  grid: TerrainGrid | null,
  latDeg: number,
  lonDeg: number
): { slopeDeg?: number; elevM?: number } {
  if (!grid) return {};
  const { width: w, height: h, slopeDeg, elevM } = grid;
  const fx = ((((lonDeg + 180) / 360) * w - 0.5) % w + w) % w;
  const fy = Math.max(0, Math.min(h - 1, ((90 - latDeg) / 180) * h - 0.5));

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = (x0 + 1) % w;
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const bilerp = (arr: Float32Array) => {
    const a = arr[y0 * w + x0] + (arr[y0 * w + x1] - arr[y0 * w + x0]) * tx;
    const b = arr[y1 * w + x0] + (arr[y1 * w + x1] - arr[y1 * w + x0]) * tx;
    return a + (b - a) * ty;
  };

  return {
    slopeDeg: Number(bilerp(slopeDeg).toFixed(1)),
    elevM: Math.round(bilerp(elevM)),
  };
}

// 1. Synthesize 4K Photographic Monochrome Albedo (4096x2048) & Smoothed 2K Object-Space Normal Map (2048x1024)
function paintLunarSurfaceTextures(
  monoCanvas: HTMLCanvasElement,
  monoTexture: THREE.CanvasTexture,
  normalCanvas: HTMLCanvasElement,
  normalTexture: THREE.CanvasTexture,
  lrocImg?: HTMLImageElement,
  bumpImg?: HTMLImageElement
) {
  // Pass A: Full 4K (4096x2048) Crisp Monochrome LROC Albedo + |lat| > 84 deg Isotropic Polar Smoothing
  const aw = ALBEDO_TEX_W;
  const ah = ALBEDO_TEX_H;
  const mctx = monoCanvas.getContext('2d', { willReadFrequently: true })!;

  if (lrocImg) {
    mctx.drawImage(lrocImg, 0, 0, aw, ah);
    const monoImgData = mctx.getImageData(0, 0, aw, ah);
    const mData = monoImgData.data;

    // Precompute fast 256-entry contrast curve LUT (zero Math.pow per pixel across 8.4 MP)
    const lumLut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      lumLut[v] = Math.min(255, Math.max(0, Math.round(Math.pow(v / 255, 1.05) * 238 + 8)));
    }

    // Clone only polar cap strips (|lat| > 84 deg) for fast isotropic cap smoothing without allocating 33 MB
    const capRows = Math.ceil((6.5 / 180) * ah) + 2;
    const deg2Rad = Math.PI / 180;
    const polarBandOffset = Math.max(0, ah - capRows);
    const southCapSrc = new Uint8ClampedArray(mData.subarray(polarBandOffset * aw * 4));
    const northCapSrc = new Uint8ClampedArray(mData.subarray(0, capRows * aw * 4));

    const totalAlbedoPx = aw * ah;
    for (let i = 0; i < totalAlbedoPx; i++) {
      const p4 = i * 4;
      const luma = Math.round(0.299 * mData[p4] + 0.587 * mData[p4 + 1] + 0.114 * mData[p4 + 2]);
      const val = lumLut[luma];
      mData[p4] = val;
      mData[p4 + 1] = val;
      mData[p4 + 2] = val;
      mData[p4 + 3] = 255;
    }

    // Isotropically blend |lat| > 84 deg rows to prevent UV converge stretching at the exact poles
    for (let py = 0; py < ah; py++) {
      const latDeg = 90 - ((py + 0.5) / ah) * 180;
      const absLat = Math.abs(latDeg);
      if (absLat <= 84) continue;

      const capT = Math.min(1, (absLat - 84) / 6.0);
      const capBlend = capT * capT * (3 - 2 * capT);
      const latRad = latDeg * deg2Rad;
      const sinLat = Math.sin(latRad);
      const cosLat = Math.cos(latRad);
      const isSouth = latDeg < 0;
      const stripSrc = isSouth ? southCapSrc : northCapSrc;
      const rowInStripBase = isSouth ? polarBandOffset : 0;
      const sr = 0.015;

      const sampleCap = (vx: number, vy: number, vz: number): number => {
        const invLen = 1.0 / Math.sqrt(vx * vx + vy * vy + vz * vz);
        const lat = Math.asin(Math.max(-1, Math.min(1, vy * invLen)));
        const lon = Math.atan2(-vz * invLen, vx * invLen);
        let fx = (lon / (2 * Math.PI) + 0.5) * aw - 0.5;
        fx = ((fx % aw) + aw) % aw;
        let fy = (0.5 - lat / Math.PI) * ah - 0.5 - rowInStripBase;
        fy = Math.max(0, Math.min(capRows - 1, fy));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = (x0 + 1) % aw;
        const y1 = Math.min(capRows - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        const v00 = stripSrc[(y0 * aw + x0) * 4];
        const v10 = stripSrc[(y0 * aw + x1) * 4];
        const v01 = stripSrc[(y1 * aw + x0) * 4];
        const v11 = stripSrc[(y1 * aw + x1) * 4];
        return (v00 + (v10 - v00) * tx) * (1 - ty) + (v01 + (v11 - v01) * tx) * ty;
      };

      const rowOff = py * aw;
      for (let px = 0; px < aw; px++) {
        const p4 = (rowOff + px) * 4;
        const lonRad = (((px + 0.5) / aw) * 360 - 180) * deg2Rad;
        const sinLon = Math.sin(lonRad);
        const cosLon = Math.cos(lonRad);
        const vx = cosLat * cosLon;
        const vy = sinLat;
        const vz = -cosLat * sinLon;
        const ex = -sinLon;
        const ez = -cosLon;
        const nxAxis = -sinLat * cosLon;
        const nyAxis = cosLat;
        const nzAxis = sinLat * sinLon;

        const isoRaw =
          (sampleCap(vx + sr * ex, vy, vz + sr * ez) +
            sampleCap(vx - sr * ex, vy, vz - sr * ez) +
            sampleCap(vx + sr * nxAxis, vy + sr * nyAxis, vz + sr * nzAxis) +
            sampleCap(vx - sr * nxAxis, vy - sr * nyAxis, vz - sr * nzAxis)) *
          0.25;
        const isoLum = lumLut[Math.min(255, Math.max(0, Math.round(isoRaw)))];
        const blended = Math.round(mData[p4] * (1 - capBlend) + isoLum * capBlend);
        mData[p4] = blended;
        mData[p4 + 1] = blended;
        mData[p4 + 2] = blended;
      }
    }

    mctx.putImageData(monoImgData, 0, 0);
  } else {
    mctx.fillStyle = '#8b8e94';
    mctx.fillRect(0, 0, aw, ah);
  }
  monoTexture.needsUpdate = true;

  // Pass B: Smoothed 2K Object-Space Normal Map (2048x1024) from Float32 De-Blocked LOLA + Polar Craters
  const nw = NORM_TEX_W;
  const nh = NORM_TEX_H;
  const nctx = normalCanvas.getContext('2d', { willReadFrequently: true })!;
  const smoothLola = bumpImg ? buildSmoothedElevationFloatGrid(bumpImg, nw, nh, 3) : null;
  const normalImgData = nctx.createImageData(nw, nh);
  const nData = normalImgData.data;

  const craters = getCraterDescriptors();
  const numCraters = craters.length;
  const deg2Rad = Math.PI / 180;
  const stepRad = 0.0042;

  for (let py = 0; py < nh; py++) {
    const latDeg = 90 - ((py + 0.5) / nh) * 180;
    const absLat = Math.abs(latDeg);
    const latRad = latDeg * deg2Rad;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    // Taper LOLA only inside extreme |lat| > 80 deg pole tip
    let lolaWeight = 1.0;
    if (absLat > 80) {
      const t = Math.min(1, (absLat - 80) / 10);
      lolaWeight = 1.0 - 0.75 * (t * t * (3 - 2 * t));
    }

    // Smooth cubic fade for polar crater relief (-70° = 0.0 -> -82° = 1.0)
    let polarBlend = 0.0;
    if (latDeg < -70) {
      const pt = Math.min(1, (-70 - latDeg) / 12);
      polarBlend = pt * pt * (3 - 2 * pt);
    }

    const rowOffset = py * nw;
    for (let px = 0; px < nw; px++) {
      const idx = rowOffset + px;
      const p4 = idx * 4;
      const lonRad = (((px + 0.5) / nw) * 360 - 180) * deg2Rad;
      const sinLon = Math.sin(lonRad);
      const cosLon = Math.cos(lonRad);

      const vx = cosLat * cosLon;
      const vy = sinLat;
      const vz = -cosLat * sinLon;

      const ex = -sinLon;
      const ez = -cosLon;
      const nxAxis = -sinLat * cosLon;
      const nyAxis = cosLat;
      const nzAxis = sinLat * sinLon;

      let dH_dEast = 0;
      let dH_dNorth = 0;

      if (smoothLola) {
        const eE_plus = sampleFloatEquirectBilinear(smoothLola, nw, nh, vx + stepRad * ex, vy, vz + stepRad * ez);
        const eE_minus = sampleFloatEquirectBilinear(smoothLola, nw, nh, vx - stepRad * ex, vy, vz - stepRad * ez);
        const eN_plus = sampleFloatEquirectBilinear(
          smoothLola,
          nw,
          nh,
          vx + stepRad * nxAxis,
          vy + stepRad * nyAxis,
          vz + stepRad * nzAxis
        );
        const eN_minus = sampleFloatEquirectBilinear(
          smoothLola,
          nw,
          nh,
          vx - stepRad * nxAxis,
          vy - stepRad * nyAxis,
          vz - stepRad * nzAxis
        );

        dH_dEast += ((eE_plus - eE_minus) / 255) * 1.95 * lolaWeight;
        dH_dNorth += ((eN_plus - eN_minus) / 255) * 1.95 * lolaWeight;
      }

      if (polarBlend > 0.002) {
        for (let ci = 0; ci < numCraters; ci++) {
          const c = craters[ci];
          const dot = vx * c.cx + vy * c.cy + vz * c.cz;
          if (dot <= c.cosOuter) continue;

          const clampedDot = dot > 1 ? 1 : dot;
          const theta = Math.acos(clampedDot);
          const sinTheta = Math.sqrt(Math.max(1e-10, 1 - clampedDot * clampedDot));
          const rNorm = theta / c.rRad;

          let dfDrNorm = 0;
          if (rNorm < 1.0) {
            const floorR = c.floorRatio;
            if (rNorm <= floorR) {
              dfDrNorm = 3.0 * c.rimNorm * rNorm * rNorm;
            } else {
              const span = Math.max(0.05, 1.0 - floorR);
              const u = (rNorm - floorR) / span;
              const dSmooth = (6 * u * (1 - u)) / span;
              dfDrNorm = c.depthNorm * dSmooth + 3.0 * c.rimNorm * rNorm * rNorm;
            }
          } else {
            const t = (rNorm - 1.0) / 0.48;
            if (t < 1.0) {
              const apron = 1.0 - t;
              dfDrNorm = -(2.0 * c.rimNorm * apron) / 0.48;
            }
          }

          if (Math.abs(dfDrNorm) > 1e-5) {
            const cDotE = c.cx * ex + c.cz * ez;
            const cDotN = c.cx * nxAxis + c.cy * nyAxis + c.cz * nzAxis;
            const factor = (dfDrNorm * c.steepScale * polarBlend) / sinTheta;
            dH_dEast += factor * -cDotE;
            dH_dNorth += factor * -cDotN;
          }
        }
      }

      // True 3D Object-Space surface normal: normalize(P - (dH_dE * E + dH_dN * N))
      const nxObj = vx - (dH_dEast * ex + dH_dNorth * nxAxis);
      const nyObj = vy - dH_dNorth * nyAxis;
      const nzObj = vz - (dH_dEast * ez + dH_dNorth * nzAxis);
      const invLen = 1.0 / Math.sqrt(nxObj * nxObj + nyObj * nyObj + nzObj * nzObj);
      nData[p4] = Math.min(255, Math.max(0, Math.round((nxObj * invLen * 0.5 + 0.5) * 255)));
      nData[p4 + 1] = Math.min(255, Math.max(0, Math.round((nyObj * invLen * 0.5 + 0.5) * 255)));
      nData[p4 + 2] = Math.min(255, Math.max(0, Math.round((nzObj * invLen * 0.5 + 0.5) * 255)));
      nData[p4 + 3] = 255;
    }
  }

  nctx.putImageData(normalImgData, 0, 0);
  normalTexture.needsUpdate = true;
}

// 2. Build 1024x512 seamless terrain grid using smoothed Float32 elevation & tight canonical site anchors
function buildTerrainGrid(presetSites: CandidateSite[], bumpImg?: HTMLImageElement): TerrainGrid {
  const w = GRID_W;
  const h = GRID_H;
  const n = w * h;

  const elev = buildSmoothedElevationFloatGrid(bumpImg, w, h, 3);

  const slopeDeg = new Float32Array(n);
  const elevM = new Float32Array(n);
  const roughnessCode = new Uint8Array(n);
  const horizonCutoffDeg = new Float32Array(n);
  const earthCutoffDeg = new Float32Array(n);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const nz = new Float32Array(n);

  const deg2Rad = Math.PI / 180;
  const stepRad = 0.010;

  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    const absLat = Math.abs(lat);
    const latRad = lat * deg2Rad;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    let lolaWeight = 1.0;
    if (absLat > 80) {
      const t = Math.min(1, (absLat - 80) / 10);
      lolaWeight = 1.0 - 0.75 * (t * t * (3 - 2 * t));
    }

    let polarBlend = 0.0;
    if (lat < -68) {
      const pt = Math.min(1, (-68 - lat) / 10);
      polarBlend = pt * pt * (3 - 2 * pt);
    }

    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const lon = ((x + 0.5) / w) * 360 - 180;
      const lonRad = lon * deg2Rad;
      const sinLon = Math.sin(lonRad);
      const cosLon = Math.cos(lonRad);

      const vx = cosLat * cosLon;
      const vy = sinLat;
      const vz = -cosLat * sinLon;
      nx[idx] = vx;
      ny[idx] = vy;
      nz[idx] = vz;

      const ex = -sinLon;
      const ez = -cosLon;
      const nxAxis = -sinLat * cosLon;
      const nyAxis = cosLat;
      const nzAxis = sinLat * sinLon;

      const eC = elev[idx];
      const eE_plus = sampleFloatEquirectBilinear(elev, w, h, vx + stepRad * ex, vy, vz + stepRad * ez);
      const eE_minus = sampleFloatEquirectBilinear(elev, w, h, vx - stepRad * ex, vy, vz - stepRad * ez);
      const eN_plus = sampleFloatEquirectBilinear(
        elev,
        w,
        h,
        vx + stepRad * nxAxis,
        vy + stepRad * nyAxis,
        vz + stepRad * nzAxis
      );
      const eN_minus = sampleFloatEquirectBilinear(
        elev,
        w,
        h,
        vx - stepRad * nxAxis,
        vy - stepRad * nyAxis,
        vz - stepRad * nzAxis
      );

      const dx = (eE_plus - eE_minus) * 0.5 * lolaWeight;
      const dy = (eN_plus - eN_minus) * 0.5 * lolaWeight;
      const grad = Math.sqrt(dx * dx + dy * dy);

      const baseSlope = 1.4 + grad * 0.48;
      const craterSample = lat < -68 ? sampleCraterField(lat, lon) : null;

      slopeDeg[idx] = craterSample
        ? Math.max(
          1.0,
          Math.min(28.0, baseSlope * (1 - polarBlend * 0.45) + craterSample.slopeDeg * polarBlend * 0.55)
        )
        : Math.max(1.0, Math.min(22.0, baseSlope));

      const lolaElevM = ((eC - 128) / 128) * 5200 * lolaWeight;
      const polarElevM = craterSample ? craterSample.heightNorm * 4200 * polarBlend : 0;
      elevM[idx] = Math.round(lolaElevM + polarElevM);

      // Clean gradient-based roughness without high-frequency Laplacian speckles
      roughnessCode[idx] = slopeDeg[idx] >= 13.5 || grad > 22 ? 2 : slopeDeg[idx] >= 6.8 || grad > 11 ? 1 : 0;

      horizonCutoffDeg[idx] = craterSample ? craterSample.horizonCutoffDeg : 0;
      earthCutoffDeg[idx] = craterSample ? Math.max(-1.8, craterSample.horizonCutoffDeg * 0.85) : 0;
    }
  }

  // Smooth slope contours cleanly before applying canonical site anchors
  smoothFloatGridSeparable(slopeDeg, w, h, 1);

  // Tight local Gaussian anchors (sigma = 0.9 deg) ONLY for canonical sites so no giant polar blotches appear
  const canonicalSites = presetSites.filter((s) => !s.id.startsWith('custom'));
  for (const site of canonicalSites) {
    const sLat = site.coordinates.latitude;
    const sLon = site.coordinates.longitude;
    const cosSiteLat = Math.max(0.08, Math.cos((sLat * Math.PI) / 180));
    const sigmaDeg = 0.9;
    const sigma2 = 2 * sigmaDeg * sigmaDeg;
    const siteRough =
      site.terrain.roughness === 'HIGH' ? 2 : site.terrain.roughness === 'MODERATE' ? 1 : 0;

    let siteSunCutoff = 0;
    let siteEarthCutoff = 0;
    const canonicalSunCutoff = getCanonicalSiteSunCutoffDeg(site.id);
    if (canonicalSunCutoff !== null) {
      siteSunCutoff = canonicalSunCutoff;
      siteEarthCutoff = site.coordinates.elevation_m >= 2500 ? -1.7 : 0;
    } else if (site.coordinates.elevation_m >= 2500) {
      siteSunCutoff = -1.65 - Math.min(0.6, (site.coordinates.elevation_m - 2500) / 4500);
      siteEarthCutoff = -1.7;
    } else if (site.coordinates.elevation_m <= -800 && sLat <= -75) {
      siteSunCutoff = 2.75;
    }
    if (site.id === 'nobile_crater_rim' || !site.defaultEarthLos) {
      siteEarthCutoff = Math.max(siteEarthCutoff, 10.8);
    }

    const minY = Math.max(0, Math.floor(((90 - (sLat + 3)) / 180) * h));
    const maxY = Math.min(h - 1, Math.ceil(((90 - (sLat - 3)) / 180) * h));

    for (let y = minY; y <= maxY; y++) {
      const lat = 90 - ((y + 0.5) / h) * 180;
      const dLat = lat - sLat;
      if (Math.abs(dLat) > 3) continue;

      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w) * 360 - 180;
        let dLon = lon - sLon;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        const scaledDLon = dLon * cosSiteLat;
        const d2 = dLat * dLat + scaledDLon * scaledDLon;
        if (d2 > 4.0) continue;

        const weight = Math.exp(-d2 / sigma2);
        if (weight < 0.05) continue;

        const idx = y * w + x;
        slopeDeg[idx] = slopeDeg[idx] * (1 - weight) + site.terrain.slope_deg * weight;
        elevM[idx] = Math.round(elevM[idx] * (1 - weight) + site.coordinates.elevation_m * weight);
        horizonCutoffDeg[idx] = horizonCutoffDeg[idx] * (1 - weight) + siteSunCutoff * weight;
        earthCutoffDeg[idx] = earthCutoffDeg[idx] * (1 - weight) + siteEarthCutoff * weight;
        if (weight > 0.5) {
          roughnessCode[idx] = siteRough;
        }
      }
    }
  }

  return {
    width: w,
    height: h,
    slopeDeg,
    elevM,
    roughnessCode,
    horizonCutoffDeg,
    earthCutoffDeg,
    nx,
    ny,
    nz,
  };
}

// 3. Paint anti-aliased dynamic RYG assessment overlay (1024x512) synced with ephemeris & terrain constraints
function paintDynamicOverlayTexture(
  grid: TerrainGrid,
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
  lander: LanderProfile | undefined,
  sunOffsetDays: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const {
    width,
    height,
    slopeDeg,
    roughnessCode,
    horizonCutoffDeg,
    earthCutoffDeg,
    nx,
    ny,
    nz,
  } = grid;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const maxSlope = lander ? lander.maxSlopeDeg : 15.0;
  const cautionSlope = lander ? lander.maxSlopeDeg * 0.75 : 5.0;
  const minIllum = lander ? lander.minIlluminationPct : 70;
  const criticalIllum = lander ? lander.minIlluminationPct * 0.5 : 30;
  const requiresLos = lander ? lander.requiresEarthLos : true;
  const maxRoughCode =
    !lander ? 0 : lander.maxRoughness === 'HIGH' ? 2 : lander.maxRoughness === 'MODERATE' ? 1 : 0;

  const { sunVec } = getSubsolarPoint(sunOffsetDays);
  const { sunVec: earthVec } = getEarthPoint(sunOffsetDays);
  const rad2Deg = 180 / Math.PI;

  const smooth01 = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };

  const total = width * height;
  for (let i = 0; i < total; i++) {
    const vx = nx[i];
    const vy = ny[i];
    const vz = nz[i];

    const dotSun = Math.max(-1, Math.min(1, vx * sunVec.x + vy * sunVec.y + vz * sunVec.z));
    const effectiveSunElev = Math.asin(dotSun) * rad2Deg - horizonCutoffDeg[i];
    const ill = sunElevToIlluminationPct(effectiveSunElev);

    const dotEarth = Math.max(-1, Math.min(1, vx * earthVec.x + vy * earthVec.y + vz * earthVec.z));
    const effectiveEarthElev = Math.asin(dotEarth) * rad2Deg - earthCutoffDeg[i];

    const s = slopeDeg[i];
    const r = roughnessCode[i];

    // Smooth continuous [0..2] risk score (0 = GO Green, 1 = Caution Amber, 2 = NO-GO Crimson)
    const slopeWarn = smooth01((s - cautionSlope * 0.88) / Math.max(0.4, cautionSlope * 0.24));
    const slopeCrit = smooth01((s - maxSlope * 0.90) / Math.max(0.4, maxSlope * 0.20));
    const slopeRisk = slopeWarn + slopeCrit;

    const illumWarn = smooth01((minIllum * 1.08 - ill) / Math.max(4, minIllum * 0.16));
    const illumCrit = smooth01((criticalIllum * 1.12 - ill) / Math.max(4, criticalIllum * 0.24));
    const illumRisk = illumWarn + illumCrit;

    let roughRisk = 0;
    if (lander) {
      if (r === 2) roughRisk = maxRoughCode === 2 ? 1.0 : 2.0;
      else if (r === 1 && maxRoughCode === 0) roughRisk = 1.0;
    } else {
      roughRisk = r === 2 ? 2.0 : r === 1 ? 1.0 : 0.0;
    }

    const dteWarn = smooth01((-1.8 - effectiveEarthElev) / 1.8);
    const dteCrit = requiresLos ? smooth01((-5.8 - effectiveEarthElev) / 2.2) : 0;
    const dteRisk = dteWarn + dteCrit;

    const riskScore = Math.min(2.0, Math.max(slopeRisk, illumRisk, roughRisk, dteRisk));

    let cr: number;
    let cg: number;
    let cb: number;
    if (riskScore <= 1.0) {
      cr = 16 + (245 - 16) * riskScore;
      cg = 185 + (158 - 185) * riskScore;
      cb = 129 + (11 - 129) * riskScore;
    } else {
      const t = riskScore - 1.0;
      cr = 245 + (239 - 245) * t;
      cg = 158 + (68 - 158) * t;
      cb = 11 + (68 - 11) * t;
    }

    const reliefAlpha = Math.max(
      155,
      Math.min(205, Math.round(164 + (ill / 100) * 18 + Math.min(18, s * 0.95)))
    );

    const p = i * 4;
    data[p] = Math.round(cr);
    data[p + 1] = Math.round(cg);
    data[p + 2] = Math.round(cb);
    data[p + 3] = reliefAlpha;
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
  missionEpochOffset = 0,
  onChangeDateOffset,
  onChangeMissionEpoch,
  onOpenTelemetryDrawer,
  leftDrawerOpen = false,
  rightDrawerOpen = false,
  rightDrawerWide = false,
  compareSiteIds = [],
  onToggleCompareSite,
  viewMode = 'planner',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [showAssessmentOverlay, setShowAssessmentOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(42);
  const [ambientLightEnabled, setAmbientLightEnabled] = useState<boolean>(false);
  const [ambientLightPct, setAmbientLightPct] = useState<number>(0);
  const [lastAmbientLightPct, setLastAmbientLightPct] = useState<number>(45);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCelestialVectors, setShowCelestialVectors] = useState<boolean>(true);
  const [showArtemisSites, setShowArtemisSites] = useState<boolean>(true);
  const [isLocalSurfaceOpen, setIsLocalSurfaceOpen] = useState<boolean>(false);
  const [isArtemisDropdownOpen, setIsArtemisDropdownOpen] = useState<boolean>(false);
  const [isArtemisInfoHovered, setIsArtemisInfoHovered] = useState<boolean>(false);
  const [isRygInfoHovered, setIsRygInfoHovered] = useState<boolean>(false);
  const [isSiteCardVisible, setIsSiteCardVisible] = useState<boolean>(true);
  const [hoverCoords, setHoverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [utcDateInput, setUtcDateInput] = useState<string>(
    () => formatMissionUtc(sunIlluminationOffset).dateStr
  );
  const [utcTimeInput, setUtcTimeInput] = useState<string>(
    () => formatMissionUtc(sunIlluminationOffset).timeStr
  );
  const [hoveredSite, setHoveredSite] = useState<CandidateSite | null>(null);

  // Imperative DOM refs for 60fps screen-space pin, celestial vector & graticule projection without React re-renders
  const lineElsRef = useRef<Map<string, SVGLineElement>>(new Map());
  const dotElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const labelElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const graticuleLabelElsRef = useRef<Map<string, HTMLSpanElement>>(new Map());
  const sunVectorLabelRef = useRef<HTMLDivElement | null>(null);
  const earthVectorLabelRef = useRef<HTMLDivElement | null>(null);
  const projectPinsNowRef = useRef<(() => void) | null>(null);
  const artemisMenuRef = useRef<HTMLDivElement | null>(null);

  // Re-open site inspection card automatically whenever user picks or probes a target
  useEffect(() => {
    setIsSiteCardVisible(true);
  }, [selectedSite.id, selectedSite.coordinates.latitude, selectedSite.coordinates.longitude]);

  // Close Artemis sites dropdown on outside click or Escape
  useEffect(() => {
    if (!isArtemisDropdownOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (artemisMenuRef.current && !artemisMenuRef.current.contains(e.target as Node)) {
        setIsArtemisDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsArtemisDropdownOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isArtemisDropdownOpen]);

  useEffect(() => {
    const formatted = formatMissionUtc(sunIlluminationOffset);
    setUtcDateInput(formatted.dateStr);
    setUtcTimeInput(formatted.timeStr);
  }, [sunIlluminationOffset]);

  const selectedSolarTelemetry = useMemo(
    () =>
      computeSolarTelemetryAtTime(
        selectedSite.coordinates.latitude,
        selectedSite.coordinates.longitude,
        sunIlluminationOffset,
        selectedSite
      ),
    [selectedSite, sunIlluminationOffset]
  );

  const selectedRiskTelemetry = useMemo(() => {
    const illumPct = computeSiteIllumination(selectedSite, sunIlluminationOffset);
    const hasLos = computeSiteEarthLos(selectedSite, sunIlluminationOffset);
    const risk = assessLandingSiteRisk(selectedSite, illumPct, hasLos, lander);
    return { illumPct, hasLos, risk };
  }, [selectedSite, sunIlluminationOffset, lander]);

  const onProbeCoordinateRef = useRef(onProbeCoordinate);
  onProbeCoordinateRef.current = onProbeCoordinate;

  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;

  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;

  const showCelestialVectorsRef = useRef(showCelestialVectors);
  showCelestialVectorsRef.current = showCelestialVectors;

  const showArtemisSitesRef = useRef(showArtemisSites);
  showArtemisSitesRef.current = showArtemisSites;

  // Dynamic telemetry snapshot per site for crisp 2D projected pins
  const siteMetricsMap = useMemo(() => {
    const map = new Map<string, { status: RiskLevel; illumPct: number; hasLos: boolean }>();
    sites.forEach((site) => {
      const illumPct = computeSiteIllumination(site, sunIlluminationOffset);
      const hasLos = computeSiteEarthLos(site, sunIlluminationOffset);
      const risk = assessLandingSiteRisk(site, illumPct, hasLos, lander);
      map.set(site.id, { status: risk.overall_status, illumPct, hasLos });
    });
    return map;
  }, [sites, sunIlluminationOffset, lander]);

  // Only canonical sites rebuild TerrainGrid; clicking custom spots on the Moon updates in <1ms
  const canonicalSitesSignature = useMemo(
    () =>
      sites
        .filter((s) => !s.id.startsWith('custom'))
        .map((s) => `${s.id}:${s.coordinates.latitude.toFixed(2)},${s.coordinates.longitude.toFixed(2)}`)
        .join('|'),
    [sites]
  );
  const builtSitesSigRef = useRef<string>('');

  const applyUtcChange = (nextDate: string, nextTime: string) => {
    setUtcDateInput(nextDate);
    setUtcTimeInput(nextTime);
    const parsedOffset = parseMissionUtcInputs(nextDate, nextTime);
    if (parsedOffset !== null) {
      if (onChangeMissionEpoch) {
        onChangeMissionEpoch(parsedOffset);
      } else if (onChangeDateOffset) {
        onChangeDateOffset(parsedOffset);
      }
    }
  };

  const siteMetricsRef = useRef(siteMetricsMap);
  siteMetricsRef.current = siteMetricsMap;

  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  const landerRef = useRef(lander);
  landerRef.current = lander;

  const sunOffsetRef = useRef(sunIlluminationOffset);
  sunOffsetRef.current = sunIlluminationOffset;

  const leftDrawerOpenRef = useRef(leftDrawerOpen);
  leftDrawerOpenRef.current = leftDrawerOpen;

  const rightDrawerOpenRef = useRef(rightDrawerOpen);
  rightDrawerOpenRef.current = rightDrawerOpen;

  // Scene & WebGL refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const moonMeshRef = useRef<THREE.Mesh | null>(null);
  const overlayMeshRef = useRef<THREE.Mesh | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const earthshineLightRef = useRef<THREE.DirectionalLight | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const landingZonesGroupRef = useRef<THREE.Group | null>(null);
  const graticuleGroupRef = useRef<THREE.Group | null>(null);
  const celestialVectorsGroupRef = useRef<THREE.Group | null>(null);
  const celestialEnvRef = useRef<CelestialSpaceEnvironment | null>(null);
  const sunArrowGroupRef = useRef<THREE.Group | null>(null);
  const earthArrowGroupRef = useRef<THREE.Group | null>(null);

  // Terrain & Dynamic Overlay Canvas refs
  const terrainGridRef = useRef<TerrainGrid | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const bumpImgRef = useRef<HTMLImageElement | undefined>(undefined);

  // Moon Trek (CesiumJS constrained polar axis) North-Up spherical camera state
  const camLatRef = useRef<number>(INITIAL_CAM_LAT);
  const camLonRef = useRef<number>(INITIAL_CAM_LON);
  const camDistRef = useRef<number>(INITIAL_CAM_DIST);
  const targetCamDistRef = useRef<number>(INITIAL_CAM_DIST);
  const angVelRef = useRef<{ lat: number; lon: number }>({ lat: 0, lon: 0 });
  const flyAnimRef = useRef<{
    targetLat: number;
    targetLon: number;
    targetDist: number;
  } | null>(null);
  const hasMountedFlyRef = useRef<boolean>(false);
  const skipNextFlyRef = useRef<boolean>(false);

  // Fly camera to a specific landing site centered smoothly with North kept strictly Up
  const flyToSite = useCallback((site: CandidateSite) => {
    const targetDist = camDistRef.current < 4.55 ? 4.15 : 4.65;
    const targetLat = clampCamLat(site.coordinates.latitude);
    const targetLon = wrapLon(site.coordinates.longitude);

    angVelRef.current = { lat: 0, lon: 0 };
    targetCamDistRef.current = targetDist;
    flyAnimRef.current = {
      targetLat,
      targetLon,
      targetDist,
    };
  }, []);

  // Fly camera to Earth-facing Near Side centered on (0°N, 0°E) with North Up
  const zoomToEarthSide = useCallback(() => {
    angVelRef.current = { lat: 0, lon: 0 };
    targetCamDistRef.current = INITIAL_CAM_DIST;
    flyAnimRef.current = {
      targetLat: 0,
      targetLon: 0,
      targetDist: INITIAL_CAM_DIST,
    };
  }, []);

  // Zoom directly over the exact 90°S South Pole with North Up along 0° meridian
  const zoomToSouthPole = useCallback(() => {
    const targetDist = 5.8;
    angVelRef.current = { lat: 0, lon: 0 };
    targetCamDistRef.current = targetDist;
    flyAnimRef.current = {
      targetLat: -90,
      targetLon: 0,
      targetDist,
    };
  }, []);

  // Setup Three.js Scene + Moon Trek North-Up Constrained-Axis Globe Controller
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    camLatRef.current = INITIAL_CAM_LAT;
    camLonRef.current = INITIAL_CAM_LON;
    camDistRef.current = INITIAL_CAM_DIST;
    targetCamDistRef.current = INITIAL_CAM_DIST;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1200);
    applySelenographicCamera(camera, camLatRef.current, camLonRef.current, camDistRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x020306, 1);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Monochrome lighting (crisp high-contrast solar light aligned to synodic ephemeris; ambient starts OFF)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.0);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const { sunVec: initSunVec } = getSubsolarPoint(sunOffsetRef.current);
    const { sunVec: initEarthVec } = getEarthPoint(sunOffsetRef.current);
    const dirLight = new THREE.DirectionalLight(0xffffff, 3.15);
    dirLight.position.set(initSunVec.x * 260, initSunVec.y * 260, initSunVec.z * 260);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const celestialEnv = buildCelestialSpaceEnvironment(maxAniso);
    celestialEnv.updateEphemeris(initSunVec, initEarthVec, sunOffsetRef.current);
    scene.add(celestialEnv.rootGroup);
    celestialEnvRef.current = celestialEnv;

    const earthshineLight = new THREE.DirectionalLight(0xd1d5db, 0.02);
    earthshineLight.position.set(-initSunVec.x * 12, -initSunVec.y * 12, -initSunVec.z * 12);
    scene.add(earthshineLight);
    earthshineLightRef.current = earthshineLight;

    // 1. Unified Monochrome Lunar Base Sphere (LROC + Spherical Tangent LOLA + Feathered Polar Craters)
    const monoCanvas = document.createElement('canvas');
    monoCanvas.width = ALBEDO_TEX_W;
    monoCanvas.height = ALBEDO_TEX_H;
    const monoTexture = new THREE.CanvasTexture(monoCanvas);
    monoTexture.wrapS = THREE.RepeatWrapping;
    monoTexture.wrapT = THREE.ClampToEdgeWrapping;
    monoTexture.anisotropy = maxAniso;

    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = NORM_TEX_W;
    normalCanvas.height = NORM_TEX_H;
    const normalTexture = new THREE.CanvasTexture(normalCanvas);
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.ClampToEdgeWrapping;
    normalTexture.generateMipmaps = false;
    normalTexture.minFilter = THREE.LinearFilter;
    normalTexture.magFilter = THREE.LinearFilter;

    let loadedLrocImg: HTMLImageElement | undefined;
    let loadedBumpImg: HTMLImageElement | undefined;
    let isCleanedUp = false;

    paintLunarSurfaceTextures(
      monoCanvas,
      monoTexture,
      normalCanvas,
      normalTexture
    );

    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 256, 256);
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: monoTexture,
      normalMap: normalTexture,
      normalMapType: THREE.ObjectSpaceNormalMap,
      roughness: 0.92,
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
    overlayTexture.anisotropy = maxAniso;
    overlayTextureRef.current = overlayTexture;

    const overlayGeo = new THREE.SphereGeometry(MOON_RADIUS * 1.002, 256, 256);
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

    // Seed terrain grid immediately, then refine once /textures/lroc_color_poles_4k.jpg & /textures/lola_bump_2k.jpg load
    builtSitesSigRef.current = canonicalSitesSignature;
    terrainGridRef.current = buildTerrainGrid(sitesRef.current);
    paintDynamicOverlayTexture(
      terrainGridRef.current,
      overlayCanvas,
      overlayTexture,
      lander,
      sunIlluminationOffset
    );

    const lrocImg = new Image();
    lrocImg.crossOrigin = 'anonymous';
    let triedLrocFallback = false;
    lrocImg.onload = () => {
      if (isCleanedUp) return;
      loadedLrocImg = lrocImg;
      paintLunarSurfaceTextures(
        monoCanvas,
        monoTexture,
        normalCanvas,
        normalTexture,
        loadedLrocImg,
        loadedBumpImg
      );
    };
    lrocImg.onerror = () => {
      if (!triedLrocFallback) {
        triedLrocFallback = true;
        lrocImg.src = '/textures/lroc_color_2k.jpg';
      }
    };
    lrocImg.src = '/textures/lroc_color_poles_4k.jpg';

    const bumpImg = new Image();
    bumpImg.crossOrigin = 'anonymous';
    bumpImg.onload = () => {
      if (isCleanedUp) return;
      loadedBumpImg = bumpImg;
      bumpImgRef.current = bumpImg;
      paintLunarSurfaceTextures(
        monoCanvas,
        monoTexture,
        normalCanvas,
        normalTexture,
        loadedLrocImg,
        loadedBumpImg
      );
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

    // 2b. Selenographic Graticule: Lines of Longitude (Meridians) & Latitude Parallels
    const graticuleGroup = new THREE.Group();
    const gridR = MOON_RADIUS * 1.0032;

    const meridianMatMajor = new THREE.LineBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const meridianMatPrime = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.50,
      depthWrite: false,
    });
    const meridianMatMinor = new THREE.LineBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    const equatorMat = new THREE.LineBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const parallelMat = new THREE.LineBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.20,
      depthWrite: false,
    });
    const poleRingMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const graticuleGeometries: THREE.BufferGeometry[] = [];
    for (let lon = -165; lon <= 180; lon += 15) {
      const isPrimeOrAnti = lon === 0 || lon === 180;
      const isMajor = lon % 30 === 0;
      const latLimit = isMajor ? 89.5 : 80;
      const pts: THREE.Vector3[] = [];
      for (let lat = -latLimit; lat <= latLimit + 0.001; lat += 2.5) {
        pts.push(latLonToVector3(Math.min(latLimit, lat), lon, gridR));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      graticuleGeometries.push(geo);
      const mat = isPrimeOrAnti ? meridianMatPrime : isMajor ? meridianMatMajor : meridianMatMinor;
      const line = new THREE.Line(geo, mat);
      line.raycast = () => { };
      graticuleGroup.add(line);
    }

    const parallelLats = [-89.5, -80, -60, -30, 0, 30, 60, 80, 89.5];
    for (const lat of parallelLats) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 3) {
        pts.push(latLonToVector3(lat, lon, gridR));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      graticuleGeometries.push(geo);
      const mat =
        lat === 0
          ? equatorMat
          : Math.abs(lat) > 89
            ? poleRingMat
            : parallelMat;
      const line = new THREE.Line(geo, mat);
      line.raycast = () => { };
      graticuleGroup.add(line);
    }

    scene.add(graticuleGroup);
    graticuleGroupRef.current = graticuleGroup;

    // 2c. 3D Celestial Direction Indicators (SUN vector & EARTH DTE vector)
    const celestialVectorsGroup = new THREE.Group();
    const vectorUp = new THREE.Vector3(0, 1, 0);

    const buildCelestialArrow = (
      shaftColor: number,
      headColor: number,
      ringColor: number
    ): {
      group: THREE.Group;
      geometries: THREE.BufferGeometry[];
      materials: THREE.Material[];
    } => {
      const grp = new THREE.Group();
      const shaftStart = MOON_RADIUS * 1.07;
      const shaftLen = MOON_RADIUS * 0.34;
      const shaftGeo = new THREE.CylinderGeometry(0.016, 0.016, shaftLen, 12);
      const shaftMat = new THREE.MeshBasicMaterial({
        color: shaftColor,
        transparent: true,
        opacity: 0.9,
      });
      const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
      shaftMesh.position.y = shaftStart + shaftLen * 0.5;
      shaftMesh.raycast = () => { };
      grp.add(shaftMesh);

      const headLen = 0.17;
      const headGeo = new THREE.ConeGeometry(0.062, headLen, 16);
      const headMat = new THREE.MeshBasicMaterial({ color: headColor });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.position.y = shaftStart + shaftLen + headLen * 0.5;
      headMesh.raycast = () => { };
      grp.add(headMesh);

      const collarGeo = new THREE.RingGeometry(0.048, 0.072, 24);
      const collarMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
      });
      const collarMesh = new THREE.Mesh(collarGeo, collarMat);
      collarMesh.rotation.x = Math.PI / 2;
      collarMesh.position.y = shaftStart;
      collarMesh.raycast = () => { };
      grp.add(collarMesh);

      return {
        group: grp,
        geometries: [shaftGeo, headGeo, collarGeo],
        materials: [shaftMat, headMat, collarMat],
      };
    };

    const sunArrowBuilt = buildCelestialArrow(0xf59e0b, 0xfef08a, 0xfacc15);
    const initSunDir = new THREE.Vector3(initSunVec.x, initSunVec.y, initSunVec.z).normalize();
    sunArrowBuilt.group.quaternion.setFromUnitVectors(vectorUp, initSunDir);
    celestialVectorsGroup.add(sunArrowBuilt.group);
    sunArrowGroupRef.current = sunArrowBuilt.group;

    const earthArrowBuilt = buildCelestialArrow(0x0ea5e9, 0x7dd3fc, 0x38bdf8);
    const initEarthDir = new THREE.Vector3(
      initEarthVec.x,
      initEarthVec.y,
      initEarthVec.z
    ).normalize();
    earthArrowBuilt.group.quaternion.setFromUnitVectors(vectorUp, initEarthDir);
    celestialVectorsGroup.add(earthArrowBuilt.group);
    earthArrowGroupRef.current = earthArrowBuilt.group;

    celestialVectorsGroup.visible = showCelestialVectorsRef.current;
    scene.add(celestialVectorsGroup);
    celestialVectorsGroupRef.current = celestialVectorsGroup;

    // 3. Pickable 3D Hit Spheres & Static Selected Target Ring
    const pinsGroup = new THREE.Group();
    scene.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    const landingZonesGroup = new THREE.Group();
    scene.add(landingZonesGroup);
    landingZonesGroupRef.current = landingZonesGroup;

    // 4. Moon Trek Constrained North-Up Pointer Pan (Left) + Zoom (Right Drag / Wheel) + Surface Probe Click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isPointerDown = false;
    let activePointerId: number | null = null;
    let activeButton = 0;
    let didDrag = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastHoverSiteId: string | null = null;
    let lastHoverCheck = 0;

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      if (event.button === 2) {
        event.preventDefault();
      }
      isPointerDown = true;
      activePointerId = event.pointerId;
      activeButton = event.button;
      didDrag = false;
      downX = event.clientX;
      downY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;

      flyAnimRef.current = null;
      angVelRef.current = { lat: 0, lon: 0 };
      if (event.button === 2) {
        renderer.domElement.style.cursor = 'ns-resize';
      } else {
        renderer.domElement.style.cursor = 'grabbing';
      }

      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable in synthetic tests
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (isPointerDown) {
        const totalDx = event.clientX - downX;
        const totalDy = event.clientY - downY;
        if (!didDrag && totalDx * totalDx + totalDy * totalDy > 16) {
          didDrag = true;
        }
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;

        if (activeButton === 2) {
          // Right-click + drag: Moon Trek / Cesium continuous zoom (drag down = zoom in, drag up = zoom out)
          const factor = Math.max(0.75, Math.min(1.35, 1 - dy * 0.005));
          const nextDist = Math.max(
            MIN_CAM_DIST,
            Math.min(MAX_CAM_DIST, targetCamDistRef.current * factor)
          );
          targetCamDistRef.current = nextDist;
          camDistRef.current += (nextDist - camDistRef.current) * 0.5;
          applySelenographicCamera(camera, camLatRef.current, camLonRef.current, camDistRef.current);
          return;
        }

        // Left-click + drag: Constrained North-Up selenographic pan
        const scaleRad =
          Math.max(0.055, (camDistRef.current - MOON_RADIUS * 0.96) / (MOON_RADIUS * 1.6)) * 0.0052;
        const scaleDeg = scaleRad * RAD2DEG;
        const cosLat = Math.max(0.25, Math.cos(camLatRef.current * DEG2RAD));
        const dLat = dy * scaleDeg;
        const dLon = -(dx * scaleDeg) / cosLat;

        camLatRef.current = clampCamLat(camLatRef.current + dLat);
        camLonRef.current = wrapLon(camLonRef.current + dLon);
        applySelenographicCamera(camera, camLatRef.current, camLonRef.current, camDistRef.current);
        angVelRef.current = { lat: dLat, lon: dLon };
        return;
      }

      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;

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
          const hitSite = obj.userData.site as CandidateSite;
          if (lastHoverSiteId !== hitSite.id) {
            lastHoverSiteId = hitSite.id;
            setHoveredSite(hitSite);
          }
          setHoverCoords({
            lat: hitSite.coordinates.latitude,
            lon: hitSite.coordinates.longitude,
          });
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }

      if (lastHoverSiteId !== null) {
        lastHoverSiteId = null;
        setHoveredSite(null);
      }

      if (moonMeshRef.current) {
        const moonHits = raycaster.intersectObject(moonMeshRef.current);
        if (moonHits.length > 0) {
          const localHit = moonMeshRef.current.worldToLocal(moonHits[0].point.clone());
          const { latitude, longitude } = vector3ToLatLon(
            localHit.x,
            localHit.y,
            localHit.z,
            MOON_RADIUS
          );
          setHoverCoords({ lat: latitude, lon: longitude });
          renderer.domElement.style.cursor = 'crosshair';
          return;
        }
      }

      setHoverCoords(null);
      renderer.domElement.style.cursor = 'grab';
    };

    const handlePointerLeave = () => {
      setHoverCoords(null);
      if (lastHoverSiteId !== null) {
        lastHoverSiteId = null;
        setHoveredSite(null);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!isPointerDown) return;
      const wasDrag = didDrag;
      const buttonReleased = activeButton;
      isPointerDown = false;
      if (activePointerId !== null) {
        try {
          renderer.domElement.releasePointerCapture(activePointerId);
        } catch {
          // Ignore release failures
        }
        activePointerId = null;
      }
      renderer.domElement.style.cursor = 'grab';

      if (event.type === 'pointercancel' || wasDrag || buttonReleased !== 0) {
        return;
      }

      angVelRef.current = { lat: 0, lon: 0 };

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Check existing site pins first
      const pinHits = raycaster.intersectObjects(pinsGroup.children, true);
      if (pinHits.length > 0) {
        let obj: THREE.Object3D | null = pinHits[0].object;
        while (obj && !obj.userData?.site) {
          obj = obj.parent;
        }
        if (obj && obj.userData?.site) {
          skipNextFlyRef.current = true;
          setIsSiteCardVisible(true);
          onSelectSiteRef.current(obj.userData.site);
          return;
        }
      }

      // 2. Direct click anywhere on Moon surface -> sample LOLA grid & update selected assessment in place
      if (moonMeshRef.current) {
        const moonHits = raycaster.intersectObject(moonMeshRef.current);
        if (moonHits.length > 0) {
          const localHit = moonMeshRef.current.worldToLocal(moonHits[0].point.clone());
          const { latitude, longitude } = vector3ToLatLon(
            localHit.x,
            localHit.y,
            localHit.z,
            MOON_RADIUS
          );
          const sampled = sampleTerrainGrid(terrainGridRef.current, latitude, longitude);
          skipNextFlyRef.current = true;
          setIsSiteCardVisible(true);
          if (onProbeCoordinateRef.current) {
            onProbeCoordinateRef.current(
              latitude,
              longitude,
              undefined,
              sampled.slopeDeg,
              sampled.elevM
            );
          }
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      flyAnimRef.current = null;
      const factor = Math.max(0.75, Math.min(1.35, 1 + event.deltaY * 0.001));
      const nextDist = Math.max(
        MIN_CAM_DIST,
        Math.min(MAX_CAM_DIST, targetCamDistRef.current * factor)
      );
      targetCamDistRef.current = nextDist;
    };

    renderer.domElement.addEventListener('contextmenu', handleContextMenu);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

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

    // 6. Imperative 60fps DOM Projection for Telemetry Markers, Non-Overlapping Leader Lines & Graticule Labels
    const camToSite = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    const surfaceNormal = new THREE.Vector3();
    const ndc = new THREE.Vector3();

    interface PinLayout {
      id: string;
      sx: number;
      sy: number;
      labelX: number;
      labelY: number;
      align: 'left' | 'right';
    }

    const updateProjectedPinsDOM = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const currentSites = sitesRef.current;

      const leftOpen = leftDrawerOpenRef.current && w >= 1024;
      const rightOpen = rightDrawerOpenRef.current && w >= 1024;
      const safeLeft = leftOpen ? 396 : 16;
      const safeRight = rightOpen ? w - 512 : w - 16;
      const safeTop = leftOpen && rightOpen ? 104 : 66;
      const safeBottom = leftOpen && rightOpen ? h - 104 : h - 74;

      const visiblePins: PinLayout[] = [];
      const visibleIds = new Set<string>();
      const artemisVisible = showArtemisSitesRef.current;

      for (const site of currentSites) {
        if (!site.id.startsWith('custom') && !artemisVisible) continue;
        const localPos = latLonToVector3(
          site.coordinates.latitude,
          site.coordinates.longitude,
          MOON_RADIUS * 1.005
        );
        worldPos.copy(localPos).applyEuler(moonMesh.rotation);
        surfaceNormal.copy(worldPos).normalize();
        camToSite.copy(camera.position).sub(worldPos).normalize();

        if (surfaceNormal.dot(camToSite) <= 0.02) continue;

        ndc.copy(worldPos).project(camera);
        if (ndc.z > 1) continue;

        const sx = (ndc.x * 0.5 + 0.5) * w;
        const sy = (-ndc.y * 0.5 + 0.5) * h;

        if (sx < safeLeft || sx > safeRight || sy < safeTop || sy > safeBottom) {
          continue;
        }

        const offset = LABEL_OFFSETS[site.id] || {
          dx: ndc.x < 0 ? -36 : 36,
          dy: ndc.y > 0 ? 22 : -28,
          align: ndc.x < 0 ? ('left' as const) : ('right' as const),
        };

        const labelX =
          offset.align === 'left'
            ? Math.max(safeLeft + 148, Math.min(safeRight - 8, sx + offset.dx))
            : Math.max(safeLeft + 8, Math.min(safeRight - 148, sx + offset.dx));
        let labelY = Math.max(safeTop + 8, Math.min(safeBottom - 8, sy + offset.dy));

        // Keep labels clear of the bottom-left Surface Coordinates & Risk HUD Card
        if (labelX < safeLeft + 345 && labelY > h - 245) {
          labelY = Math.max(safeTop + 8, h - 250);
        }

        visibleIds.add(site.id);
        visiblePins.push({
          id: site.id,
          sx,
          sy,
          labelX,
          labelY,
          align: offset.align,
        });
      }

      const resolveOverlap = (items: PinLayout[]) => {
        items.sort((a, b) => a.labelY - b.labelY);
        const minGap = 28;
        for (let i = 1; i < items.length; i++) {
          if (
            Math.abs(items[i].labelX - items[i - 1].labelX) < 185 &&
            items[i].labelY - items[i - 1].labelY < minGap
          ) {
            items[i].labelY = Math.min(safeBottom - 8, items[i - 1].labelY + minGap);
          }
        }
      };

      resolveOverlap(visiblePins.filter((p) => p.align === 'left'));
      resolveOverlap(visiblePins.filter((p) => p.align === 'right'));

      for (const p of visiblePins) {
        const dotEl = dotElsRef.current.get(p.id);
        const labelEl = labelElsRef.current.get(p.id);
        const lineEl = lineElsRef.current.get(p.id);

        if (dotEl) {
          dotEl.style.display = 'flex';
          dotEl.style.transform = `translate3d(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
        if (labelEl) {
          labelEl.style.display = 'flex';
          const txPct = p.align === 'left' ? '-100%' : '0%';
          labelEl.style.transform = `translate3d(${p.labelX.toFixed(1)}px, ${p.labelY.toFixed(1)}px, 0) translate(${txPct}, -50%)`;
        }
        if (lineEl) {
          lineEl.style.display = 'inline';
          lineEl.setAttribute('x1', p.sx.toFixed(1));
          lineEl.setAttribute('y1', p.sy.toFixed(1));
          lineEl.setAttribute('x2', p.labelX.toFixed(1));
          lineEl.setAttribute('y2', p.labelY.toFixed(1));
        }
      }

      for (const site of currentSites) {
        if (visibleIds.has(site.id)) continue;
        const dotEl = dotElsRef.current.get(site.id);
        const labelEl = labelElsRef.current.get(site.id);
        const lineEl = lineElsRef.current.get(site.id);
        if (dotEl) dotEl.style.display = 'none';
        if (labelEl) labelEl.style.display = 'none';
        if (lineEl) lineEl.style.display = 'none';
      }

      // Project North/South Pole indicators, meridian longitude labels, and latitude parallel labels
      const gridVisible = showGridRef.current;
      const projectGraticuleLabel = (
        id: string,
        latDeg: number,
        lonDeg: number,
        minDot: number,
        offsetYCss = '-50%'
      ) => {
        const el = graticuleLabelElsRef.current.get(id);
        if (!el) return;
        if (!gridVisible) {
          el.style.display = 'none';
          return;
        }
        const pos = latLonToVector3(latDeg, lonDeg, MOON_RADIUS * 1.005);
        worldPos.copy(pos).applyEuler(moonMesh.rotation);
        surfaceNormal.copy(worldPos).normalize();
        camToSite.copy(camera.position).sub(worldPos).normalize();

        if (surfaceNormal.dot(camToSite) <= minDot) {
          el.style.display = 'none';
          return;
        }
        ndc.copy(worldPos).project(camera);
        if (ndc.z > 1) {
          el.style.display = 'none';
          return;
        }
        const sx = (ndc.x * 0.5 + 0.5) * w;
        const sy = (-ndc.y * 0.5 + 0.5) * h;

        const inBottomLeftHud = sx < safeLeft + 348 && sy > h - 248;
        if (
          inBottomLeftHud ||
          sx < safeLeft + 24 ||
          sx > safeRight - 24 ||
          sy < safeTop + 14 ||
          sy > safeBottom - 14
        ) {
          el.style.display = 'none';
          return;
        }
        el.style.display = 'inline-flex';
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, ${offsetYCss})`;
      };

      for (const pole of GRATICULE_POLES) {
        const offsetCss = pole.lat > 0 ? 'calc(-50% - 22px)' : 'calc(-50% + 52px)';
        projectGraticuleLabel(pole.id, pole.lat, pole.lon, 0.04, offsetCss);
      }

      const meridianLabelLat = Math.max(-76, Math.min(76, camLatRef.current));
      for (const m of GRATICULE_MERIDIANS) {
        projectGraticuleLabel(m.id, meridianLabelLat, m.lon, 0.24);
      }

      const parallelLabelLon = wrapLon(camLonRef.current - 16);
      for (const par of GRATICULE_PARALLELS) {
        projectGraticuleLabel(par.id, par.lat, parallelLabelLon, 0.20);
      }

      // Project 3D Sun & Earth Vector Direction Labels at their orbital arrow tips
      const projectCelestialTipLabel = (
        el: HTMLDivElement | null,
        dirUnit: { x: number; y: number; z: number }
      ) => {
        if (!el) return;
        if (!showCelestialVectorsRef.current) {
          el.style.display = 'none';
          return;
        }
        const tipDist = MOON_RADIUS * 1.62;
        worldPos.set(dirUnit.x * tipDist, dirUnit.y * tipDist, dirUnit.z * tipDist);
        ndc.copy(worldPos).project(camera);
        if (ndc.z > 1) {
          el.style.display = 'none';
          return;
        }
        const sx = (ndc.x * 0.5 + 0.5) * w;
        const sy = (-ndc.y * 0.5 + 0.5) * h;
        if (sx < safeLeft + 18 || sx > safeRight - 18 || sy < safeTop + 12 || sy > safeBottom - 12) {
          el.style.display = 'none';
          return;
        }

        const rayDir = worldPos.clone().sub(camera.position);
        const rayLen = rayDir.length();
        rayDir.divideScalar(Math.max(1e-5, rayLen));
        const tClosest = -camera.position.dot(rayDir);
        const dMinSq = camera.position.lengthSq() - tClosest * tClosest;
        const occludedBehindMoon =
          tClosest > 0 && tClosest < rayLen && dMinSq < MOON_RADIUS * MOON_RADIUS * 0.96;

        el.style.display = 'inline-flex';
        el.style.opacity = occludedBehindMoon ? '0.4' : '1';
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      };

      const { sunVec: curSunVec } = getSubsolarPoint(sunOffsetRef.current);
      const { sunVec: curEarthVec } = getEarthPoint(sunOffsetRef.current);
      projectCelestialTipLabel(sunVectorLabelRef.current, curSunVec);
      projectCelestialTipLabel(earthVectorLabelRef.current, curEarthVec);
    };
    projectPinsNowRef.current = updateProjectedPinsDOM;

    // 7. Render Loop (60fps zero-React-rerender Moon Trek North-Up spherical pan + zoom damping)
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      let cameraUpdated = false;

      const fly = flyAnimRef.current;
      if (fly) {
        camLatRef.current += (fly.targetLat - camLatRef.current) * 0.09;
        let dLon = fly.targetLon - camLonRef.current;
        while (dLon > 180) dLon -= 360;
        while (dLon < -180) dLon += 360;
        camLonRef.current = wrapLon(camLonRef.current + dLon * 0.09);
        camDistRef.current += (fly.targetDist - camDistRef.current) * 0.09;

        if (
          Math.abs(fly.targetLat - camLatRef.current) < 0.05 &&
          Math.abs(dLon) < 0.05 &&
          Math.abs(fly.targetDist - camDistRef.current) < 0.015
        ) {
          camLatRef.current = clampCamLat(fly.targetLat);
          camLonRef.current = wrapLon(fly.targetLon);
          camDistRef.current = fly.targetDist;
          flyAnimRef.current = null;
        }
        cameraUpdated = true;
      } else {
        // Smooth wheel & right-drag zoom interpolation
        if (Math.abs(targetCamDistRef.current - camDistRef.current) > 0.002) {
          camDistRef.current += (targetCamDistRef.current - camDistRef.current) * 0.14;
          cameraUpdated = true;
        }

        // Smooth drag momentum damping after mouse release
        if (!isPointerDown) {
          const vLat = angVelRef.current.lat;
          const vLon = angVelRef.current.lon;
          if (Math.abs(vLat) > 1e-4 || Math.abs(vLon) > 1e-4) {
            camLatRef.current = clampCamLat(camLatRef.current + vLat);
            camLonRef.current = wrapLon(camLonRef.current + vLon);
            angVelRef.current.lat = vLat * 0.88;
            angVelRef.current.lon = vLon * 0.88;
            cameraUpdated = true;
          }
        }
      }

      if (cameraUpdated) {
        applySelenographicCamera(camera, camLatRef.current, camLonRef.current, camDistRef.current);
      }

      renderer.render(scene, camera);
      updateProjectedPinsDOM();
    };
    animate();

    return () => {
      isCleanedUp = true;
      projectPinsNowRef.current = null;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
        renderer.domElement.removeEventListener('pointerup', handlePointerUp);
        renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
        renderer.domElement.removeEventListener('wheel', handleWheel);
      }
      graticuleGeometries.forEach((g) => g.dispose());
      meridianMatMajor.dispose();
      meridianMatPrime.dispose();
      meridianMatMinor.dispose();
      equatorMat.dispose();
      parallelMat.dispose();
      poleRingMat.dispose();
      sunArrowBuilt.geometries.forEach((g) => g.dispose());
      sunArrowBuilt.materials.forEach((m) => m.dispose());
      earthArrowBuilt.geometries.forEach((g) => g.dispose());
      earthArrowBuilt.materials.forEach((m) => m.dispose());
      celestialEnv.dispose();
      celestialEnvRef.current = null;
      monoTexture.dispose();
      normalTexture.dispose();
      overlayTexture.dispose();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, []); // Run once on mount

  // Sync Ambient Light toggle & shadow lift slider (OFF by default for crisp day/night terminator contrast)
  useEffect(() => {
    const activePct = ambientLightEnabled ? ambientLightPct : 0;
    const t = activePct / 100;
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = activePct > 0 ? 0.06 + t * 1.7 : 0.0;
    }
    if (earthshineLightRef.current) {
      earthshineLightRef.current.intensity = activePct > 0 ? 0.07 + t * 0.65 : 0.02;
    }
  }, [ambientLightEnabled, ambientLightPct]);

  // Toggle 3D Grid (Meridians & Parallels + Labels)
  useEffect(() => {
    if (graticuleGroupRef.current) {
      graticuleGroupRef.current.visible = showGrid;
    }
    projectPinsNowRef.current?.();
  }, [showGrid]);

  // Toggle 3D Celestial Direction Vectors
  useEffect(() => {
    if (celestialVectorsGroupRef.current) {
      celestialVectorsGroupRef.current.visible = showCelestialVectors;
    }
    projectPinsNowRef.current?.();
  }, [showCelestialVectors]);

  // Toggle NASA Artemis Candidate Site Pins & Labels on Globe
  useEffect(() => {
    if (!showArtemisSites) {
      setHoveredSite((prev) => (prev && !prev.id.startsWith('custom') ? null : prev));
    }
    projectPinsNowRef.current?.();
  }, [showArtemisSites]);

  // Sync Overlay visibility & smooth opacity
  useEffect(() => {
    const mesh = overlayMeshRef.current;
    if (!mesh) return;
    mesh.visible = showAssessmentOverlay && overlayOpacity > 0;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    mat.opacity = (overlayOpacity / 100) * 0.75;
    mat.needsUpdate = true;
  }, [showAssessmentOverlay, overlayOpacity]);

  // Recompute RYG Assessment Overlay when landing parameters, canonical sites, or UTC time changes
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const tex = overlayTextureRef.current;
    if (!canvas || !tex) return;

    if (!terrainGridRef.current || builtSitesSigRef.current !== canonicalSitesSignature) {
      builtSitesSigRef.current = canonicalSitesSignature;
      terrainGridRef.current = buildTerrainGrid(sitesRef.current, bumpImgRef.current);
    }

    paintDynamicOverlayTexture(
      terrainGridRef.current,
      canvas,
      tex,
      lander,
      sunIlluminationOffset
    );
  }, [lander, sunIlluminationOffset, canonicalSitesSignature]);

  // Align 3D Sunlight Terminator Vector, Opposite Fill Light & Sun/Earth 3D Arrows identically with ephemeris model
  useEffect(() => {
    const { sunVec } = getSubsolarPoint(sunIlluminationOffset);
    const { sunVec: earthVec } = getEarthPoint(sunIlluminationOffset);
    const up = new THREE.Vector3(0, 1, 0);

    if (dirLightRef.current) {
      dirLightRef.current.position.set(sunVec.x * 260, sunVec.y * 260, sunVec.z * 260);
    }
    celestialEnvRef.current?.updateEphemeris(sunVec, earthVec, sunIlluminationOffset);
    if (earthshineLightRef.current) {
      earthshineLightRef.current.position.set(-sunVec.x * 12, -sunVec.y * 12, -sunVec.z * 12);
    }
    if (sunArrowGroupRef.current) {
      const sunDir = new THREE.Vector3(sunVec.x, sunVec.y, sunVec.z).normalize();
      sunArrowGroupRef.current.quaternion.setFromUnitVectors(up, sunDir);
    }
    if (earthArrowGroupRef.current) {
      const earthDir = new THREE.Vector3(earthVec.x, earthVec.y, earthVec.z).normalize();
      earthArrowGroupRef.current.quaternion.setFromUnitVectors(up, earthDir);
    }
    projectPinsNowRef.current?.();
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
      if (!site.id.startsWith('custom') && !showArtemisSites) return;
      const isSelected = site.id === selectedSite.id;
      const pos = latLonToVector3(
        site.coordinates.latitude,
        site.coordinates.longitude,
        MOON_RADIUS * 1.005
      );
      const normal = pos.clone().normalize();

      const hitGeo = new THREE.SphereGeometry(0.11, 8, 8);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.copy(pos);
      hitMesh.userData = { site };
      pinsGroup.add(hitMesh);

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
  }, [sites, selectedSite, showArtemisSites]);

  // Ensure newly mounted or re-rendered pin nodes position immediately
  useEffect(() => {
    projectPinsNowRef.current?.();
  }, [sites, selectedSite, siteMetricsMap, leftDrawerOpen, rightDrawerOpen, showArtemisSites]);

  // Fly camera on programmatic selection changes (drawer / COORDS popover); keep steady on direct surface click
  useEffect(() => {
    if (!hasMountedFlyRef.current) {
      hasMountedFlyRef.current = true;
      return;
    }
    if (skipNextFlyRef.current) {
      skipNextFlyRef.current = false;
      return;
    }
    flyToSite(selectedSite);
  }, [selectedSite, flyToSite]);

  const statusHex = (status: RiskLevel) => {
    if (status === 'RED') return '#EF4444';
    if (status === 'YELLOW') return '#F59E0B';
    return '#10B981';
  };

  const statusLabel = (status: RiskLevel) => {
    if (status === 'RED') return 'NO-GO';
    if (status === 'YELLOW') return 'CAUTION';
    return 'GO';
  };

  const hoveredMetric = hoveredSite ? siteMetricsMap.get(hoveredSite.id) : null;
  const maxSlopeLimit = lander ? lander.maxSlopeDeg : 15;
  const minIllumLimit = lander ? lander.minIlluminationPct : 70;
  const subsolarPoint = useMemo(
    () => getSubsolarPoint(sunIlluminationOffset),
    [sunIlluminationOffset]
  );
  const earthSubPoint = useMemo(
    () => getEarthPoint(sunIlluminationOffset),
    [sunIlluminationOffset]
  );
  const artemisSites = useMemo(
    () => sites.filter((s) => !s.id.startsWith('custom')),
    [sites]
  );
  const customSites = useMemo(
    () => sites.filter((s) => s.id.startsWith('custom')),
    [sites]
  );

  return (
    <div className="relative w-full h-full overflow-hidden bg-black flex flex-col">
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Projected Screen-Space SpaceX Telemetry Markers & Graticule Labels (Imperatively positioned at 60fps) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10 select-none">
        {/* Projected North / South Pole, Longitude Meridian & Latitude Parallel Labels */}
        {GRATICULE_POLES.map((pole) => (
          <span
            key={pole.id}
            ref={(el) => {
              if (el) graticuleLabelElsRef.current.set(pole.id, el);
              else graticuleLabelElsRef.current.delete(pole.id);
            }}
            style={{ display: 'none' }}
            className="pointer-events-none absolute top-0 left-0 items-center px-1.5 py-0.5 rounded-[2px] bg-[#090A0D]/85 border border-sky-400/55 font-mono text-[9px] font-bold tracking-wider text-sky-300 whitespace-nowrap"
          >
            {pole.text}
          </span>
        ))}
        {GRATICULE_MERIDIANS.map((m) => (
          <span
            key={m.id}
            ref={(el) => {
              if (el) graticuleLabelElsRef.current.set(m.id, el);
              else graticuleLabelElsRef.current.delete(m.id);
            }}
            style={{ display: 'none' }}
            className={`pointer-events-none absolute top-0 left-0 items-center px-1 py-[1px] rounded-[2px] font-mono text-[8px] tracking-wider whitespace-nowrap border ${m.isPrime
              ? 'bg-[#090A0D]/75 border-sky-400/35 text-sky-300 font-semibold'
              : 'bg-[#090A0D]/55 border-white/[0.10] text-slate-200/80'
              }`}
          >
            {m.text}
          </span>
        ))}
        {GRATICULE_PARALLELS.map((par) => (
          <span
            key={par.id}
            ref={(el) => {
              if (el) graticuleLabelElsRef.current.set(par.id, el);
              else graticuleLabelElsRef.current.delete(par.id);
            }}
            style={{ display: 'none' }}
            className={`pointer-events-none absolute top-0 left-0 items-center px-1 py-[1px] rounded-[2px] font-mono text-[8px] tracking-wider whitespace-nowrap border ${par.isEquator
              ? 'bg-[#090A0D]/75 border-amber-300/35 text-amber-200 font-semibold'
              : 'bg-[#090A0D]/55 border-white/[0.10] text-slate-300/75'
              }`}
          >
            {par.text}
          </span>
        ))}

        {/* Projected 3D Sun & Earth Vector Tip Badges */}
        <div
          ref={sunVectorLabelRef}
          style={{ display: 'none' }}
          className="pointer-events-none absolute top-0 left-0 items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#090A0D]/90 border border-amber-400/60 font-mono text-[9px] uppercase tracking-wider text-amber-200 whitespace-nowrap"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shrink-0" />
          <span className="font-bold">SUN VECTOR</span>
          <span className="text-amber-200/75 tabular-nums">
            {subsolarPoint.latDeg >= 0 ? '+' : ''}
            {subsolarPoint.latDeg.toFixed(1)}°, {subsolarPoint.lonDeg >= 0 ? '+' : ''}
            {subsolarPoint.lonDeg.toFixed(1)}°
          </span>
        </div>

        <div
          ref={earthVectorLabelRef}
          style={{ display: 'none' }}
          className="pointer-events-none absolute top-0 left-0 items-center gap-1.5 px-2 py-0.5 rounded-[2px] bg-[#090A0D]/90 border border-sky-400/60 font-mono text-[9px] uppercase tracking-wider text-sky-200 whitespace-nowrap"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
          <span className="font-bold">EARTH · DTE</span>
          <span className="text-sky-200/75 tabular-nums">
            {earthSubPoint.latDeg >= 0 ? '+' : ''}
            {earthSubPoint.latDeg.toFixed(1)}°, {earthSubPoint.lonDeg >= 0 ? '+' : ''}
            {earthSubPoint.lonDeg.toFixed(1)}°
          </span>
        </div>

        {/* SVG Leader Lines */}
        <svg className="absolute inset-0 w-full h-full">
          {sites.map((site) => {
            const isSelected = site.id === selectedSite.id;
            return (
              <line
                key={`line-${site.id}`}
                ref={(el) => {
                  if (el) lineElsRef.current.set(site.id, el);
                  else lineElsRef.current.delete(site.id);
                }}
                stroke={isSelected ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.32)'}
                strokeWidth={1}
                style={{ display: 'none' }}
              />
            );
          })}
        </svg>

        {/* Crisp Telemetry Dots + Static Ring (Selected Only) + Offset Labels */}
        {sites.map((site) => {
          const isSelected = site.id === selectedSite.id;
          const metric = siteMetricsMap.get(site.id) || {
            status: 'GREEN' as RiskLevel,
            illumPct: site.defaultIlluminationPct,
            hasLos: site.defaultEarthLos,
          };
          const hex = statusHex(metric.status);
          const customShortLabel =
            site.id === 'custom_surface_target'
              ? `${Math.abs(site.coordinates.latitude).toFixed(1)}°${site.coordinates.latitude >= 0 ? 'N' : 'S'} ${Math.abs(site.coordinates.longitude).toFixed(1)}°${site.coordinates.longitude >= 0 ? 'E' : 'W'}`
              : site.name.toUpperCase().slice(0, 14);
          const shortName = SHORT_NAMES[site.id] || customShortLabel;

          return (
            <React.Fragment key={site.id}>
              {/* 7px Dot with 1px white border + optional static selection ring */}
              <div
                ref={(el) => {
                  if (el) dotElsRef.current.set(site.id, el);
                  else dotElsRef.current.delete(site.id);
                }}
                style={{ display: 'none' }}
                className="pointer-events-auto cursor-pointer absolute top-0 left-0 items-center justify-center"
                onClick={() => {
                  skipNextFlyRef.current = true;
                  onSelectSite(site);
                }}
                onMouseEnter={() => setHoveredSite(site)}
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
                ref={(el) => {
                  if (el) labelElsRef.current.set(site.id, el);
                  else labelElsRef.current.delete(site.id);
                }}
                onClick={() => {
                  skipNextFlyRef.current = true;
                  onSelectSite(site);
                }}
                onMouseEnter={() => setHoveredSite(site)}
                onMouseLeave={() => setHoveredSite(null)}
                style={{ display: 'none' }}
                className={`pointer-events-auto cursor-pointer absolute top-0 left-0 items-center gap-1.5 px-2 py-0.5 rounded-[2px] border font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors ${isSelected
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
                  {site.terrain.slope_deg.toFixed(1)}° · {metric.illumPct}%
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Top HUD: Viewport Mode & NASA Artemis Sites, Floating Overlay/Ambient Light Pill, Camera & Layer Actions */}
      <div
        className={`absolute top-3 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} ${!rightDrawerOpen ? 'right-3' : rightDrawerWide ? 'lg:right-[752px] 2xl:right-[852px] right-3' : 'lg:right-[512px] right-3'} ${leftDrawerOpen && rightDrawerWide ? 'hidden 2xl:flex' : 'flex'} flex-wrap items-center justify-between gap-2 pointer-events-none z-20 transition-all duration-300`}
      >
        {/* Left: Seamless 3D Globe <-> 3D Surface Patch Switcher & NASA Artemis Candidate Sites (9) */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-[2px] bg-[#090A0D]/95 border border-white/[0.14] p-0.5 font-mono text-[10px] uppercase tracking-wider"
            role="group"
            aria-label="Viewport Mode"
          >
            <button
              type="button"
              onClick={() => setIsLocalSurfaceOpen(false)}
              aria-pressed={!isLocalSurfaceOpen}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] transition ${!isLocalSurfaceOpen
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
                }`}
            >
              <Globe className="w-3 h-3" />
              <span>3D Moon Globe</span>
            </button>
            <button
              type="button"
              data-testid="open-local-surface-top-btn"
              onClick={() => setIsLocalSurfaceOpen(true)}
              aria-pressed={isLocalSurfaceOpen}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] transition ${isLocalSurfaceOpen
                ? 'bg-white text-black font-bold'
                : 'text-[#9CA3AF] hover:text-white'
                }`}
              title="Switch to 2.4 km × 2.4 km high-resolution 3D local surface DEM & boulder hazard patch"
            >
              <Layers className="w-3 h-3" />
              <span>3D Surface Patch</span>
            </button>
          </div>

          {/* NASA Artemis Candidate Sites Dropdown + ON/OFF Toggle + Hover Provenance "i" Button */}
          <div ref={artemisMenuRef} className="relative flex items-center gap-1">
            <div className="flex items-center rounded-[2px] bg-[#090A0D]/95 border border-white/[0.14]">
              <button
                type="button"
                data-testid="artemis-sites-dropdown-btn"
                onClick={() => setIsArtemisDropdownOpen((prev) => !prev)}
                aria-expanded={isArtemisDropdownOpen}
                className={`flex items-center gap-2 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${isArtemisDropdownOpen
                  ? 'bg-[#12141A] text-white'
                  : 'text-white hover:bg-[#12141A]/70'
                  }`}
              >
                <span
                  style={{
                    backgroundColor: showArtemisSites
                      ? statusHex(selectedRiskTelemetry.risk.overall_status)
                      : '#4B5563',
                  }}
                  className="w-2 h-2 rounded-full border border-white/70 shrink-0"
                />
                <span className={`font-semibold ${showArtemisSites ? 'text-white' : 'text-[#9CA3AF]'}`}>
                  NASA Artemis Candidate Sites ({artemisSites.length})
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#9CA3AF] transition-transform ${isArtemisDropdownOpen ? 'rotate-180' : ''
                    }`}
                />
              </button>

              <div className="h-3.5 w-px bg-white/[0.14]" />

              <button
                type="button"
                data-testid="artemis-sites-toggle-btn"
                onClick={() => setShowArtemisSites((prev) => !prev)}
                aria-pressed={showArtemisSites}
                aria-label="Toggle NASA Artemis candidate sites visibility on 3D globe"
                title="Toggle NASA Artemis candidate landing sites on/off on the 3D Moon"
                className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-[#12141A]/70 transition flex items-center"
              >
                <span
                  className={`px-1.5 py-0.5 rounded-[2px] border font-bold ${showArtemisSites
                    ? 'bg-white text-black border-white'
                    : 'bg-[#12141A] text-[#9CA3AF] border-white/[0.14]'
                    }`}
                >
                  {showArtemisSites ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            <div
              className="relative"
              onMouseEnter={() => setIsArtemisInfoHovered(true)}
              onMouseLeave={() => setIsArtemisInfoHovered(false)}
            >
              <button
                type="button"
                data-testid="artemis-info-hover-btn"
                aria-label="NASA Artemis Candidate Sites Information"
                onFocus={() => setIsArtemisInfoHovered(true)}
                onBlur={() => setIsArtemisInfoHovered(false)}
                className={`flex items-center justify-center w-7 h-7 rounded-[2px] border transition ${isArtemisInfoHovered
                  ? 'bg-white text-black border-white'
                  : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/40'
                  }`}
              >
                <Info className="w-3.5 h-3.5" />
              </button>

              {isArtemisInfoHovered && (
                <div
                  data-testid="artemis-info-popover"
                  className="absolute right-0 top-full pt-2 w-[450px] max-w-[92vw] z-40"
                >
                  <div className="bg-[#090A0D]/95 backdrop-blur-xl border border-white/25 rounded-[2px] p-3.5 font-mono text-[10px] text-[#D1D5DB] space-y-2.5 shadow-2xl">
                    <div className="border-b border-white/[0.12] pb-2">
                      <div className="text-[11px] font-bold text-white uppercase tracking-wider">
                        The 9 Candidate Lunar Landing Regions
                      </div>
                      <div className="text-[9px] text-[#9CA3AF] mt-0.5">
                        NASA Shortlist Finalized October 28, 2024 · Lunar South Pole
                      </div>
                    </div>

                    <p className="text-[10px] leading-relaxed text-[#9CA3AF] font-sans">
                      Each region spans several kilometers and offers at least{' '}
                      <span className="text-white font-semibold">6.5 Earth days</span> of
                      near-continuous sunlight along with walking access to shadowed ice deposits.
                    </p>

                    <div className="border border-white/[0.12] rounded-[2px] overflow-hidden">
                      <table className="w-full text-left border-collapse text-[9px]">
                        <thead>
                          <tr className="bg-[#12141A] text-[#9CA3AF] uppercase tracking-wider border-b border-white/[0.12]">
                            <th className="py-1.5 px-2 font-semibold">Candidate Region</th>
                            <th className="py-1.5 px-2 font-semibold">Approx. Coords</th>
                            <th className="py-1.5 px-2 font-semibold">Selection Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {artemisSites.map((s, idx) => (
                            <tr
                              key={s.id}
                              className="border-b last:border-b-0 border-white/[0.06] bg-black/40"
                            >
                              <td className="py-1 px-2 text-white font-semibold">
                                {idx + 1}. {s.name}
                              </td>
                              <td className="py-1 px-2 text-[#9CA3AF] tabular-nums">
                                {Math.abs(s.coordinates.latitude).toFixed(2)}°
                                {s.coordinates.latitude >= 0 ? 'N' : 'S'},{' '}
                                {Math.abs(s.coordinates.longitude).toFixed(2)}°
                                {s.coordinates.longitude >= 0 ? 'E' : 'W'}
                              </td>
                              <td className="py-1 px-2">
                                <span
                                  className={
                                    s.selectionStatus === 'Added in 2024'
                                      ? 'text-sky-300'
                                      : 'text-[#9CA3AF]'
                                  }
                                >
                                  {s.selectionStatus || 'Retained from 2022'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/[0.10] text-[9px] uppercase tracking-wider">
                      <a
                        href="https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 underline underline-offset-2"
                      >
                        <span>LPI South Pole Atlas</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <a
                        href="https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 underline underline-offset-2"
                      >
                        <span>NASA 2024 Release</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                      <a
                        href="https://www.nasa.gov/mission/artemis-iv/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 underline underline-offset-2"
                      >
                        <span>NASA Artemis IV Page</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {isArtemisDropdownOpen && (
              <div
                data-testid="artemis-sites-menu"
                className="absolute left-0 top-full mt-2 w-[360px] max-w-[92vw] max-h-[65vh] overflow-y-auto bg-[#090A0D]/95 backdrop-blur-xl border border-white/25 rounded-[2px] p-2 space-y-1 z-40 font-mono"
              >
                <div className="px-2 py-1 border-b border-white/[0.10] flex items-center justify-between gap-2 text-[9px] uppercase tracking-widest text-[#6B7280]">
                  <span>NASA Artemis III+ Shortlist</span>
                  <button
                    type="button"
                    data-testid="artemis-dropdown-visibility-toggle"
                    onClick={() => setShowArtemisSites((prev) => !prev)}
                    aria-pressed={showArtemisSites}
                    className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider hover:text-white transition"
                  >
                    <span>Show Markers:</span>
                    <span
                      className={`px-1 py-[1px] rounded-[2px] border font-bold ${showArtemisSites
                        ? 'bg-white text-black border-white'
                        : 'bg-[#12141A] text-[#9CA3AF] border-white/[0.14]'
                        }`}
                    >
                      {showArtemisSites ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
                {artemisSites.map((site, idx) => {
                  const metric = siteMetricsMap.get(site.id);
                  const status = metric?.status ?? 'GREEN';
                  const illumPct = metric?.illumPct ?? site.defaultIlluminationPct;
                  const isSelected = site.id === selectedSite.id;
                  const isCompared = compareSiteIds.includes(site.id);
                  const compareQueueFull = !isCompared && compareSiteIds.length >= 3;
                  return (
                    <div key={site.id} className="flex items-stretch gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowArtemisSites(true);
                          onSelectSite(site);
                          setIsArtemisDropdownOpen(false);
                        }}
                        className={`flex-1 min-w-0 text-left px-2.5 py-2 rounded-[2px] border transition flex items-center justify-between gap-2 ${isSelected
                          ? 'bg-[#12141A] border-white/60 text-white'
                          : 'bg-black/60 border-white/[0.08] text-[#D1D5DB] hover:border-white/30 hover:bg-[#12141A]'
                          }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[#6B7280] tabular-nums">{idx + 1}.</span>
                            <span className="text-[11px] font-bold text-white truncate">
                              {site.name}
                            </span>
                            {site.selectionStatus === 'Added in 2024' && (
                              <span className="px-1 py-[1px] rounded-[2px] bg-sky-500/15 border border-sky-400/35 text-[8px] text-sky-300 uppercase shrink-0">
                                2024
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-[#9CA3AF] tabular-nums mt-0.5">
                            {Math.abs(site.coordinates.latitude).toFixed(2)}°
                            {site.coordinates.latitude >= 0 ? 'N' : 'S'},{' '}
                            {Math.abs(site.coordinates.longitude).toFixed(2)}°
                            {site.coordinates.longitude >= 0 ? 'E' : 'W'} ·{' '}
                            {site.terrain.slope_deg.toFixed(1)}° slope · {illumPct}% sun
                          </div>
                        </div>
                        <span
                          style={{
                            color: statusHex(status),
                            borderColor: `${statusHex(status)}55`,
                            backgroundColor: `${statusHex(status)}18`,
                          }}
                          className="shrink-0 px-1.5 py-0.5 rounded-[2px] border text-[9px] font-bold uppercase tracking-wider"
                        >
                          {statusLabel(status)}
                        </span>
                      </button>
                      {onToggleCompareSite && (
                        <button
                          type="button"
                          data-testid={`dropdown-compare-btn-${site.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleCompareSite(site);
                          }}
                          disabled={compareQueueFull}
                          aria-pressed={isCompared}
                          aria-label={isCompared ? `Remove ${site.name} from compare` : `Add ${site.name} to compare`}
                          title={
                            isCompared
                              ? 'Remove from side-by-side comparison'
                              : compareQueueFull
                                ? 'Compare queue full (max 3 sites)'
                                : 'Add to side-by-side comparison'
                          }
                          className={`px-2 rounded-[2px] border flex items-center justify-center shrink-0 transition ${isCompared
                            ? 'bg-sky-500/20 border-sky-400/70 text-sky-300 hover:bg-sky-500/30'
                            : compareQueueFull
                              ? 'bg-black/40 border-white/[0.06] text-[#4B5563] cursor-not-allowed'
                              : 'bg-black/60 border-white/[0.10] text-[#9CA3AF] hover:text-white hover:border-white/40 hover:bg-[#12141A]'
                            }`}
                        >
                          {isCompared ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  );
                })}

                {customSites.length > 0 && (
                  <>
                    <div className="px-2 pt-2 pb-1 border-b border-white/[0.10] text-[9px] uppercase tracking-widest text-[#6B7280]">
                      Custom Probed Coordinates
                    </div>
                    {customSites.map((site) => {
                      const metric = siteMetricsMap.get(site.id);
                      const status = metric?.status ?? 'GREEN';
                      const illumPct = metric?.illumPct ?? site.defaultIlluminationPct;
                      const isSelected = site.id === selectedSite.id;
                      const isCompared = compareSiteIds.includes(site.id);
                      const compareQueueFull = !isCompared && compareSiteIds.length >= 3;
                      return (
                        <div key={site.id} className="flex items-stretch gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSite(site);
                              setIsArtemisDropdownOpen(false);
                            }}
                            className={`flex-1 min-w-0 text-left px-2.5 py-1.5 rounded-[2px] border transition flex items-center justify-between gap-2 ${isSelected
                              ? 'bg-[#12141A] border-white/60 text-white'
                              : 'bg-black/60 border-white/[0.08] text-[#D1D5DB] hover:border-white/30'
                              }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] font-bold text-white truncate">
                                {site.name}
                              </div>
                              <div className="text-[9px] text-[#9CA3AF] tabular-nums">
                                {site.terrain.slope_deg.toFixed(1)}° slope · {illumPct}% sun
                              </div>
                            </div>
                            <span
                              style={{
                                color: statusHex(status),
                                borderColor: `${statusHex(status)}55`,
                                backgroundColor: `${statusHex(status)}18`,
                              }}
                              className="shrink-0 px-1.5 py-0.5 rounded-[2px] border text-[9px] font-bold uppercase"
                            >
                              {statusLabel(status)}
                            </span>
                          </button>
                          {onToggleCompareSite && (
                            <button
                              type="button"
                              data-testid={`dropdown-compare-btn-${site.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleCompareSite(site);
                              }}
                              disabled={compareQueueFull}
                              aria-pressed={isCompared}
                              aria-label={isCompared ? `Remove ${site.name} from compare` : `Add ${site.name} to compare`}
                              title={
                                isCompared
                                  ? 'Remove from side-by-side comparison'
                                  : compareQueueFull
                                    ? 'Compare queue full (max 3 sites)'
                                    : 'Add to side-by-side comparison'
                              }
                              className={`px-2 rounded-[2px] border flex items-center justify-center shrink-0 transition ${isCompared
                                ? 'bg-sky-500/20 border-sky-400/70 text-sky-300 hover:bg-sky-500/30'
                                : compareQueueFull
                                  ? 'bg-black/40 border-white/[0.06] text-[#4B5563] cursor-not-allowed'
                                  : 'bg-black/60 border-white/[0.10] text-[#9CA3AF] hover:text-white hover:border-white/40 hover:bg-[#12141A]'
                                }`}
                            >
                              {isCompared ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: Floating Overlay Toggle, Opacity & Ambient Light Control Pill */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 bg-[#090A0D]/95 px-3 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setShowAssessmentOverlay((prev) => !prev)}
            aria-pressed={showAssessmentOverlay}
            className="flex items-center gap-2 text-white hover:opacity-90 transition"
            title="Toggle dynamic Red / Yellow / Green landing assessment overlay"
          >
            <span className="text-[#9CA3AF]">Landing Overlay:</span>
            <span
              className={`px-1.5 py-0.5 rounded-[2px] border font-bold ${showAssessmentOverlay
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
              style={{
                background: `linear-gradient(to right, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.85) ${overlayOpacity}%, #1F2937 ${overlayOpacity}%, #1F2937 100%)`,
              }}
              className="w-20"
            />
            <span className="text-white font-bold tabular-nums w-8 text-right">
              {overlayOpacity}%
            </span>
          </div>

          <div className="h-3.5 w-px bg-white/[0.14] hidden sm:block" />

          <div
            className="flex items-center gap-2"
            title="Lift shadow darkness so you can inspect terrain on the night or far side of the Moon"
          >
            <button
              type="button"
              data-testid="ambient-light-toggle-btn"
              aria-pressed={ambientLightEnabled}
              onClick={() => {
                if (ambientLightEnabled) {
                  if (ambientLightPct > 0) setLastAmbientLightPct(ambientLightPct);
                  setAmbientLightEnabled(false);
                  setAmbientLightPct(0);
                } else {
                  const nextPct = lastAmbientLightPct > 0 ? lastAmbientLightPct : 45;
                  setAmbientLightEnabled(true);
                  setAmbientLightPct(nextPct);
                }
              }}
              className="flex items-center gap-1.5 text-white hover:opacity-90 transition"
            >
              <Sun className="w-3 h-3 text-amber-300" />
              <span className="text-[#9CA3AF] whitespace-nowrap">Ambient Light:</span>
              <span
                className={`px-1.5 py-0.5 rounded-[2px] border font-bold ${ambientLightEnabled
                  ? 'bg-amber-300 text-black border-amber-200'
                  : 'bg-[#12141A] text-[#9CA3AF] border-white/[0.14]'
                  }`}
              >
                {ambientLightEnabled ? 'ON' : 'OFF'}
              </span>
            </button>
            <input
              id="ambient-light-slider"
              aria-label="Ambient Light Level"
              type="range"
              min={0}
              max={100}
              step={1}
              value={ambientLightPct}
              onChange={(e) => {
                const next = Number(e.target.value);
                setAmbientLightPct(next);
                if (next > 0) {
                  setAmbientLightEnabled(true);
                  setLastAmbientLightPct(next);
                } else {
                  setAmbientLightEnabled(false);
                }
              }}
              style={{
                background: `linear-gradient(to right, #F59E0B 0%, #FDE68A ${ambientLightPct}%, #1F2937 ${ambientLightPct}%, #1F2937 100%)`,
              }}
              className="w-20"
            />
            <span className="text-white font-bold tabular-nums w-8 text-right">
              {ambientLightEnabled ? `${ambientLightPct}%` : '0%'}
            </span>
          </div>
        </div>

        {/* Right: Quick Camera & Layer Actions */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={zoomToSouthPole}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/[0.14] hover:border-white/35 text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] hover:text-white transition"
            title="Zoom into the Artemis Lunar South Pole cluster"
          >
            <Mountain className="w-3.5 h-3.5" />
            <span>South Pole</span>
          </button>

          <button
            type="button"
            onClick={zoomToEarthSide}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/[0.14] hover:border-white/35 text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] hover:text-white transition"
            title="Reset camera view to the Earth-facing Near Side (0°N, 0°E)"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Earth-Side</span>
          </button>

          <button
            type="button"
            onClick={() => setShowGrid((prev) => !prev)}
            aria-pressed={showGrid}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition border ${showGrid
              ? 'bg-white text-black font-bold border-white'
              : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/35'
              }`}
            title="Toggle selenographic longitude & latitude grid"
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Grid</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCelestialVectors((prev) => !prev)}
            aria-pressed={showCelestialVectors}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition border ${showCelestialVectors
              ? 'bg-white text-black font-bold border-white'
              : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/35'
              }`}
            title="Toggle 3D Sun & Earth direction vector indicators around the Moon"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Sun / Earth Vectors</span>
          </button>
        </div>
      </div>

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
              {hoveredMetric.hasLos ? 'DTE OK' : 'NO DTE'}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Stage Stack: Site Inspection Card cleanly stacked above Bottom HUD (zero overlap at any viewport width) */}
      <div
        className={`absolute bottom-3 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} ${!rightDrawerOpen ? 'right-3' : rightDrawerWide ? 'lg:right-[752px] 2xl:right-[852px] right-3' : 'lg:right-[512px] right-3'} ${leftDrawerOpen && rightDrawerWide ? 'hidden 2xl:flex' : 'flex'} flex-col gap-2 pointer-events-none z-20 transition-all duration-300`}
      >
        {/* Educator Mode Plain-English Callout on Viewport (hidden automatically when Right Drawer opens) */}
        {!rightDrawerOpen && viewMode === 'educator' && (
          <div
            data-testid="educator-viewport-callout"
            className="pointer-events-auto self-start w-[312px] sm:w-[344px] max-w-full bg-[#090A0D]/95 backdrop-blur-md border border-sky-400/45 rounded-[2px] p-2.5 font-mono text-[10px] space-y-1.5 shadow-xl"
          >
            <div className="flex items-center gap-1.5 text-sky-300 font-bold uppercase tracking-wider">
              <GraduationCap className="w-3.5 h-3.5 shrink-0" />
              <span>Educator Guide · Survival Factors</span>
            </div>
            <p className="text-[10px] text-[#D1D5DB] font-sans leading-snug">
              <strong className="text-white">Slope:</strong> Tilts over ~{maxSlopeLimit.toFixed(0)}° risk tip-over during touchdown.
            </p>
            <p className="text-[10px] text-[#D1D5DB] font-sans leading-snug">
              <strong className="text-white">Solar Grazing Angle:</strong> Near-horizontal South Pole sunlight casts long shadows that rapidly drain batteries.
            </p>
            <p className="text-[10px] text-[#D1D5DB] font-sans leading-snug">
              <strong className="text-white">Earth Line-of-Sight:</strong> Earth stays low (0°–5° Grazing Zone); crater rims can block direct radio signals.
            </p>
          </div>
        )}

        {/* On-Viewport Selected Surface Area: Auto-hidden whenever Right Site Assessment Drawer is open */}
        {!rightDrawerOpen && (isSiteCardVisible ? (
          <div
            data-testid="surface-risk-hud"
            className="pointer-events-auto self-start w-[312px] sm:w-[344px] max-w-full bg-[#090A0D]/95 backdrop-blur-md border border-white/[0.16] rounded-[2px] p-3 font-mono transition-all duration-300"
          >
            {/* Header: Probed/Selected Area + Overall Risk Verdict Badge + Close */}
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/[0.12]">
              <div className="min-w-0">
                <div className="text-[9px] text-[#6B7280] uppercase tracking-widest">
                  SURFACE INSPECTION // {selectedSite.region}
                </div>
                <div className="text-xs font-bold text-white uppercase tracking-wider truncate mt-0.5">
                  {selectedSite.name}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  style={{
                    color: statusHex(selectedRiskTelemetry.risk.overall_status),
                    borderColor: `${statusHex(selectedRiskTelemetry.risk.overall_status)}66`,
                    backgroundColor: `${statusHex(selectedRiskTelemetry.risk.overall_status)}1A`,
                  }}
                  className="px-2 py-0.5 rounded-[2px] border text-[10px] font-bold uppercase tracking-wider tabular-nums"
                >
                  {statusLabel(selectedRiskTelemetry.risk.overall_status)}
                </span>
                <button
                  type="button"
                  data-testid="close-site-card-btn"
                  onClick={() => setIsSiteCardVisible(false)}
                  className="p-1 rounded-[2px] bg-[#12141A] hover:bg-white/15 border border-white/[0.14] text-[#9CA3AF] hover:text-white transition"
                  title="Close site inspection card"
                  aria-label="Close site inspection card"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Exact Selenographic Coordinates & Elevation Strip */}
            <div className="grid grid-cols-3 gap-1.5 py-2 border-b border-white/[0.10] text-[10px] tabular-nums">
              <div className="bg-black/70 border border-white/[0.10] rounded-[2px] px-2 py-1">
                <span className="block text-[8px] text-[#6B7280] uppercase tracking-widest">LAT</span>
                <span className="text-white font-semibold">
                  {selectedSite.coordinates.latitude >= 0 ? '+' : ''}
                  {selectedSite.coordinates.latitude.toFixed(2)}°
                </span>
              </div>
              <div className="bg-black/70 border border-white/[0.10] rounded-[2px] px-2 py-1">
                <span className="block text-[8px] text-[#6B7280] uppercase tracking-widest">LON</span>
                <span className="text-white font-semibold">
                  {selectedSite.coordinates.longitude >= 0 ? '+' : ''}
                  {selectedSite.coordinates.longitude.toFixed(2)}°
                </span>
              </div>
              <div className="bg-black/70 border border-white/[0.10] rounded-[2px] px-2 py-1">
                <span className="block text-[8px] text-[#6B7280] uppercase tracking-widest">ELEV</span>
                <span className="text-white font-semibold">
                  {selectedSite.coordinates.elevation_m >= 0 ? '+' : ''}
                  {selectedSite.coordinates.elevation_m}M
                </span>
              </div>
            </div>

            {/* 4-Factor Risk Assessment Grid */}
            <div className="grid grid-cols-2 gap-1.5 py-2 text-[10px] tabular-nums">
              <div className="flex items-center justify-between bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
                <div>
                  <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
                    SLOPE (≤{maxSlopeLimit.toFixed(0)}°)
                  </span>
                  <span className="text-white font-semibold">
                    {selectedSite.terrain.slope_deg.toFixed(1)}°
                  </span>
                </div>
                <span
                  style={{ backgroundColor: statusHex(selectedRiskTelemetry.risk.factors[0].level) }}
                  className="w-2 h-2 rounded-full shrink-0 border border-white/50"
                />
              </div>

              <div className="flex items-center justify-between bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
                <div>
                  <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
                    FLUX (≥{minIllumLimit}%)
                  </span>
                  <span className="text-white font-semibold">
                    {selectedRiskTelemetry.illumPct}% ({selectedSolarTelemetry.effectiveSunElevDeg >= 0 ? '+' : ''}
                    {selectedSolarTelemetry.effectiveSunElevDeg.toFixed(1)}°)
                  </span>
                </div>
                <span
                  style={{ backgroundColor: statusHex(selectedRiskTelemetry.risk.factors[2].level) }}
                  className="w-2 h-2 rounded-full shrink-0 border border-white/50"
                />
              </div>

              <div className="flex items-center justify-between bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
                <div>
                  <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
                    ROUGHNESS
                  </span>
                  <span className="text-white font-semibold">{selectedSite.terrain.roughness}</span>
                </div>
                <span
                  style={{ backgroundColor: statusHex(selectedRiskTelemetry.risk.factors[1].level) }}
                  className="w-2 h-2 rounded-full shrink-0 border border-white/50"
                />
              </div>

              <div className="flex items-center justify-between bg-black/50 border border-white/[0.08] rounded-[2px] px-2 py-1">
                <div>
                  <span className="block text-[8px] text-[#6B7280] uppercase tracking-wider">
                    EARTH DTE
                  </span>
                  <span className="text-white font-semibold">
                    {selectedRiskTelemetry.hasLos ? 'DIRECT LINK' : 'OCCLUDED'}
                  </span>
                </div>
                <span
                  style={{ backgroundColor: statusHex(selectedRiskTelemetry.risk.factors[3].level) }}
                  className="w-2 h-2 rounded-full shrink-0 border border-white/50"
                />
              </div>
            </div>

            {/* 1-Line Verdict Reason */}
            <div className="px-2 py-1.5 mb-2 rounded-[2px] bg-black/75 border border-white/[0.10] text-[10px] text-[#D1D5DB] leading-snug">
              {selectedRiskTelemetry.risk.overall_reason}
            </div>

            {/* Actions: Focus Cam / 3D Surface Patch / Site Assessment */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => flyToSite(selectedSite)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.16] rounded-[2px] text-[10px] font-bold uppercase tracking-wider text-white transition whitespace-nowrap"
              >
                <Focus className="w-3 h-3" />
                <span>FOCUS CAM</span>
              </button>
              <button
                type="button"
                data-testid="open-local-surface-hud-btn"
                onClick={() => setIsLocalSurfaceOpen(true)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#12141A] hover:bg-white/15 border border-white/30 rounded-[2px] text-[10px] font-bold uppercase tracking-wider text-white transition whitespace-nowrap"
                title="Inspect 2.4 km × 2.4 km local meter-scale 3D surface DEM"
              >
                <Layers className="w-3 h-3" />
                <span>3D SURFACE PATCH</span>
              </button>
              {onOpenTelemetryDrawer && (
                <button
                  type="button"
                  onClick={onOpenTelemetryDrawer}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white hover:bg-neutral-200 rounded-[2px] text-[10px] font-bold uppercase tracking-wider text-black transition"
                >
                  <BarChart3 className="w-3 h-3" />
                  <span>SITE ASSESSMENT</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            data-testid="reopen-site-card-btn"
            onClick={() => setIsSiteCardVisible(true)}
            className="pointer-events-auto self-start px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/25 text-[10px] font-mono uppercase tracking-wider text-white flex items-center gap-2 transition"
          >
            <span
              style={{ backgroundColor: statusHex(selectedRiskTelemetry.risk.overall_status) }}
              className="w-2 h-2 rounded-full border border-white/60"
            />
            <span>Inspect: {selectedSite.name}</span>
          </button>
        ))}

        {/* Bottom HUD: RYG Legend + Hover Scoring Methodology, Mission UTC Clock Bar & Cursor/Site Readout */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="pointer-events-auto relative bg-[#090A0D]/95 px-2.5 py-1 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider flex items-center gap-2.5"
            onMouseEnter={() => setIsRygInfoHovered(true)}
            onMouseLeave={() => setIsRygInfoHovered(false)}
          >
            <span className="text-[#6B7280]">RYG</span>
            <div className="flex items-center gap-1 text-[#10B981]">
              <span className="w-2 h-2 rounded-full bg-[#10B981] border border-white/60" />
              <span>GO</span>
            </div>
            <div className="flex items-center gap-1 text-[#F59E0B]">
              <span className="w-2 h-2 rounded-full bg-[#F59E0B] border border-white/60" />
              <span>CAUTION</span>
            </div>
            <div className="flex items-center gap-1 text-[#EF4444]">
              <span className="w-2 h-2 rounded-full bg-[#EF4444] border border-white/60" />
              <span>NO-GO</span>
            </div>

            <button
              type="button"
              data-testid="ryg-info-hover-btn"
              aria-label="Scoring Methodology Information"
              onFocus={() => setIsRygInfoHovered(true)}
              onBlur={() => setIsRygInfoHovered(false)}
              className={`flex items-center justify-center w-5 h-5 rounded-[2px] border transition ${isRygInfoHovered
                ? 'bg-white text-black border-white'
                : 'bg-[#12141A] text-[#9CA3AF] border-white/[0.16] hover:text-white hover:border-white/40'
                }`}
            >
              <Info className="w-3 h-3" />
            </button>

            {isRygInfoHovered && (
              <div
                data-testid="ryg-methodology-popover"
                className="absolute left-0 bottom-full pb-2 w-[390px] max-w-[92vw] z-40 normal-case tracking-normal"
              >
                <div className="bg-[#090A0D]/95 backdrop-blur-xl border border-white/25 rounded-[2px] p-3.5 font-mono text-[10px] text-[#D1D5DB] space-y-2.5 shadow-2xl">
                  <div className="border-b border-white/[0.12] pb-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold text-white uppercase tracking-wider">
                        RYG Scoring Methodology
                      </div>
                      <div className="text-[9px] text-[#9CA3AF]">
                        4-Factor Engineering Safety Matrix (Live Mission Thresholds)
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-[9.5px]">
                    <div className="bg-black/60 border border-white/[0.08] rounded-[2px] p-2">
                      <div className="text-white font-semibold uppercase tracking-wider">
                        1. Terrain Slope (LOLA DEM)
                      </div>
                      <div className="text-[#9CA3AF] mt-0.5">
                        <span className="text-[#10B981]">GO</span> &lt;{' '}
                        {lander ? (maxSlopeLimit * 0.75).toFixed(1) : RISK_THRESHOLDS.slope.greenMax}
                        ° · <span className="text-[#F59E0B]">CAUTION</span> ≤{' '}
                        {lander ? maxSlopeLimit.toFixed(1) : RISK_THRESHOLDS.slope.yellowMax}° ·{' '}
                        <span className="text-[#EF4444]">NO-GO</span> &gt;{' '}
                        {lander ? maxSlopeLimit.toFixed(1) : RISK_THRESHOLDS.slope.yellowMax}°
                      </div>
                    </div>

                    <div className="bg-black/60 border border-white/[0.08] rounded-[2px] p-2">
                      <div className="text-white font-semibold uppercase tracking-wider">
                        2. Solar Illumination (Synodic Flux)
                      </div>
                      <div className="text-[#9CA3AF] mt-0.5">
                        <span className="text-[#10B981]">GO</span> ≥{' '}
                        {lander ? minIllumLimit : RISK_THRESHOLDS.illumination.greenMin}% ·{' '}
                        <span className="text-[#F59E0B]">CAUTION</span>{' '}
                        {lander
                          ? Math.round(minIllumLimit * 0.5)
                          : RISK_THRESHOLDS.illumination.yellowMin}
                        –{(lander ? minIllumLimit : RISK_THRESHOLDS.illumination.greenMin) - 1}% ·{' '}
                        <span className="text-[#EF4444]">NO-GO</span> &lt;{' '}
                        {lander
                          ? Math.round(minIllumLimit * 0.5)
                          : RISK_THRESHOLDS.illumination.yellowMin}
                        %
                      </div>
                    </div>

                    <div className="bg-black/60 border border-white/[0.08] rounded-[2px] p-2">
                      <div className="text-white font-semibold uppercase tracking-wider">
                        3. Surface Roughness (Crater &amp; Boulder Field)
                      </div>
                      <div className="text-[#9CA3AF] mt-0.5">
                        Tolerance limit:{' '}
                        <span className="text-white font-semibold">
                          {lander?.maxRoughness ?? 'MODERATE'}
                        </span>{' '}
                        — exceeding tolerance shifts rating to CAUTION or NO-GO.
                      </div>
                    </div>

                    <div className="bg-black/60 border border-white/[0.08] rounded-[2px] p-2">
                      <div className="text-white font-semibold uppercase tracking-wider">
                        4. Direct-to-Earth (DTE) Comms Link
                      </div>
                      <div className="text-[#9CA3AF] mt-0.5">
                        {lander?.requiresEarthLos === false
                          ? 'Relay allowed: Blocked Earth LOS triggers CAUTION (relay required).'
                          : 'Direct DSN required: Blocked Earth LOS triggers immediate NO-GO.'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-1.5 border-t border-white/[0.10] text-[9px] text-[#9CA3AF]">
                    <span className="text-white font-semibold uppercase">Verdict Rule:</span> Any{' '}
                    <span className="text-[#EF4444]">NO-GO</span> yields NO-GO · Else any{' '}
                    <span className="text-[#F59E0B]">CAUTION</span> yields CAUTION · Otherwise GO.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mission UTC Date/Time Control Pill */}
          {onChangeDateOffset && (
            <div className="pointer-events-auto bg-[#090A0D]/95 px-2.5 py-1 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider flex flex-wrap items-center gap-1.5">
              <Clock className="w-3 h-3 text-[#9CA3AF] shrink-0" />
              <input
                aria-label="Mission UTC Date"
                type="date"
                value={utcDateInput}
                onChange={(e) => applyUtcChange(e.target.value, utcTimeInput)}
                className="bg-[#000000] border border-white/[0.14] rounded-[2px] px-1.5 py-0.5 text-[10px] text-white tabular-nums [color-scheme:dark] focus:outline-none focus:border-white/50"
              />
              <input
                aria-label="Mission UTC Time"
                type="time"
                value={utcTimeInput}
                onChange={(e) => applyUtcChange(utcDateInput, e.target.value)}
                className="bg-[#000000] border border-white/[0.14] rounded-[2px] px-1.5 py-0.5 text-[10px] text-white tabular-nums [color-scheme:dark] focus:outline-none focus:border-white/50"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChangeDateOffset(Math.max(missionEpochOffset - 14, sunIlluminationOffset - 1))}
                  className="px-1.5 py-0.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.12] rounded-[2px] text-[9px] text-[#9CA3AF] hover:text-white transition"
                >
                  -1D
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDateOffset(Math.max(missionEpochOffset - 14, sunIlluminationOffset - 0.25))}
                  className="px-1.5 py-0.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.12] rounded-[2px] text-[9px] text-[#9CA3AF] hover:text-white transition"
                >
                  -6H
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDateOffset(missionEpochOffset)}
                  className={`px-1.5 py-0.5 border border-white/[0.12] rounded-[2px] text-[9px] transition ${Math.abs(sunIlluminationOffset - missionEpochOffset) < 0.02
                    ? 'bg-white text-black font-bold'
                    : 'bg-[#12141A] hover:bg-white/15 text-[#9CA3AF] hover:text-white'
                    }`}
                >
                  T0
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDateOffset(Math.min(missionEpochOffset + 14, sunIlluminationOffset + 0.25))}
                  className="px-1.5 py-0.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.12] rounded-[2px] text-[9px] text-[#9CA3AF] hover:text-white transition"
                >
                  +6H
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDateOffset(Math.min(missionEpochOffset + 14, sunIlluminationOffset + 1))}
                  className="px-1.5 py-0.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.12] rounded-[2px] text-[9px] text-[#9CA3AF] hover:text-white transition"
                >
                  +1D
                </button>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded-[2px] border text-[9px] font-bold tabular-nums ${selectedSolarTelemetry.isSunlit
                  ? 'border-[#10B981]/50 text-[#10B981] bg-[#10B981]/10'
                  : 'border-[#EF4444]/50 text-[#EF4444] bg-[#EF4444]/10'
                  }`}
              >
                SUN {selectedSolarTelemetry.effectiveSunElevDeg >= 0 ? '+' : ''}
                {selectedSolarTelemetry.effectiveSunElevDeg.toFixed(1)}° ·{' '}
                {selectedSolarTelemetry.isSunlit ? 'SUNLIT' : 'SHADOW'}
              </span>
            </div>
          )}

          <div className="pointer-events-auto ml-auto bg-[#090A0D]/95 px-2.5 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] flex items-center gap-2.5 tabular-nums">
            {hoverCoords ? (
              <>
                <span className="text-sky-300 font-semibold">CURSOR</span>
                <span className="text-white">
                  {Math.abs(hoverCoords.lat).toFixed(2)}°{hoverCoords.lat >= 0 ? 'N' : 'S'},{' '}
                  {Math.abs(hoverCoords.lon).toFixed(2)}°{hoverCoords.lon >= 0 ? 'E' : 'W'}
                </span>
                <span className="text-[#6B7280] hidden xl:inline">· CLICK MOON TO INSPECT</span>
              </>
            ) : (
              <>
                <span className="text-white font-semibold">{selectedSite.name}</span>
                <span>
                  LAT {selectedSite.coordinates.latitude >= 0 ? '+' : ''}
                  {selectedSite.coordinates.latitude.toFixed(2)}°
                </span>
                <span>
                  LON {selectedSite.coordinates.longitude >= 0 ? '+' : ''}
                  {selectedSite.coordinates.longitude.toFixed(2)}°
                </span>
                <span>
                  ELEV {selectedSite.coordinates.elevation_m >= 0 ? '+' : ''}
                  {selectedSite.coordinates.elevation_m}M
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* High-Resolution 2.4 km × 2.4 km Local 3D Surface DEM Inspector */}
      {isLocalSurfaceOpen && (
        <LocalSurfaceDetailView
          site={selectedSite}
          lander={lander}
          sunIlluminationOffset={sunIlluminationOffset}
          showAssessmentOverlay={showAssessmentOverlay}
          overlayOpacity={overlayOpacity}
          ambientLightPct={ambientLightEnabled ? ambientLightPct : 0}
          leftDrawerOpen={leftDrawerOpen}
          rightDrawerOpen={rightDrawerOpen}
          onClose={() => setIsLocalSurfaceOpen(false)}
          onOpenTelemetryDrawer={onOpenTelemetryDrawer}
        />
      )}
    </div>
  );
};

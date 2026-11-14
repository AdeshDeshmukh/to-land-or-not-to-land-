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
  Compass,
  RotateCw,
  ZoomIn,
  Maximize2,
  MapPin,
  Crosshair,
  Clock,
  Focus,
  BarChart3,
  Layers,
} from 'lucide-react';
import { LocalSurfaceDetailView } from './LocalSurfaceDetailView';

interface LunarGlobe3DProps {
  sites: CandidateSite[];
  selectedSite: CandidateSite;
  onSelectSite: (site: CandidateSite) => void;
  sunIlluminationOffset?: number; // Days offset
  lander?: LanderProfile;
  onProbeCoordinate?: (
    lat: number,
    lon: number,
    customName?: string,
    sampledSlopeDeg?: number,
    sampledElevM?: number
  ) => void;
  onChangeDateOffset?: (offsetDays: number) => void;
  onOpenTelemetryDrawer?: () => void;
  leftDrawerOpen?: boolean;
  rightDrawerOpen?: boolean;
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
const MAX_CAM_DIST = 15.0;

const INITIAL_CAM_POS = new THREE.Vector3(5.6, -5.8, -2.2);

function computeUpForNormal(normal: THREE.Vector3): THREE.Vector3 {
  const n = normal.clone().normalize();
  const refUp = Math.abs(n.y) > 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  return refUp.addScaledVector(n, -refUp.dot(n)).normalize();
}

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
  onChangeDateOffset,
  onOpenTelemetryDrawer,
  leftDrawerOpen = false,
  rightDrawerOpen = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [showAssessmentOverlay, setShowAssessmentOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(42);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [isZoomedIn, setIsZoomedIn] = useState<boolean>(false);
  const [isLowOrbit, setIsLowOrbit] = useState<boolean>(false);
  const [isLocalSurfaceOpen, setIsLocalSurfaceOpen] = useState<boolean>(false);
  const [isProbeMode, setIsProbeMode] = useState<boolean>(false);
  const [isCoordInputOpen, setIsCoordInputOpen] = useState<boolean>(false);
  const [latInput, setLatInput] = useState<string>('-89.54');
  const [lonInput, setLonInput] = useState<string>('0.00');
  const [labelInput, setLabelInput] = useState<string>('');
  const [coordError, setCoordError] = useState<string>('');
  const [utcDateInput, setUtcDateInput] = useState<string>(
    () => formatMissionUtc(sunIlluminationOffset).dateStr
  );
  const [utcTimeInput, setUtcTimeInput] = useState<string>(
    () => formatMissionUtc(sunIlluminationOffset).timeStr
  );
  const [hoveredSite, setHoveredSite] = useState<CandidateSite | null>(null);

  // Imperative DOM refs for 60fps screen-space pin projection without React re-renders
  const lineElsRef = useRef<Map<string, SVGLineElement>>(new Map());
  const dotElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const labelElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const projectPinsNowRef = useRef<(() => void) | null>(null);

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

  const handleDeployCoordTarget = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLat = Number(latInput);
    const parsedLon = Number(lonInput);
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setCoordError('LATITUDE MUST BE -90 TO +90');
      return;
    }
    if (!Number.isFinite(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      setCoordError('LONGITUDE MUST BE -180 TO +180');
      return;
    }
    setCoordError('');
    skipNextFlyRef.current = false;
    const sampled = sampleTerrainGrid(terrainGridRef.current, parsedLat, parsedLon);
    if (onProbeCoordinateRef.current) {
      onProbeCoordinateRef.current(
        Number(parsedLat.toFixed(2)),
        Number(parsedLon.toFixed(2)),
        labelInput.trim() || undefined,
        sampled.slopeDeg,
        sampled.elevM
      );
    }
    setIsCoordInputOpen(false);
    setLabelInput('');
  };

  const applyUtcChange = (nextDate: string, nextTime: string) => {
    setUtcDateInput(nextDate);
    setUtcTimeInput(nextTime);
    const parsedOffset = parseMissionUtcInputs(nextDate, nextTime);
    if (parsedOffset !== null && onChangeDateOffset) {
      onChangeDateOffset(parsedOffset);
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
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const landingZonesGroupRef = useRef<THREE.Group | null>(null);

  // Terrain & Dynamic Overlay Canvas refs
  const terrainGridRef = useRef<TerrainGrid | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const bumpImgRef = useRef<HTMLImageElement | undefined>(undefined);

  // Gimbal-lock-free quaternion globe camera state
  const camDistRef = useRef<number>(INITIAL_CAM_POS.length());
  const targetCamDistRef = useRef<number>(INITIAL_CAM_POS.length());
  const angVelRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const flyAnimRef = useRef<{
    targetDir: THREE.Vector3;
    targetUp: THREE.Vector3;
    targetDist: number;
  } | null>(null);
  const hasMountedFlyRef = useRef<boolean>(false);
  const skipNextFlyRef = useRef<boolean>(false);

  // Fly camera to a specific landing site centered smoothly over (0, 0, 0)
  const flyToSite = useCallback((site: CandidateSite) => {
    const normal = latLonToVector3(site.coordinates.latitude, site.coordinates.longitude, 1).normalize();
    const rotY = moonMeshRef.current ? moonMeshRef.current.rotation.y : 0;
    if (rotY !== 0) {
      normal.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    }
    const targetDist = camDistRef.current < 4.55 ? 4.15 : 4.65;
    const targetUp = computeUpForNormal(normal);

    angVelRef.current = { x: 0, y: 0 };
    targetCamDistRef.current = targetDist;
    flyAnimRef.current = {
      targetDir: normal,
      targetUp,
      targetDist,
    };
    setIsZoomedIn(true);
    setIsLowOrbit(targetDist < 4.55);
  }, []);

  // Fly back out to orbital overview showing Near Side + South Pole
  const resetToGlobalView = useCallback(() => {
    const targetDist = INITIAL_CAM_POS.length();
    const targetDir = INITIAL_CAM_POS.clone().normalize();
    const targetUp = computeUpForNormal(targetDir);

    angVelRef.current = { x: 0, y: 0 };
    targetCamDistRef.current = targetDist;
    flyAnimRef.current = {
      targetDir,
      targetUp,
      targetDist,
    };
    setIsZoomedIn(false);
    setIsLowOrbit(false);
  }, []);

  // Zoom directly over the Artemis South Pole cluster
  const zoomToSouthPole = useCallback(() => {
    const targetPos = new THREE.Vector3(0, -6.0, 0.4);
    const targetDist = targetPos.length();
    const targetDir = targetPos.clone().normalize();
    const refUp = new THREE.Vector3(0, 0, 1);
    const targetUp = refUp.addScaledVector(targetDir, -refUp.dot(targetDir)).normalize();

    angVelRef.current = { x: 0, y: 0 };
    targetCamDistRef.current = targetDist;
    flyAnimRef.current = {
      targetDir,
      targetUp,
      targetDist,
    };
    setIsZoomedIn(true);
    setIsLowOrbit(false);
  }, []);

  // Setup Three.js Scene + Quaternion Virtual-Globe Camera Controller
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.copy(INITIAL_CAM_POS);
    camera.up.copy(computeUpForNormal(INITIAL_CAM_POS));
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    camDistRef.current = INITIAL_CAM_POS.length();
    targetCamDistRef.current = INITIAL_CAM_POS.length();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Reusable scratch objects for zero-GC quaternion rotation & projection
    const _tmpForward = new THREE.Vector3();
    const _tmpRight = new THREE.Vector3();
    const _tmpUp = new THREE.Vector3();
    const _tmpRadial = new THREE.Vector3();
    const _qYaw = new THREE.Quaternion();
    const _qPitch = new THREE.Quaternion();
    const _qDelta = new THREE.Quaternion();

    const rotateCameraByScreenDelta = (cam: THREE.PerspectiveCamera, dYaw: number, dPitch: number) => {
      const dist = camDistRef.current || INITIAL_CAM_POS.length();
      _tmpForward.copy(cam.position).negate().normalize();
      _tmpRight.crossVectors(_tmpForward, cam.up);
      if (_tmpRight.lengthSq() < 1e-6) {
        _tmpRight.set(1, 0, 0);
      } else {
        _tmpRight.normalize();
      }
      _tmpUp.crossVectors(_tmpRight, _tmpForward).normalize();

      _qYaw.setFromAxisAngle(_tmpUp, -dYaw);
      _qPitch.setFromAxisAngle(_tmpRight, -dPitch);
      _qDelta.multiplyQuaternions(_qYaw, _qPitch);

      cam.position.applyQuaternion(_qDelta).setLength(dist);
      cam.up.copy(_tmpUp).applyQuaternion(_qDelta).normalize();
      _tmpRadial.copy(cam.position).normalize();
      cam.up.addScaledVector(_tmpRadial, -cam.up.dot(_tmpRadial)).normalize();
      cam.lookAt(0, 0, 0);
    };

    // Monochrome lighting (crisp high-contrast solar light aligned to synodic ephemeris + minimal shadow fill)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.06);
    scene.add(ambientLight);

    const { sunVec: initSunVec } = getSubsolarPoint(sunOffsetRef.current);
    const dirLight = new THREE.DirectionalLight(0xffffff, 3.1);
    dirLight.position.set(initSunVec.x * 16, initSunVec.y * 16, initSunVec.z * 16);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const earthshineLight = new THREE.DirectionalLight(0xd1d5db, 0.07);
    earthshineLight.position.set(-10, -2, -5);
    scene.add(earthshineLight);

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

    // 3. Pickable 3D Hit Spheres & Static Selected Target Ring
    const pinsGroup = new THREE.Group();
    scene.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    const landingZonesGroup = new THREE.Group();
    scene.add(landingZonesGroup);
    landingZonesGroupRef.current = landingZonesGroup;

    // 4. Quaternion Pointer Drag + Scroll Zoom + Direct Surface Click Inspection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isPointerDown = false;
    let activePointerId: number | null = null;
    let didDrag = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastHoverSiteId: string | null = null;
    let lastHoverCheck = 0;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      isPointerDown = true;
      activePointerId = event.pointerId;
      didDrag = false;
      downX = event.clientX;
      downY = event.clientY;
      lastX = event.clientX;
      lastY = event.clientY;

      flyAnimRef.current = null;
      angVelRef.current = { x: 0, y: 0 };
      renderer.domElement.style.cursor = isProbeModeRef.current ? 'crosshair' : 'grabbing';

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

        const scale =
          Math.max(0.055, (camDistRef.current - MOON_RADIUS * 0.96) / (MOON_RADIUS * 1.6)) * 0.0052;
        const dYaw = dx * scale;
        const dPitch = dy * scale;
        rotateCameraByScreenDelta(camera, dYaw, dPitch);
        angVelRef.current = { x: dYaw, y: dPitch };
        return;
      }

      if (isProbeModeRef.current) {
        renderer.domElement.style.cursor = 'crosshair';
        return;
      }

      const now = performance.now();
      if (now - lastHoverCheck < 45) return;
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
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }

      if (lastHoverSiteId !== null) {
        lastHoverSiteId = null;
        setHoveredSite(null);
      }
      renderer.domElement.style.cursor = 'grab';
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!isPointerDown) return;
      const wasDrag = didDrag;
      isPointerDown = false;
      if (activePointerId !== null) {
        try {
          renderer.domElement.releasePointerCapture(activePointerId);
        } catch {
          // Ignore release failures
        }
        activePointerId = null;
      }
      renderer.domElement.style.cursor = isProbeModeRef.current ? 'crosshair' : 'grab';

      if (event.type === 'pointercancel' || wasDrag) {
        return;
      }

      angVelRef.current = { x: 0, y: 0 };

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. Check existing site pins first unless crosshair probe explicitly overrides
      if (!isProbeModeRef.current) {
        const pinHits = raycaster.intersectObjects(pinsGroup.children, true);
        if (pinHits.length > 0) {
          let obj: THREE.Object3D | null = pinHits[0].object;
          while (obj && !obj.userData?.site) {
            obj = obj.parent;
          }
          if (obj && obj.userData?.site) {
            skipNextFlyRef.current = true;
            onSelectSiteRef.current(obj.userData.site);
            return;
          }
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
          if (onProbeCoordinateRef.current) {
            onProbeCoordinateRef.current(
              latitude,
              longitude,
              undefined,
              sampled.slopeDeg,
              sampled.elevM
            );
          }
          if (isProbeModeRef.current) {
            setIsProbeMode(false);
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
      setIsZoomedIn(nextDist < 7.2);
      setIsLowOrbit(nextDist < 4.55);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
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

    // 6. Imperative 60fps DOM Projection for Telemetry Markers & Non-Overlapping Leader Lines
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

      for (const site of currentSites) {
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
    };
    projectPinsNowRef.current = updateProjectedPinsDOM;

    // 7. Render Loop (60fps zero-React-rerender quaternion orbit + zoom damping)
    let animId: number;
    const _curDir = new THREE.Vector3();
    const _radNorm = new THREE.Vector3();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const fly = flyAnimRef.current;
      if (fly) {
        _curDir.copy(camera.position).normalize();
        _curDir.lerp(fly.targetDir, 0.08).normalize();
        camDistRef.current += (fly.targetDist - camDistRef.current) * 0.08;
        camera.position.copy(_curDir).multiplyScalar(camDistRef.current);

        camera.up.lerp(fly.targetUp, 0.08).normalize();
        _radNorm.copy(camera.position).normalize();
        camera.up.addScaledVector(_radNorm, -camera.up.dot(_radNorm)).normalize();
        camera.lookAt(0, 0, 0);

        if (
          _curDir.distanceTo(fly.targetDir) < 0.008 &&
          Math.abs(camDistRef.current - fly.targetDist) < 0.02
        ) {
          camera.position.copy(fly.targetDir).multiplyScalar(fly.targetDist);
          camera.up.copy(fly.targetUp);
          camera.lookAt(0, 0, 0);
          camDistRef.current = fly.targetDist;
          flyAnimRef.current = null;
        }
      } else {
        // Smooth wheel zoom interpolation
        if (Math.abs(targetCamDistRef.current - camDistRef.current) > 0.002) {
          camDistRef.current += (targetCamDistRef.current - camDistRef.current) * 0.14;
          camera.position.setLength(camDistRef.current);
        }

        // Smooth drag momentum damping after mouse release
        if (!isPointerDown) {
          const vx = angVelRef.current.x;
          const vy = angVelRef.current.y;
          if (Math.abs(vx) > 1e-5 || Math.abs(vy) > 1e-5) {
            rotateCameraByScreenDelta(camera, vx, vy);
            angVelRef.current.x = vx * 0.90;
            angVelRef.current.y = vy * 0.90;
          }
        }
      }

      if (autoRotateRef.current && !flyAnimRef.current && !isPointerDown) {
        moonMesh.rotation.y += 0.0018;
        overlayMesh.rotation.y += 0.0018;
        pinsGroup.rotation.y += 0.0018;
        landingZonesGroup.rotation.y += 0.0018;
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
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerup', handlePointerUp);
        renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
        renderer.domElement.removeEventListener('wheel', handleWheel);
      }
      monoTexture.dispose();
      normalTexture.dispose();
      overlayTexture.dispose();
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

  // Align 3D Sunlight Terminator Vector identically with ephemeris model & RYG shadows
  useEffect(() => {
    if (!dirLightRef.current) return;
    const { sunVec } = getSubsolarPoint(sunIlluminationOffset);
    dirLightRef.current.position.set(sunVec.x * 16, sunVec.y * 16, sunVec.z * 16);
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
  }, [sites, selectedSite]);

  // Ensure newly mounted or re-rendered pin nodes position immediately
  useEffect(() => {
    projectPinsNowRef.current?.();
  }, [sites, selectedSite, siteMetricsMap, leftDrawerOpen, rightDrawerOpen]);

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

  return (
    <div className="relative w-full h-full overflow-hidden bg-black flex flex-col">
      {/* 3D WebGL Canvas Mount Container */}
      <div ref={mountRef} className="w-full h-full flex-1 cursor-grab active:cursor-grabbing" />

      {/* Projected Screen-Space SpaceX Telemetry Markers (Imperatively positioned at 60fps) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
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
              {isLowOrbit
                ? 'LOW ORBIT INSPECTION'
                : isZoomedIn
                  ? 'DESCENT INSPECTION'
                  : 'ORBITAL OVERVIEW'}
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
              className="w-24"
            />
            <span className="text-white font-bold tabular-nums w-8 text-right">
              {overlayOpacity}%
            </span>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="pointer-events-auto relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsCoordInputOpen((prev) => !prev);
              setIsProbeMode(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition border ${isCoordInputOpen
              ? 'bg-white text-black font-bold border-white'
              : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/35'
              }`}
            title="Enter custom lunar latitude & longitude coordinates"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>COORDS</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsProbeMode((prev) => !prev);
              setIsCoordInputOpen(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition border ${isProbeMode
              ? 'bg-white text-black font-bold border-white'
              : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/35'
              }`}
            title="Clicking anywhere on the Moon inspects coordinates & risk (toggle precision crosshair cursor)"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{isProbeMode ? 'CROSSHAIR ON' : 'CLICK MOON'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAutoRotate((prev) => !prev)}
            className={`p-1.5 rounded-[2px] text-[10px] transition border ${autoRotate
              ? 'bg-white text-black border-white'
              : 'bg-[#090A0D]/95 text-[#9CA3AF] border-white/[0.14] hover:text-white hover:border-white/35'
              }`}
            title="Toggle orbital rotation"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            data-testid="open-local-surface-top-btn"
            onClick={() => setIsLocalSurfaceOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/[0.14] hover:border-white/35 text-[10px] font-mono uppercase tracking-wider text-white transition"
            title="Inspect 2.4 km × 2.4 km high-resolution 3D local surface DEM & boulder hazard patch"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D Surface DEM</span>
          </button>

          <button
            type="button"
            onClick={zoomToSouthPole}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/[0.14] hover:border-white/35 text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] hover:text-white transition"
            title="Zoom into Artemis South Pole cluster"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>South Pole</span>
          </button>

          <button
            type="button"
            onClick={resetToGlobalView}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[2px] bg-[#090A0D]/95 hover:bg-[#12141A] border border-white/[0.14] hover:border-white/35 text-[10px] font-mono uppercase tracking-wider text-[#9CA3AF] hover:text-white transition"
            title="Reset to orbital overview"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {/* Compact SpaceX Coordinate Targeting Popover */}
          {isCoordInputOpen && (
            <form
              onSubmit={handleDeployCoordTarget}
              className="absolute right-0 top-10 w-64 bg-[#090A0D]/98 border border-white/25 rounded-[2px] p-3 space-y-2.5 z-30 font-mono shadow-none"
            >
              <div className="flex items-center justify-between border-b border-white/[0.12] pb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white font-semibold flex items-center gap-1.5">
                  <Crosshair className="w-3 h-3" /> Target Coordinate Entry
                </span>
                <button
                  type="button"
                  onClick={() => setIsCoordInputOpen(false)}
                  className="text-[10px] text-[#6B7280] hover:text-white uppercase"
                >
                  ESC
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="hud-coord-lat"
                    className="block text-[9px] text-[#9CA3AF] uppercase tracking-wider mb-1"
                  >
                    LAT (-90..90)
                  </label>
                  <input
                    id="hud-coord-lat"
                    type="number"
                    step="0.01"
                    min={-90}
                    max={90}
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    className="w-full px-2 py-1 bg-[#000000] border border-white/[0.16] rounded-[2px] text-[11px] text-white tabular-nums focus:outline-none focus:border-white/60"
                  />
                </div>
                <div>
                  <label
                    htmlFor="hud-coord-lon"
                    className="block text-[9px] text-[#9CA3AF] uppercase tracking-wider mb-1"
                  >
                    LON (-180..180)
                  </label>
                  <input
                    id="hud-coord-lon"
                    type="number"
                    step="0.01"
                    min={-180}
                    max={180}
                    value={lonInput}
                    onChange={(e) => setLonInput(e.target.value)}
                    className="w-full px-2 py-1 bg-[#000000] border border-white/[0.16] rounded-[2px] text-[11px] text-white tabular-nums focus:outline-none focus:border-white/60"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="hud-coord-label"
                  className="block text-[9px] text-[#9CA3AF] uppercase tracking-wider mb-1"
                >
                  SITE DESIGNATION (OPT)
                </label>
                <input
                  id="hud-coord-label"
                  type="text"
                  placeholder="E.G. HAWORTH RIDGE ALPHA"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="w-full px-2 py-1 bg-[#000000] border border-white/[0.16] rounded-[2px] text-[10px] text-white uppercase tracking-wider placeholder:text-[#4B5563] focus:outline-none focus:border-white/60"
                />
              </div>

              {coordError && (
                <div className="text-[9px] text-[#EF4444] uppercase tracking-wider">
                  {coordError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-1.5 bg-white text-black hover:bg-neutral-200 rounded-[2px] text-[10px] font-bold uppercase tracking-widest transition"
              >
                DEPLOY &amp; FLY TO TARGET
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Precision Probe Cursor Banner */}
      {isProbeMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-[#090A0D]/95 border border-white/40 px-3.5 py-1 rounded-[2px] text-[10px] font-mono uppercase tracking-wider text-white flex items-center gap-2 z-20 pointer-events-none">
          <MapPin className="w-3.5 h-3.5 text-white" />
          <span>Precision mode active — click anywhere on the Moon surface</span>
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
              {hoveredMetric.hasLos ? 'DTE OK' : 'NO DTE'}
            </div>
          </div>
        </div>
      )}

      {/* On-Viewport Selected Surface Area: Coordinates & 4-Factor Risk Assessment HUD Card */}
      <div
        data-testid="surface-risk-hud"
        className={`pointer-events-auto absolute bottom-14 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} w-[312px] sm:w-[336px] max-w-[calc(100vw-24px)] bg-[#090A0D]/95 backdrop-blur-md border border-white/[0.16] rounded-[2px] p-3 font-mono z-20 transition-all duration-300`}
      >
        {/* Header: Probed/Selected Area + Overall Risk Verdict Badge */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-white/[0.12]">
          <div className="min-w-0">
            <div className="text-[9px] text-[#6B7280] uppercase tracking-widest">
              SURFACE INSPECTION // {selectedSite.region}
            </div>
            <div className="text-xs font-bold text-white uppercase tracking-wider truncate mt-0.5">
              {selectedSite.name}
            </div>
          </div>
          <span
            style={{
              color: statusHex(selectedRiskTelemetry.risk.overall_status),
              borderColor: `${statusHex(selectedRiskTelemetry.risk.overall_status)}66`,
              backgroundColor: `${statusHex(selectedRiskTelemetry.risk.overall_status)}1A`,
            }}
            className="shrink-0 px-2 py-0.5 rounded-[2px] border text-[10px] font-bold uppercase tracking-wider tabular-nums"
          >
            {statusLabel(selectedRiskTelemetry.risk.overall_status)}
          </span>
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

        {/* Actions: Focus Cam / 3D Surface Patch / Full Analysis */}
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
              <span>FULL ANALYSIS</span>
            </button>
          )}
        </div>
      </div>

      {/* Bottom HUD: Dynamic Overlay Legend, Mission UTC Clock Bar & Selected Site Coordinates */}
      <div
        className={`absolute bottom-3 ${leftDrawerOpen ? 'lg:left-[396px] left-3' : 'left-3'} ${rightDrawerOpen ? 'lg:right-[512px] right-3' : 'right-3'} flex flex-wrap items-center justify-between gap-2 pointer-events-none z-20 transition-all duration-300`}
      >
        {showAssessmentOverlay && overlayOpacity > 0 && (
          <div className="pointer-events-auto bg-[#090A0D]/95 px-2.5 py-1.5 rounded-[2px] border border-white/[0.14] text-[10px] font-mono uppercase tracking-wider flex items-center gap-3">
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
          </div>
        )}

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
                onClick={() => onChangeDateOffset(Math.max(-14.77, sunIlluminationOffset - 1))}
                className="px-1.5 py-0.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.12] rounded-[2px] text-[9px] text-[#9CA3AF] hover:text-white transition"
              >
                -1D
              </button>
              <button
                type="button"
                onClick={() => onChangeDateOffset(Math.max(-14.77, sunIlluminationOffset - 0.25))}
                className="px-1.5 py-0.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.12] rounded-[2px] text-[9px] text-[#9CA3AF] hover:text-white transition"
              >
                -6H
              </button>
              <button
                type="button"
                onClick={() => onChangeDateOffset(0)}
                className={`px-1.5 py-0.5 border border-white/[0.12] rounded-[2px] text-[9px] transition ${Math.abs(sunIlluminationOffset) < 0.02
                  ? 'bg-white text-black font-bold'
                  : 'bg-[#12141A] hover:bg-white/15 text-[#9CA3AF] hover:text-white'
                  }`}
              >
                T0
              </button>
              <button
                type="button"
                onClick={() => onChangeDateOffset(Math.min(14.77, sunIlluminationOffset + 0.25))}
                className="px-1.5 py-0.5 bg-[#12141A] hover:bg-white/15 border border-white/[0.12] rounded-[2px] text-[9px] text-[#9CA3AF] hover:text-white transition"
              >
                +6H
              </button>
              <button
                type="button"
                onClick={() => onChangeDateOffset(Math.min(14.77, sunIlluminationOffset + 1))}
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
          leftDrawerOpen={leftDrawerOpen}
          rightDrawerOpen={rightDrawerOpen}
          onClose={() => setIsLocalSurfaceOpen(false)}
          onOpenTelemetryDrawer={onOpenTelemetryDrawer}
        />
      )}
    </div>
  );
};

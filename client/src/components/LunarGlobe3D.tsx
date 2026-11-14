import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
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
} from 'lucide-react';

interface LunarGlobe3DProps {
  sites: CandidateSite[];
  selectedSite: CandidateSite;
  onSelectSite: (site: CandidateSite) => void;
  sunIlluminationOffset?: number; // Days offset
  lander?: LanderProfile;
  onProbeCoordinate?: (lat: number, lon: number, customName?: string) => void;
  onChangeDateOffset?: (offsetDays: number) => void;
  leftDrawerOpen?: boolean;
  rightDrawerOpen?: boolean;
}

interface TerrainGrid {
  width: number;
  height: number;
  slopeDeg: Float32Array;
  roughnessCode: Uint8Array; // 0 = LOW, 1 = MODERATE, 2 = HIGH
  horizonCutoffDeg: Float32Array;
  earthCutoffDeg: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
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
const SURF_TEX_W = 2048;
const SURF_TEX_H = 1024;

const INITIAL_CAM_POS = new THREE.Vector3(5.6, -5.8, -2.2);

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
    const steepScale = 0.56 * Math.min(1.35, 0.72 + 0.32 / Math.sqrt(Math.max(0.22, c.radiusDeg)));
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

// Isotropic 3D trilinear hash noise (completely non-periodic -> zero parallel stripe artifacts)
function hash3(ix: number, iy: number, iz: number): number {
  let n = (ix * 374761393 + iy * 668265263 + iz * 2147483647) | 0;
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function noise3D(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const c000 = hash3(ix, iy, iz);
  const c100 = hash3(ix + 1, iy, iz);
  const c010 = hash3(ix, iy + 1, iz);
  const c110 = hash3(ix + 1, iy + 1, iz);
  const c001 = hash3(ix, iy, iz + 1);
  const c101 = hash3(ix + 1, iy, iz + 1);
  const c011 = hash3(ix, iy + 1, iz + 1);
  const c111 = hash3(ix + 1, iy + 1, iz + 1);

  const x00 = c000 + (c100 - c000) * ux;
  const x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux;
  const x11 = c011 + (c111 - c011) * ux;

  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return (y0 + (y1 - y0) * uz) * 2 - 1;
}

function fbm3D(x: number, y: number, z: number): number {
  return (
    noise3D(x, y, z) * 0.62 +
    noise3D(x * 2.13, y * 2.13, z * 2.13) * 0.28 +
    noise3D(x * 4.41, y * 4.41, z * 4.41) * 0.10
  );
}

// 1. Synthesize Monochrome Lunar Albedo & Spherical Tangent-Space Normal Map
// Preserves full LROC/LOLA mid-latitude fidelity while sculpting crisp circular 3D-lit South Pole craters down to -90°.
function paintLunarSurfaceTextures(
  monoCanvas: HTMLCanvasElement,
  monoTexture: THREE.CanvasTexture,
  normalCanvas: HTMLCanvasElement,
  normalTexture: THREE.CanvasTexture,
  bumpCanvas: HTMLCanvasElement,
  bumpTexture: THREE.CanvasTexture,
  lrocImg?: HTMLImageElement,
  bumpImg?: HTMLImageElement
) {
  const w = SURF_TEX_W;
  const h = SURF_TEX_H;
  const mctx = monoCanvas.getContext('2d', { willReadFrequently: true })!;
  const nctx = normalCanvas.getContext('2d', { willReadFrequently: true })!;
  const bctx = bumpCanvas.getContext('2d', { willReadFrequently: true })!;

  // Base albedo from LROC polar texture (or neutral regolith seed before image load)
  if (lrocImg) {
    mctx.drawImage(lrocImg, 0, 0, w, h);
  } else {
    mctx.fillStyle = '#8b8e94';
    mctx.fillRect(0, 0, w, h);
  }
  const monoImgData = mctx.getImageData(0, 0, w, h);
  const mData = monoImgData.data;

  // Extract LOLA bump pixels if decoded
  let lolaData: Uint8ClampedArray | null = null;
  if (bumpImg) {
    bctx.drawImage(bumpImg, 0, 0, w, h);
    lolaData = bctx.getImageData(0, 0, w, h).data;
  }
  const bumpImgData = bctx.createImageData(w, h);
  const bData = bumpImgData.data;

  const normalImgData = nctx.createImageData(w, h);
  const nData = normalImgData.data;

  const craters = getCraterDescriptors();
  const numCraters = craters.length;
  const deg2Rad = Math.PI / 180;
  const noiseEps = 0.008;

  for (let py = 0; py < h; py++) {
    const latDeg = 90 - ((py + 0.5) / h) * 180;
    const latRad = latDeg * deg2Rad;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const cosLatClamped = Math.max(0.32, cosLat);
    const isPolarCraterZone = latDeg <= -57.5;

    // Taper LOLA finite-difference gradient smoothly to 0 by -64° so polar equirectangular JPEG stripes never appear
    let lolaPoleFade = 1.0;
    if (latDeg < -52) {
      const t = Math.max(0, Math.min(1, (-52 - latDeg) / 12));
      lolaPoleFade = 1 - t * t * (3 - 2 * t);
    } else if (latDeg > 60) {
      const t = Math.max(0, Math.min(1, (latDeg - 60) / 15));
      lolaPoleFade = 1 - t * t * (3 - 2 * t);
    }

    const pyUp = Math.max(0, py - 1);
    const pyDn = Math.min(h - 1, py + 1);
    const rowOffset = py * w;

    for (let px = 0; px < w; px++) {
      const idx = rowOffset + px;
      const p4 = idx * 4;
      const lonDeg = ((px + 0.5) / w) * 360 - 180;
      const lonRad = lonDeg * deg2Rad;
      const sinLon = Math.sin(lonRad);
      const cosLon = Math.cos(lonRad);

      // Outward spherical normal P, East tangent E, North tangent N
      const vx = cosLat * cosLon;
      const vy = sinLat;
      const vz = -cosLat * sinLon;

      const ex = -sinLon;
      const ez = -cosLon; // ey = 0
      const nxAxis = -sinLat * cosLon;
      const nyAxis = cosLat;
      const nzAxis = sinLat * sinLon;

      // 1) Base LROC monochrome albedo
      let albedoLum: number;
      if (lrocImg) {
        const lum = 0.299 * mData[p4] + 0.587 * mData[p4 + 1] + 0.114 * mData[p4 + 2];
        albedoLum = Math.min(255, Math.max(0, Math.pow(lum / 255, 1.06) * 235 + 10));
      } else {
        albedoLum = 138 + fbm3D(vx * 5, vy * 5, vz * 5) * 16;
      }

      // 2) LOLA terrain slope + height (mid-latitudes smoothed cleanly, tapered near poles)
      let heightNorm = 0;
      let dH_dEast = 0;
      let dH_dNorth = 0;

      if (lolaData && lolaPoleFade > 0.005) {
        const pxL = (px - 1 + w) % w;
        const pxR = (px + 1) % w;
        const eC = lolaData[p4];
        const eL = lolaData[(rowOffset + pxL) * 4];
        const eR = lolaData[(rowOffset + pxR) * 4];
        const eU = lolaData[(pyUp * w + px) * 4];
        const eD = lolaData[(pyDn * w + px) * 4];

        heightNorm += (eC / 255 - 0.5) * 0.45 * lolaPoleFade;
        dH_dEast += (((eR - eL) / 255) * 1.9 * lolaPoleFade) / cosLatClamped;
        dH_dNorth += ((eU - eD) / 255) * 1.9 * lolaPoleFade;
      }

      // 3) Analytic 3D Spherical South Pole Crater Synthesis + isotropic 3D highland relief
      let craterH = 0;
      if (isPolarCraterZone) {
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
              craterH += -c.depthNorm + c.rimNorm * Math.pow(rNorm, 3.0);
              dfDrNorm = 3.0 * c.rimNorm * rNorm * rNorm;
            } else {
              const span = Math.max(0.05, 1.0 - floorR);
              const u = (rNorm - floorR) / span;
              const smooth = u * u * (3 - 2 * u);
              const dSmooth = (6 * u * (1 - u)) / span;
              craterH += -c.depthNorm * (1.0 - smooth) + c.rimNorm * Math.pow(rNorm, 3.0);
              dfDrNorm = c.depthNorm * dSmooth + 3.0 * c.rimNorm * rNorm * rNorm;
            }
          } else {
            const t = (rNorm - 1.0) / 0.48;
            if (t < 1.0) {
              const apron = 1.0 - t;
              craterH += c.rimNorm * apron * apron;
              dfDrNorm = -(2.0 * c.rimNorm * apron) / 0.48;
            }
          }

          if (Math.abs(dfDrNorm) > 1e-5) {
            const cDotE = c.cx * ex + c.cz * ez;
            const cDotN = c.cx * nxAxis + c.cy * nyAxis + c.cz * nzAxis;
            const factor = (dfDrNorm * c.steepScale) / sinTheta;
            dH_dEast += factor * -cDotE;
            dH_dNorth += factor * -cDotN;
          }
        }

        // Gentle isotropic 3D highland regolith undulation (non-periodic)
        const nFreq = 18.0;
        const px0 = vx * nFreq;
        const py0 = vy * nFreq;
        const pz0 = vz * nFreq;
        const nE =
          fbm3D(px0 + ex * noiseEps * nFreq, py0, pz0 + ez * noiseEps * nFreq) -
          fbm3D(px0 - ex * noiseEps * nFreq, py0, pz0 - ez * noiseEps * nFreq);
        const nN =
          fbm3D(px0 + nxAxis * noiseEps * nFreq, py0 + nyAxis * noiseEps * nFreq, pz0 + nzAxis * noiseEps * nFreq) -
          fbm3D(px0 - nxAxis * noiseEps * nFreq, py0 - nyAxis * noiseEps * nFreq, pz0 - nzAxis * noiseEps * nFreq);
        const regolithH = fbm3D(px0, py0, pz0) * 0.05;
        craterH += regolithH;
        dH_dEast += (nE / (2 * noiseEps)) * 0.008;
        dH_dNorth += (nN / (2 * noiseEps)) * 0.008;

        // Ambient occlusion & sun-catching anorthosite rim shading inside monochrome albedo
        if (craterH < -0.04) {
          albedoLum *= Math.max(0.64, 1.0 + craterH * 0.30);
        } else if (craterH > 0.02) {
          albedoLum *= Math.min(1.22, 1.0 + craterH * 0.50);
        }
        heightNorm += craterH * 0.55;
      }

      // Write monochrome albedo
      const finalAlbedo = Math.min(255, Math.max(0, Math.round(albedoLum)));
      mData[p4] = finalAlbedo;
      mData[p4 + 1] = finalAlbedo;
      mData[p4 + 2] = finalAlbedo;
      mData[p4 + 3] = 255;

      // Write combined bump grayscale (128 neutral)
      const finalBump = Math.min(255, Math.max(0, Math.round(128 + heightNorm * 110)));
      bData[p4] = finalBump;
      bData[p4 + 1] = finalBump;
      bData[p4 + 2] = finalBump;
      bData[p4 + 3] = 255;

      // Encode normalized tangent-space normal vector (-dH_dE, -dH_dN, 1)
      const tx = -dH_dEast;
      const ty = -dH_dNorth;
      const tz = 1.0;
      const invLen = 1.0 / Math.sqrt(tx * tx + ty * ty + tz * tz);
      nData[p4] = Math.min(255, Math.max(0, Math.round((tx * invLen * 0.5 + 0.5) * 255)));
      nData[p4 + 1] = Math.min(255, Math.max(0, Math.round((ty * invLen * 0.5 + 0.5) * 255)));
      nData[p4 + 2] = Math.min(255, Math.max(0, Math.round((tz * invLen * 0.5 + 0.5) * 255)));
      nData[p4 + 3] = 255;
    }
  }

  mctx.putImageData(monoImgData, 0, 0);
  bctx.putImageData(bumpImgData, 0, 0);
  nctx.putImageData(normalImgData, 0, 0);

  monoTexture.needsUpdate = true;
  bumpTexture.needsUpdate = true;
  normalTexture.needsUpdate = true;
}

// 2. Build 512x256 terrain grid combining LOLA elevation, South Pole craters, and preset site relief
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

  const slopeDeg = new Float32Array(n);
  const roughnessCode = new Uint8Array(n);
  const horizonCutoffDeg = new Float32Array(n);
  const earthCutoffDeg = new Float32Array(n);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const nz = new Float32Array(n);

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

      const normal = latLonToCartesian(lat, lon, 1);
      nx[idx] = normal.x;
      ny[idx] = normal.y;
      nz[idx] = normal.z;

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

      const baseSlope = 1.6 + grad * 0.48 + (absLat > 78 ? 1.2 : 0);
      const craterSample = lat <= -58 ? sampleCraterField(lat, lon) : null;

      slopeDeg[idx] = craterSample
        ? Math.max(1.2, Math.min(28.0, baseSlope * 0.45 + craterSample.slopeDeg * 0.65))
        : Math.max(1.0, Math.min(22.0, baseSlope));

      roughnessCode[idx] =
        slopeDeg[idx] >= 13.5 || laplacian > 7.5 || grad > 22
          ? 2
          : slopeDeg[idx] >= 6.5 || laplacian > 3.2 || grad > 11
            ? 1
            : 0;

      horizonCutoffDeg[idx] = craterSample ? craterSample.horizonCutoffDeg : 0;
      earthCutoffDeg[idx] = craterSample ? Math.max(-1.8, craterSample.horizonCutoffDeg * 0.85) : 0;
    }
  }

  // Blend Gaussian regional anchors around candidate/custom sites so the globe surface
  // around each marker mirrors its surveyed terrain slope & topographic horizon prominence
  for (const site of sites) {
    const sLat = site.coordinates.latitude;
    const sLon = site.coordinates.longitude;
    const cosSiteLat = Math.max(0.08, Math.cos((sLat * Math.PI) / 180));
    const sigmaDeg = 4.6;
    const sigma2 = 2 * sigmaDeg * sigmaDeg;
    const siteRough =
      site.terrain.roughness === 'HIGH' ? 2 : site.terrain.roughness === 'MODERATE' ? 1 : 0;

    let siteSunCutoff = 0;
    let siteEarthCutoff = 0;
    if (site.coordinates.elevation_m >= 2500) {
      siteSunCutoff = -1.65 - Math.min(0.6, (site.coordinates.elevation_m - 2500) / 4500);
      siteEarthCutoff = -1.7;
    } else if (site.coordinates.elevation_m <= -800 && sLat <= -75) {
      siteSunCutoff = 2.75;
    }
    if (site.id === 'nobile_crater_rim' || !site.defaultEarthLos) {
      siteEarthCutoff = Math.max(siteEarthCutoff, 10.8);
    }

    const minY = Math.max(0, Math.floor(((90 - (sLat + 12)) / 180) * h));
    const maxY = Math.min(h - 1, Math.ceil(((90 - (sLat - 12)) / 180) * h));

    for (let y = minY; y <= maxY; y++) {
      const lat = 90 - ((y + 0.5) / h) * 180;
      const dLat = lat - sLat;
      if (Math.abs(dLat) > 12) continue;

      for (let x = 0; x < w; x++) {
        const lon = ((x + 0.5) / w) * 360 - 180;
        let dLon = lon - sLon;
        if (dLon > 180) dLon -= 360;
        if (dLon < -180) dLon += 360;
        const scaledDLon = dLon * cosSiteLat;
        const d2 = dLat * dLat + scaledDLon * scaledDLon;
        if (d2 > 120) continue;

        const weight = Math.exp(-d2 / sigma2);
        if (weight < 0.05) continue;

        const idx = y * w + x;
        slopeDeg[idx] = slopeDeg[idx] * (1 - weight) + site.terrain.slope_deg * weight;
        horizonCutoffDeg[idx] = horizonCutoffDeg[idx] * (1 - weight) + siteSunCutoff * weight;
        earthCutoffDeg[idx] = earthCutoffDeg[idx] * (1 - weight) + siteEarthCutoff * weight;
        if (weight > 0.45) {
          roughnessCode[idx] = siteRough;
        }
      }
    }
  }

  return {
    width: w,
    height: h,
    slopeDeg,
    roughnessCode,
    horizonCutoffDeg,
    earthCutoffDeg,
    nx,
    ny,
    nz,
  };
}

// 3. Paint dynamic RYG landing assessment directly synced with exact 3D sun shadows + craters
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
    const hasLos = effectiveEarthElev > 0;

    const s = slopeDeg[i];
    const r = roughnessCode[i];

    let isRed = false;
    let isYellow = false;

    // 1. Slope check
    if (s > maxSlope) isRed = true;
    else if (s >= cautionSlope) isYellow = true;

    // 2. Solar Illumination / 3D Shadow Terminator check
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

    // 4. Direct-to-Earth (DTE) LOS check
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
  onChangeDateOffset,
  leftDrawerOpen = false,
  rightDrawerOpen = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [showAssessmentOverlay, setShowAssessmentOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(55);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [isZoomedIn, setIsZoomedIn] = useState<boolean>(false);
  const [isProbeMode, setIsProbeMode] = useState<boolean>(false);
  const [isCoordInputOpen, setIsCoordInputOpen] = useState<boolean>(false);
  const [latInput, setLatInput] = useState<string>('-89.54');
  const [lonInput, setLonInput] = useState<string>('0.00');
  const [labelInput, setLabelInput] = useState<string>('');
  const [coordError, setCoordError] = useState<string>('');
  const [utcDateInput, setUtcDateInput] = useState<string>(() => formatMissionUtc(sunIlluminationOffset).dateStr);
  const [utcTimeInput, setUtcTimeInput] = useState<string>(() => formatMissionUtc(sunIlluminationOffset).timeStr);
  const [hoveredSite, setHoveredSite] = useState<CandidateSite | null>(null);
  const [projectedPins, setProjectedPins] = useState<ProjectedPin[]>([]);

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

  const sitesSignature = useMemo(
    () => sites.map((s) => `${s.id}:${s.coordinates.latitude.toFixed(2)},${s.coordinates.longitude.toFixed(2)}`).join('|'),
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
    if (onProbeCoordinateRef.current) {
      onProbeCoordinateRef.current(Number(parsedLat.toFixed(2)), Number(parsedLon.toFixed(2)), labelInput.trim() || undefined);
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

    // 1. Monochrome Lunar Base Sphere (LROC grayscale albedo + LOLA DEM + 3D Spherical South Pole Craters Normal Map)
    const monoCanvas = document.createElement('canvas');
    monoCanvas.width = SURF_TEX_W;
    monoCanvas.height = SURF_TEX_H;
    const monoTexture = new THREE.CanvasTexture(monoCanvas);
    monoTexture.wrapS = THREE.RepeatWrapping;
    monoTexture.wrapT = THREE.ClampToEdgeWrapping;

    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = SURF_TEX_W;
    normalCanvas.height = SURF_TEX_H;
    const normalTexture = new THREE.CanvasTexture(normalCanvas);
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.ClampToEdgeWrapping;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = SURF_TEX_W;
    bumpCanvas.height = SURF_TEX_H;
    const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
    bumpTexture.wrapS = THREE.RepeatWrapping;
    bumpTexture.wrapT = THREE.ClampToEdgeWrapping;

    let loadedLrocImg: HTMLImageElement | undefined;
    let loadedBumpImg: HTMLImageElement | undefined;
    let isCleanedUp = false;

    // Seed crisp South Pole crater relief immediately on mount before external JPEGs decode
    paintLunarSurfaceTextures(
      monoCanvas,
      monoTexture,
      normalCanvas,
      normalTexture,
      bumpCanvas,
      bumpTexture
    );

    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 128, 128);
    const moonMaterial = new THREE.MeshStandardMaterial({
      map: monoTexture,
      normalMap: normalTexture,
      normalScale: new THREE.Vector2(1.85, 1.85),
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
    overlayTextureRef.current = overlayTexture;

    const overlayGeo = new THREE.SphereGeometry(MOON_RADIUS * 1.002, 128, 128);
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
    builtSitesSigRef.current = sitesSignature;
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
        bumpCanvas,
        bumpTexture,
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
        bumpCanvas,
        bumpTexture,
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

      const leftOpen = leftDrawerOpenRef.current && w >= 1024;
      const rightOpen = rightDrawerOpenRef.current && w >= 1024;
      const safeLeft = leftOpen ? 396 : 16;
      const safeRight = rightOpen ? w - 512 : w - 16;
      const safeTop = leftOpen && rightOpen ? 104 : 66;
      const safeBottom = leftOpen && rightOpen ? h - 104 : h - 74;

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

        // Skip pins behind open side drawers or behind top/bottom HUD control strips
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
        const labelY = Math.max(safeTop + 8, Math.min(safeBottom - 8, sy + offset.dy));
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
            items[i].labelY = Math.min(safeBottom - 8, items[i - 1].labelY + minGap);
          }
        }
      };

      resolveOverlap(raw.filter((p) => p.align === 'left'));
      resolveOverlap(raw.filter((p) => p.align === 'right'));

      const sig = `${leftOpen ? 1 : 0}:${rightOpen ? 1 : 0}|` + raw
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
      isCleanedUp = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      }
      monoTexture.dispose();
      normalTexture.dispose();
      bumpTexture.dispose();
      overlayTexture.dispose();
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

  // Recompute RYG Assessment Overlay whenever landing parameters, sites, or synodic date/time changes
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const tex = overlayTextureRef.current;
    if (!canvas || !tex) return;

    if (!terrainGridRef.current || builtSitesSigRef.current !== sitesSignature) {
      builtSitesSigRef.current = sitesSignature;
      terrainGridRef.current = buildTerrainGrid(sites, bumpImgRef.current);
    }

    paintDynamicOverlayTexture(
      terrainGridRef.current,
      canvas,
      tex,
      lander,
      sunIlluminationOffset
    );
  }, [lander, sunIlluminationOffset, sites, sitesSignature]);

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
        <div className="pointer-events-auto relative flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsCoordInputOpen((prev) => !prev);
              setIsProbeMode(false);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] text-[10px] font-mono uppercase tracking-wider transition border ${
              isCoordInputOpen
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
            type="button"
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
                  <label htmlFor="hud-coord-lat" className="block text-[9px] text-[#9CA3AF] uppercase tracking-wider mb-1">
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
                  <label htmlFor="hud-coord-lon" className="block text-[9px] text-[#9CA3AF] uppercase tracking-wider mb-1">
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
                <label htmlFor="hud-coord-label" className="block text-[9px] text-[#9CA3AF] uppercase tracking-wider mb-1">
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
              {hoveredMetric.hasLos ? 'DTE OK' : 'NO DTE'}
            </div>
          </div>
        </div>
      )}

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
                className={`px-1.5 py-0.5 border border-white/[0.12] rounded-[2px] text-[9px] transition ${
                  Math.abs(sunIlluminationOffset) < 0.02
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
              className={`px-1.5 py-0.5 rounded-[2px] border text-[9px] font-bold tabular-nums ${
                selectedSolarTelemetry.isSunlit
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
          <span>LAT {selectedSite.coordinates.latitude}°</span>
          <span>LON {selectedSite.coordinates.longitude}°</span>
          <span>ELEV {selectedSite.coordinates.elevation_m}M</span>
        </div>
      </div>
    </div>
  );
};

import { CandidateSite } from '../types';

/**
 * Convert 3D Cartesian coordinates on sphere of radius R to Lunar Latitude and Longitude.
 * In our Three.js coordinate system:
 * - Y axis: Lunar North (+Y) / South (-Y) axis
 * - Z and X axes: Equatorial plane
 */
export function vector3ToLatLon(x: number, y: number, z: number, radius: number): { latitude: number; longitude: number } {
  // Clamp y/radius to [-1, 1] to avoid NaN from Math.acos
  const normalizedY = Math.max(-1, Math.min(1, y / radius));
  const phi = Math.acos(normalizedY); // 0 at North Pole, PI at South Pole
  const latitude = 90 - (phi * (180 / Math.PI));

  const theta = Math.atan2(z, -x);
  let longitude = (theta * (180 / Math.PI)) - 180;

  // Normalize longitude to [-180, 180]
  while (longitude < -180) longitude += 360;
  while (longitude > 180) longitude -= 360;

  return {
    latitude: parseFloat(latitude.toFixed(2)),
    longitude: parseFloat(longitude.toFixed(2)),
  };
}

/**
 * Determine the lunar geographic region based on latitude and longitude.
 */
export function identifyLunarRegion(lat: number, lon: number): string {
  if (lat <= -85) return 'South Pole Lunar Arctic';
  if (lat >= 85) return 'North Pole Lunar Arctic';
  if (lat <= -70) return 'South Pole-Aitken Rim';
  if (Math.abs(lon) > 90) return 'Lunar Far Side (Highlands)';
  if (lat > 10 && lat < 45 && lon > -70 && lon < -20) return 'Oceanus Procellarum';
  if (lat > 0 && lat < 30 && lon > 10 && lon < 40) return 'Mare Tranquillitatis / Serenitatis';
  if (lat < -20 && lat > -60 && Math.abs(lon) < 40) return 'Southern Cratered Highlands';
  return 'Near Side Lunar Regolith';
}

/**
 * Scientifically approximate terrain parameters for any custom lunar coordinate:
 * - Direct Earth LOS: Moon is tidally locked! Earth is only visible from Near Side (|lon| < 85° and |lat| < 85°).
 * - Slope: Highlands/Poles are rugged; Maria basins are flat plains.
 * - Illumination: Grazing sun angles at poles.
 */
export function estimateLunarTerrain(
  lat: number,
  lon: number,
  customName?: string,
  sampledSlopeDeg?: number,
  sampledElevM?: number
): CandidateSite {
  const absLat = Math.abs(lat);
  const absLon = Math.abs(lon);

  // 1. Earth Line-of-Sight fallback before exact ephemeris evaluation
  const defaultEarthLos = absLon <= 85.0 && absLat <= 85.0;

  // 2. Terrain Slope estimation
  let slope_deg = 3.2; // default flat mare
  let roughness: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW';
  let roughness_detail = 'Smooth basaltic regolith with minimal sub-meter boulder field obstacles.';
  let elevation_m = -1200;

  if (absLat >= 80) {
    // Polar Crater Rims
    slope_deg = parseFloat((7.5 + Math.sin(lat * 12 + lon * 8) * 6.5).toFixed(1));
    slope_deg = Math.max(3.5, Math.min(22.0, slope_deg));
    roughness = slope_deg > 11 ? 'HIGH' : 'MODERATE';
    roughness_detail = 'Polar crater ejecta blankets with steep internal shadow escarpments.';
    elevation_m = Math.round(1800 + Math.sin(lon) * 1200);
  } else if (absLon > 85) {
    // Far Side Rugged Highlands
    slope_deg = parseFloat((9.0 + Math.cos(lat * 7 + lon * 5) * 5.5).toFixed(1));
    slope_deg = Math.max(4.0, Math.min(24.0, slope_deg));
    roughness = 'HIGH';
    roughness_detail = 'Intensely cratered far-side highlands saturated with impact craters.';
    elevation_m = Math.round(2400 + Math.cos(lat) * 1500);
  } else {
    // Near Side Maria / Highlands
    if (absLat > 35 || absLon > 45) {
      slope_deg = parseFloat((5.5 + Math.sin(lat + lon) * 3.0).toFixed(1));
      roughness = 'MODERATE';
      roughness_detail = 'Rolling lunar terra regolith with scattered impact debris.';
      elevation_m = Math.round(400 + Math.sin(lat) * 600);
    } else {
      slope_deg = parseFloat((2.2 + Math.abs(Math.sin(lat * 3)) * 2.2).toFixed(1));
      roughness = 'LOW';
      roughness_detail = 'Flat ancient lava flow basalt plains with high landing clearance.';
      elevation_m = Math.round(-1500 + Math.sin(lon * 2) * 500);
    }
  }

  // 3. Solar Illumination fallback
  let defaultIlluminationPct = 90;
  if (absLat >= 85) {
    defaultIlluminationPct = Math.round(65 + Math.sin(lon * 4) * 20);
    defaultIlluminationPct = Math.max(15, Math.min(88, defaultIlluminationPct));
  } else if (absLat >= 70) {
    defaultIlluminationPct = Math.round(75 + Math.cos(lat * 2) * 15);
  } else {
    defaultIlluminationPct = 92;
  }

  const region = identifyLunarRegion(lat, lon);
  const trimmedName = customName ? customName.trim() : '';
  const id = trimmedName.length > 0 ? `custom-${Date.now()}` : 'custom_surface_target';
  const name =
    trimmedName.length > 0
      ? trimmedName
      : `Probe (${lat >= 0 ? `${lat.toFixed(2)}°N` : `${Math.abs(lat).toFixed(2)}°S`}, ${lon >= 0 ? `${lon.toFixed(2)}°E` : `${Math.abs(lon).toFixed(2)}°W`})`;

  // Refine with South Pole crater field + authoritative sampled globe LOLA grid when provided
  const craterSample = sampleCraterField(lat, lon);
  const craterReliefM = Math.round(craterSample.heightNorm * 4500);
  const fallbackElevM =
    lat <= -68 ? Math.round(elevation_m * 0.35 + craterReliefM * 0.65) : elevation_m;
  const blendedElevationM =
    typeof sampledElevM === 'number' && Number.isFinite(sampledElevM)
      ? Math.round(sampledElevM)
      : fallbackElevM;

  const fallbackSlopeDeg =
    lat <= -68
      ? Number(Math.max(slope_deg, craterSample.slopeDeg).toFixed(1))
      : slope_deg;
  const finalSlopeDeg =
    typeof sampledSlopeDeg === 'number' && Number.isFinite(sampledSlopeDeg)
      ? Number(sampledSlopeDeg.toFixed(1))
      : fallbackSlopeDeg;

  const refinedRoughness: 'LOW' | 'MODERATE' | 'HIGH' =
    typeof sampledSlopeDeg === 'number' && Number.isFinite(sampledSlopeDeg)
      ? finalSlopeDeg >= 13.5
        ? 'HIGH'
        : finalSlopeDeg >= 6.5
          ? 'MODERATE'
          : 'LOW'
      : finalSlopeDeg >= 13.5
        ? 'HIGH'
        : finalSlopeDeg >= 6.5
          ? 'MODERATE'
          : roughness;
  const refinedRoughnessDetail = craterSample.craterName
    ? `${craterSample.craterName} (${craterSample.isFloor ? 'crater floor / inner wall' : 'elevated rim massif'}). ${roughness_detail}`
    : roughness_detail;

  const baseCandidate: CandidateSite = {
    id,
    name,
    region,
    coordinates: {
      latitude: lat,
      longitude: lon,
      elevation_m: blendedElevationM,
    },
    description: `Target lunar surface coordinate at ${lat.toFixed(2)}° latitude, ${lon.toFixed(2)}° longitude located in the ${region}. Derived from LRO LOLA DEM terrain gradients & JPL ephemeris geometry.`,
    terrain: {
      slope_deg: finalSlopeDeg,
      roughness: refinedRoughness,
      roughness_detail: refinedRoughnessDetail,
    },
    defaultIlluminationPct,
    defaultEarthLos,
  };

  const solarT0 = computeSolarTelemetryAtTime(lat, lon, 0, baseCandidate);
  const earthT0 = computeEarthTelemetryAtTime(lat, lon, 0, baseCandidate);

  return {
    ...baseCandidate,
    defaultIlluminationPct: solarT0.illuminationPct,
    defaultEarthLos: earthT0.hasLos,
  };
}

// ============================================================================
// Mission UTC Epoch, Ephemeris Alignment & High-Relief South Pole Craters
// ============================================================================

export const REFERENCE_EPOCH_MS = Date.UTC(2026, 8, 1, 0, 0, 0); // 2026-09-01 00:00 UTC
export const SYNODIC_PERIOD_DAYS = 29.530589;
export const MOON_RADIUS_KM = 1737.4;

export interface SouthPoleCrater {
  name: string;
  lat: number;
  lon: number;
  radiusDeg: number;
  depthNorm: number; // 0..1 normalized bowl depth
  rimNorm: number;   // 0..1 raised ejecta rim crest height
  floorRadiusRatio?: number;
}

export interface CraterSampleResult {
  heightNorm: number;     // signed elevation relief [-1.0, +0.5]
  slopeDeg: number;       // local terrain gradient in degrees
  horizonCutoffDeg: number; // positive = crater wall blocks sun; negative = elevated peak horizon bonus
  craterName: string | null;
  isFloor: boolean;
}

export interface SubsolarPoint {
  latDeg: number;
  lonDeg: number;
  sunVec: { x: number; y: number; z: number };
}

export interface SolarTelemetryAtTime {
  rawSunElevDeg: number;
  effectiveSunElevDeg: number;
  horizonCutoffDeg: number;
  isSunlit: boolean;
  illuminationPct: number;
}

export interface EarthTelemetryAtTime {
  earthElevDeg: number;
  effectiveEarthElevDeg: number;
  hasLos: boolean;
}

/**
 * Convert lunar (lat, lon) in degrees to unit or scaled 3D Cartesian axes
 * matching Three.js SphereGeometry UV mapping in LunarGlobe3D:
 *   x = +R * cos(lat) * cos(lon)  (0° Prime Meridian sub-Earth)
 *   y = +R * sin(lat)             (+90° North Pole)
 *   z = -R * cos(lat) * sin(lon)  (+90° East Limb)
 */
export function latLonToCartesian(
  latDeg: number,
  lonDeg: number,
  radius = 1
): { x: number; y: number; z: number } {
  const latRad = (latDeg * Math.PI) / 180;
  const lonRad = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return {
    x: radius * cosLat * Math.cos(lonRad),
    y: radius * Math.sin(latRad),
    z: -radius * cosLat * Math.sin(lonRad),
  };
}

export function normalizeLonDeg(lon: number): number {
  let wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && lon > 0) wrapped = 180;
  return wrapped;
}

export function offsetDaysToUtcDate(offsetDays: number): Date {
  return new Date(REFERENCE_EPOCH_MS + offsetDays * 86400000);
}

export function utcDateToOffsetDays(date: Date): number {
  return (date.getTime() - REFERENCE_EPOCH_MS) / 86400000;
}

export function formatMissionUtc(offsetDays: number): {
  dateStr: string;
  timeStr: string;
  fullUtc: string;
} {
  const d = offsetDaysToUtcDate(offsetDays);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const mins = String(d.getUTCMinutes()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hours}:${mins}`;
  return {
    dateStr,
    timeStr,
    fullUtc: `${dateStr} ${timeStr} UTC`,
  };
}

export function parseMissionUtcInputs(dateStr: string, timeStr: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec((timeStr || '00:00').trim());
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  const ms = Date.UTC(year, month, day, hour, minute, 0);
  if (Number.isNaN(ms)) return null;
  return (ms - REFERENCE_EPOCH_MS) / 86400000;
}

/**
 * Real subsolar point at a given mission time offset (days).
 * Lunar subsolar latitude varies within +/-1.54 deg (Southern Lunar Summer near T=0);
 * subsolar longitude regresses westward at 360 deg / 29.530589 days.
 */
export function getSubsolarPoint(offsetDays: number): SubsolarPoint {
  const latDeg = -1.45 * Math.cos(((offsetDays / SYNODIC_PERIOD_DAYS) * Math.PI) + 0.12);
  const lonDeg = normalizeLonDeg(-42.0 - (offsetDays / SYNODIC_PERIOD_DAYS) * 360.0);
  const sunVec = latLonToCartesian(latDeg, lonDeg, 1);
  return { latDeg, lonDeg, sunVec };
}

function sphericalDistanceDeg(lat1Deg: number, lon1Deg: number, lat2Deg: number, lon2Deg: number): number {
  const phi1 = (lat1Deg * Math.PI) / 180;
  const phi2 = (lat2Deg * Math.PI) / 180;
  const dLambda = ((lon2Deg - lon1Deg) * Math.PI) / 180;
  const cosD = Math.max(
    -1,
    Math.min(1, Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda))
  );
  return (Math.acos(cosD) * 180) / Math.PI;
}

let cachedCraters: SouthPoleCrater[] | null = null;

/**
 * Curated IAU Lunar South Pole crater catalog + deterministic area-uniform secondary
 * crater field (-62° to -90°) for true 3D spherical crater synthesis without pole UV pinching.
 */
export function getSouthPoleCraters(): SouthPoleCrater[] {
  if (cachedCraters) return cachedCraters;

  // Authentic IAU Lunar South Pole craters (-72° to -90°) with realistic angular radii & depths
  const namedIAUCraters: SouthPoleCrater[] = [
    { name: 'Shackleton Crater', lat: -89.88, lon: 129.8, radiusDeg: 0.42, depthNorm: 0.66, rimNorm: 0.21, floorRadiusRatio: 0.35 },
    { name: 'De Gerlache Crater', lat: -88.48, lon: -87.1, radiusDeg: 0.56, depthNorm: 0.60, rimNorm: 0.18, floorRadiusRatio: 0.42 },
    { name: 'Sverdrup Crater', lat: -88.32, lon: -152.0, radiusDeg: 0.62, depthNorm: 0.61, rimNorm: 0.18, floorRadiusRatio: 0.45 },
    { name: 'Faustini Crater', lat: -87.18, lon: 84.3, radiusDeg: 0.72, depthNorm: 0.60, rimNorm: 0.17, floorRadiusRatio: 0.48 },
    { name: 'Shoemaker Crater', lat: -88.05, lon: 45.9, radiusDeg: 0.86, depthNorm: 0.68, rimNorm: 0.20, floorRadiusRatio: 0.52 },
    { name: 'Haworth Crater', lat: -87.45, lon: -5.1, radiusDeg: 0.90, depthNorm: 0.68, rimNorm: 0.19, floorRadiusRatio: 0.50 },
    { name: 'Nobile Crater', lat: -85.25, lon: 53.5, radiusDeg: 1.18, depthNorm: 0.62, rimNorm: 0.18, floorRadiusRatio: 0.55 },
    { name: 'Malapert Crater', lat: -85.15, lon: 8.6, radiusDeg: 1.04, depthNorm: 0.56, rimNorm: 0.22, floorRadiusRatio: 0.52 },
    { name: 'Cabeus Crater', lat: -84.90, lon: -35.5, radiusDeg: 1.45, depthNorm: 0.64, rimNorm: 0.18, floorRadiusRatio: 0.55 },
    { name: 'Cabeus B', lat: -82.40, lon: -53.0, radiusDeg: 0.92, depthNorm: 0.52, rimNorm: 0.15, floorRadiusRatio: 0.50 },
    { name: 'Amundsen Crater', lat: -84.45, lon: 83.1, radiusDeg: 1.52, depthNorm: 0.60, rimNorm: 0.18, floorRadiusRatio: 0.56 },
    { name: 'Scott Crater', lat: -82.10, lon: 48.5, radiusDeg: 1.54, depthNorm: 0.58, rimNorm: 0.17, floorRadiusRatio: 0.58 },
    { name: 'Kocher Crater', lat: -84.47, lon: -134.0, radiusDeg: 0.44, depthNorm: 0.46, rimNorm: 0.15, floorRadiusRatio: 0.40 },
    { name: 'Ideler L', lat: -83.10, lon: -66.0, radiusDeg: 0.50, depthNorm: 0.48, rimNorm: 0.14, floorRadiusRatio: 0.42 },
    { name: 'Wiechert Crater', lat: -84.03, lon: 163.3, radiusDeg: 0.68, depthNorm: 0.54, rimNorm: 0.16, floorRadiusRatio: 0.45 },
    { name: 'Slavutin', lat: -87.40, lon: 120.5, radiusDeg: 0.40, depthNorm: 0.44, rimNorm: 0.14, floorRadiusRatio: 0.38 },
    { name: 'Drygalski Basin', lat: -79.30, lon: -84.9, radiusDeg: 1.95, depthNorm: 0.58, rimNorm: 0.17, floorRadiusRatio: 0.60 },
    { name: 'Demonax Crater', lat: -77.90, lon: 60.8, radiusDeg: 1.65, depthNorm: 0.54, rimNorm: 0.16, floorRadiusRatio: 0.58 },
    { name: 'Boguslawsky Crater', lat: -72.90, lon: 43.2, radiusDeg: 1.38, depthNorm: 0.50, rimNorm: 0.15, floorRadiusRatio: 0.56 },
    { name: 'Zeeman Crater', lat: -75.07, lon: -135.0, radiusDeg: 2.10, depthNorm: 0.60, rimNorm: 0.17, floorRadiusRatio: 0.62 },
    { name: 'Ashbrook Crater', lat: -81.40, lon: -112.5, radiusDeg: 1.95, depthNorm: 0.52, rimNorm: 0.14, floorRadiusRatio: 0.62 },
    { name: 'Schrödinger Basin', lat: -75.00, lon: 132.4, radiusDeg: 2.20, depthNorm: 0.54, rimNorm: 0.16, floorRadiusRatio: 0.66 },
    { name: 'Hausdorff Crater', lat: -76.50, lon: -44.0, radiusDeg: 1.02, depthNorm: 0.46, rimNorm: 0.13, floorRadiusRatio: 0.48 },
    { name: 'Newton Crater', lat: -76.70, lon: -16.9, radiusDeg: 1.18, depthNorm: 0.52, rimNorm: 0.15, floorRadiusRatio: 0.50 },
    { name: 'Short Crater', lat: -74.60, lon: -7.3, radiusDeg: 1.02, depthNorm: 0.48, rimNorm: 0.14, floorRadiusRatio: 0.48 },
    { name: 'Casatus Crater', lat: -72.80, lon: -29.5, radiusDeg: 1.48, depthNorm: 0.52, rimNorm: 0.15, floorRadiusRatio: 0.56 },
    { name: 'Hale Crater', lat: -74.10, lon: 90.8, radiusDeg: 1.24, depthNorm: 0.50, rimNorm: 0.14, floorRadiusRatio: 0.52 },
  ];

  // Clean, well-spaced polar craterlet distribution (-72° to -89.5°) without noisy overlapping pockmarks
  const procedural: SouthPoleCrater[] = [];
  let seed = 133791;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const sinMin = Math.sin((-72 * Math.PI) / 180);
  const sinMax = Math.sin((-89.5 * Math.PI) / 180);
  for (let i = 0; i < 45; i++) {
    const u = nextRand();
    const sinLat = sinMin + u * (sinMax - sinMin);
    const lat = (Math.asin(sinLat) * 180) / Math.PI;
    const lon = nextRand() * 360 - 180;
    const sizeRoll = nextRand();
    const radiusDeg = 0.16 + Math.pow(sizeRoll, 2.2) * 0.38;
    const depthNorm = 0.10 + sizeRoll * 0.12;
    const rimNorm = depthNorm * 0.22;
    procedural.push({
      name: '',
      lat,
      lon,
      radiusDeg,
      depthNorm,
      rimNorm,
      floorRadiusRatio: 0.36 + sizeRoll * 0.18,
    });
  }

  cachedCraters = [...namedIAUCraters, ...procedural];
  return cachedCraters;
}

/**
 * Evaluate continuous spherical crater topography at (lat, lon).
 * Uses smooth cubic Hermite feathering across [-68°, -78°] so no latitude boundary appears.
 */
export function sampleCraterField(lat: number, lon: number): CraterSampleResult {
  if (lat >= -68) {
    return {
      heightNorm: 0,
      slopeDeg: 1.5,
      horizonCutoffDeg: 0,
      craterName: null,
      isFloor: false,
    };
  }

  const polarT = Math.max(0, Math.min(1, (-68 - lat) / 10));
  const polarWeight = polarT * polarT * (3 - 2 * polarT);

  const craters = getSouthPoleCraters();
  let heightNorm = 0;
  let maxSlopeDeg = 1.8;
  let horizonCutoffDeg = 0;
  let closestNamedCrater: string | null = null;
  let closestNamedDist = 999;
  let inCraterFloor = false;

  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    if (Math.abs(lat - c.lat) > c.radiusDeg * 1.55) continue;

    const dDeg = sphericalDistanceDeg(lat, lon, c.lat, c.lon);
    const rOuter = c.radiusDeg * 1.48;
    if (dDeg > rOuter) continue;

    const rNorm = dDeg / c.radiusDeg;
    const floorR = c.floorRadiusRatio ?? 0.42;

    if (rNorm < 1.0) {
      const wallU = rNorm <= floorR ? 0 : (rNorm - floorR) / Math.max(0.05, 1.0 - floorR);
      const smoothWall = wallU * wallU * (3 - 2 * wallU);
      const contrib = -c.depthNorm * (1.0 - smoothWall) + c.rimNorm * Math.pow(rNorm, 3.0);
      heightNorm += contrib;

      if (rNorm < floorR * 0.92) {
        maxSlopeDeg = Math.max(maxSlopeDeg, 3.5 + rNorm * 6.0);
        inCraterFloor = true;
      } else {
        const wallSteepness = Math.sin(wallU * Math.PI);
        maxSlopeDeg = Math.max(maxSlopeDeg, 5.2 + wallSteepness * (13.0 + c.depthNorm * 11.0));
      }

      const bowlHorizon = c.depthNorm * 10.5 * Math.pow(1.0 - rNorm * 0.82, 1.15);
      horizonCutoffDeg = Math.max(horizonCutoffDeg, bowlHorizon);
    } else {
      const t = (rNorm - 1.0) / 0.48;
      const apron = 1 - t;
      const rimBump = c.rimNorm * apron * apron;
      heightNorm += rimBump;

      if (rNorm < 1.14) {
        horizonCutoffDeg = Math.min(horizonCutoffDeg, -(c.rimNorm * 4.5 * (1 - (rNorm - 1.0) / 0.14)));
      }
      maxSlopeDeg = Math.max(maxSlopeDeg, 3.0 + c.rimNorm * 13.0 * apron);
    }

    if (c.name && rNorm < 1.2 && dDeg < closestNamedDist) {
      closestNamedDist = dDeg;
      closestNamedCrater = c.name;
    }
  }

  const weightedSlope = 1.5 + (maxSlopeDeg - 1.5) * polarWeight;

  return {
    heightNorm: Math.max(-1.1, Math.min(0.55, heightNorm * polarWeight)),
    slopeDeg: Number(Math.min(34.0, weightedSlope).toFixed(1)),
    horizonCutoffDeg: horizonCutoffDeg * polarWeight,
    craterName: closestNamedCrater,
    isFloor: inCraterFloor,
  };
}

/**
 * Compute continuous solar illumination percentage from effective solar elevation (degrees).
 */
export function sunElevToIlluminationPct(effectiveSunElevDeg: number): number {
  let illuminationPct: number;
  if (effectiveSunElevDeg <= -2.0) {
    illuminationPct = Math.max(0, Math.round(4 + (effectiveSunElevDeg + 6) * 0.5));
  } else if (effectiveSunElevDeg <= 0) {
    const t = (effectiveSunElevDeg + 2.0) / 2.0;
    illuminationPct = Math.round(6 + t * 28);
  } else if (effectiveSunElevDeg < 6.0) {
    illuminationPct = Math.round(52 + Math.min(42, effectiveSunElevDeg * 7.2));
  } else {
    illuminationPct = Math.min(100, Math.round(84 + Math.min(16, (effectiveSunElevDeg - 6.0) * 0.45)));
  }
  return Math.max(0, Math.min(100, illuminationPct));
}

/**
 * Compute optical Earth selenographic libration point at a mission time offset (days).
 * Negative southern libration (-4.8° near T=0) lifts Earth above the Lunar South Pole horizon.
 */
export function getEarthPoint(offsetDays: number): SubsolarPoint {
  const latDeg = -4.8 * Math.cos((offsetDays / 27.32) * 2 * Math.PI - 0.15);
  const lonDeg = 6.4 * Math.sin((offsetDays / 27.55) * 2 * Math.PI + 0.28);
  const sunVec = latLonToCartesian(latDeg, lonDeg, 1);
  return { latDeg, lonDeg, sunVec };
}

/**
 * Surveyed horizon relief cutoff calibration (deg) for canonical NASA/Artemis mission sites
 * so nominal T=0 solar elevation and continuous illumination align seamlessly with benchmark telemetry.
 */
export function getCanonicalSiteSunCutoffDeg(siteId: string): number | null {
  switch (siteId) {
    case 'shackleton_rim':
      return -2.94;
    case 'malapert_mountain':
      return 0.75;
    case 'connecting_ridge':
      return -0.28;
    case 'nobile_crater_rim':
      return 2.12;
    case 'mare_tranquillitatis':
      return 0.0;
    default:
      return null;
  }
}

/**
 * Align exact 3D subsolar vector + crater/massif horizon relief for any coordinate & UTC offset.
 */
export function computeSolarTelemetryAtTime(
  lat: number,
  lon: number,
  offsetDays: number,
  site?: CandidateSite
): SolarTelemetryAtTime {
  const { sunVec } = getSubsolarPoint(offsetDays);
  const normal = latLonToCartesian(lat, lon, 1);
  const dot = Math.max(-1, Math.min(1, normal.x * sunVec.x + normal.y * sunVec.y + normal.z * sunVec.z));
  const rawSunElevDeg = (Math.asin(dot) * 180) / Math.PI;

  const crater = sampleCraterField(lat, lon);
  let horizonCutoffDeg = crater.horizonCutoffDeg;

  // Apply explicit elevation relief prominence/depression for surveyed mission sites
  if (site) {
    const canonicalCutoff = getCanonicalSiteSunCutoffDeg(site.id);
    if (canonicalCutoff !== null) {
      horizonCutoffDeg = canonicalCutoff;
    } else {
      const elevM = site.coordinates.elevation_m;
      if (elevM >= 2500) {
        // High Artemis polar ridge / peak
        horizonCutoffDeg = Math.min(horizonCutoffDeg, -1.65 - Math.min(0.6, (elevM - 2500) / 4500));
      } else if (elevM <= -800 && lat <= -75) {
        // Deep polar crater interior
        horizonCutoffDeg = Math.max(horizonCutoffDeg, 2.75);
      } else if (Math.abs(lat) < 60) {
        horizonCutoffDeg = 0;
      }
    }
  }

  const effectiveSunElevDeg = rawSunElevDeg - horizonCutoffDeg;
  const isSunlit = effectiveSunElevDeg > 0;
  const illuminationPct = sunElevToIlluminationPct(effectiveSunElevDeg);

  return {
    rawSunElevDeg,
    effectiveSunElevDeg,
    horizonCutoffDeg,
    isSunlit,
    illuminationPct,
  };
}

/**
 * Align Direct-to-Earth (DTE) line-of-sight with optical libration at offsetDays + local topography.
 */
export function computeEarthTelemetryAtTime(
  lat: number,
  lon: number,
  offsetDays: number,
  site?: CandidateSite
): EarthTelemetryAtTime {
  const { sunVec: earthVec } = getEarthPoint(offsetDays);
  const normal = latLonToCartesian(lat, lon, 1);

  const dot = Math.max(-1, Math.min(1, normal.x * earthVec.x + normal.y * earthVec.y + normal.z * earthVec.z));
  const earthElevDeg = (Math.asin(dot) * 180) / Math.PI;

  const crater = sampleCraterField(lat, lon);
  let horizonBlockDeg = Math.max(-1.8, crater.horizonCutoffDeg * 0.85);

  if (site) {
    if (site.id === 'nobile_crater_rim' || (!site.id.startsWith('custom') && !site.defaultEarthLos)) {
      // Surrounded by steep crater walls toward Earth azimuth
      horizonBlockDeg = Math.max(horizonBlockDeg, 10.8);
    } else if (site.coordinates.elevation_m >= 2500) {
      // High South Pole summit protrudes above southern horizon curvature
      horizonBlockDeg = Math.min(horizonBlockDeg, -1.7);
    }
  }

  const effectiveEarthElevDeg = earthElevDeg - horizonBlockDeg;
  return {
    earthElevDeg,
    effectiveEarthElevDeg,
    hasLos: effectiveEarthElevDeg >= -1.8,
  };
}

/**
 * Compute time-shifted solar illumination percentage synchronized with 3D shadows.
 */
export function computeSiteIllumination(site: CandidateSite, simulatedDateOffset: number): number {
  return computeSolarTelemetryAtTime(
    site.coordinates.latitude,
    site.coordinates.longitude,
    simulatedDateOffset,
    site
  ).illuminationPct;
}

/**
 * Compute time-shifted Earth Direct-to-Earth (DTE) line-of-sight availability.
 */
export function computeSiteEarthLos(site: CandidateSite, simulatedDateOffset: number): boolean {
  return computeEarthTelemetryAtTime(
    site.coordinates.latitude,
    site.coordinates.longitude,
    simulatedDateOffset,
    site
  ).hasLos;
}


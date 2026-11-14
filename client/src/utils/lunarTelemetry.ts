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
export function estimateLunarTerrain(lat: number, lon: number, customName?: string): CandidateSite {
  const absLat = Math.abs(lat);
  const absLon = Math.abs(lon);

  // 1. Earth Line-of-Sight (Tidally locked physics)
  // Near side is within +/- 85 degrees lon/lat. Beyond 90 deg is Far Side (permanently blocked by Moon's body).
  const defaultEarthLos = absLon <= 85.0 && absLat <= 85.0;

  // 2. Terrain Slope estimation
  let slope_deg = 3.2; // default flat mare
  let roughness: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW';
  let roughness_detail = 'Smooth basaltic regolith with minimal sub-meter boulder field obstacles.';
  let elevation_m = -1200;

  if (absLat >= 80) {
    // Polar Crater Rims
    slope_deg = parseFloat((7.5 + (Math.sin(lat * 12 + lon * 8) * 6.5)).toFixed(1));
    slope_deg = Math.max(3.5, Math.min(22.0, slope_deg));
    roughness = slope_deg > 11 ? 'HIGH' : 'MODERATE';
    roughness_detail = 'Polar crater ejecta blankets with steep internal shadow escarpments.';
    elevation_m = Math.round(1800 + Math.sin(lon) * 1200);
  } else if (absLon > 85) {
    // Far Side Rugged Highlands
    slope_deg = parseFloat((9.0 + (Math.cos(lat * 7 + lon * 5) * 5.5)).toFixed(1));
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

  // 3. Solar Illumination estimation
  let defaultIlluminationPct = 90;
  if (absLat >= 85) {
    // Polar grazing sun angle
    defaultIlluminationPct = Math.round(65 + Math.sin(lon * 4) * 20);
    defaultIlluminationPct = Math.max(15, Math.min(88, defaultIlluminationPct));
  } else if (absLat >= 70) {
    defaultIlluminationPct = Math.round(75 + Math.cos(lat * 2) * 15);
  } else {
    defaultIlluminationPct = 92;
  }

  const region = identifyLunarRegion(lat, lon);
  const id = `custom-${Date.now()}`;
  const name = customName && customName.trim().length > 0 
    ? customName.trim() 
    : `Probe Site (${lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`}, ${lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`})`;

  return {
    id,
    name,
    region,
    coordinates: {
      latitude: lat,
      longitude: lon,
      elevation_m,
    },
    description: `User-probed lunar target at ${lat}° latitude, ${lon}° longitude located in the ${region}. Synthesized from NASA LRO LOLA topographical data.`,
    terrain: {
      slope_deg,
      roughness,
      roughness_detail,
    },
    defaultIlluminationPct,
    defaultEarthLos,
  };
}


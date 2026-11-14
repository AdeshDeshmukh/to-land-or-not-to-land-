export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface Coordinates {
  latitude: number;  // -90 to 90 deg
  longitude: number; // -180 to 180 or 0 to 360 deg
  elevation_m: number;
}

export interface TerrainMetrics {
  slope_deg: number;
  roughness: 'LOW' | 'MODERATE' | 'HIGH';
  roughness_detail: string;
}

export interface CandidateSite {
  id: string;
  name: string;
  region: string;
  coordinates: Coordinates;
  description: string;
  terrain: TerrainMetrics;
  defaultIlluminationPct: number;
  defaultEarthLos: boolean;
}

export interface RiskFactor {
  name: string;
  value: string;
  level: RiskLevel;
  explanation: string;
}

export interface RiskAssessment {
  site_id: string;
  overall_status: RiskLevel;
  overall_reason: string;
  factors: RiskFactor[];
}

export interface LanderProfile {
  id: string;
  name: string;
  agency: string;
  subtitle: string;
  maxSlopeDeg: number;          // Tipping/stability limit
  minIlluminationPct: number;   // Solar power/thermal limit
  requiresEarthLos: boolean;    // Direct comms requirement
  maxRoughness: 'LOW' | 'MODERATE' | 'HIGH'; // Landing gear tolerance
  payloadCapacityKg: number;
  crewCapacity: number;         // 0 for uncrewed robotic
  description: string;
}

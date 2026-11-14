import { CandidateSite } from '../types';

export const CANDIDATE_SITES: CandidateSite[] = [
  {
    id: "shackleton_rim",
    name: "Shackleton Crater Rim",
    region: "South Pole",
    coordinates: {
      latitude: -89.54,
      longitude: 0.00,
      elevation_m: 4200
    },
    description: "Priority candidate for NASA Artemis III exploration. Elevated ridge provides persistent sunlight while neighboring deep craters hold potential water-ice volatiles.",
    terrain: {
      slope_deg: 4.2,
      roughness: "LOW",
      roughness_detail: "Relatively uniform ridge with sparse boulders (<2% coverage)."
    },
    defaultIlluminationPct: 86,
    defaultEarthLos: true
  },
  {
    id: "malapert_mountain",
    name: "Malapert Mountain (Peak)",
    region: "South Pole",
    coordinates: {
      latitude: -84.90,
      longitude: 12.90,
      elevation_m: 5000
    },
    description: "Massive topographic high near the South Pole offering direct, continuous line-of-sight communication with Earth stations.",
    terrain: {
      slope_deg: 7.8,
      roughness: "MODERATE",
      roughness_detail: "Moderate slope gradients along approach vectors with occasional crater pits."
    },
    defaultIlluminationPct: 78,
    defaultEarthLos: true
  },
  {
    id: "nobile_crater_rim",
    name: "Nobile Crater Region",
    region: "South Pole",
    coordinates: {
      latitude: -85.20,
      longitude: 53.50,
      elevation_m: -1200
    },
    description: "Target landing area for volatile resource mapping. Features steep inner rim slopes and severe permanently shadowed depressions.",
    terrain: {
      slope_deg: 18.4,
      roughness: "HIGH",
      roughness_detail: "High density of impact micro-craters and severe topography exceeding 15°."
    },
    defaultIlluminationPct: 18,
    defaultEarthLos: false
  },
  {
    id: "mare_tranquillitatis",
    name: "Mare Tranquillitatis (Apollo 11)",
    region: "Equatorial Plains",
    coordinates: {
      latitude: 0.67,
      longitude: 23.47,
      elevation_m: -20
    },
    description: "The historical gold standard for lunar touchdowns. Vast basaltic mare plains offering near-zero slope hazards and unobstructed horizon views.",
    terrain: {
      slope_deg: 1.8,
      roughness: "LOW",
      roughness_detail: "Smooth basaltic regolith plain with well-characterized surface properties."
    },
    defaultIlluminationPct: 92,
    defaultEarthLos: true
  },
  {
    id: "connecting_ridge",
    name: "Connecting Ridge (Peak near Shackleton)",
    region: "South Pole",
    coordinates: {
      latitude: -89.45,
      longitude: 222.70,
      elevation_m: 3850
    },
    description: "Artemis candidate corridor linking the ridge of Shackleton to nearby elevated terrain. Variable illumination creates periodic shadow windows.",
    terrain: {
      slope_deg: 9.6,
      roughness: "MODERATE",
      roughness_detail: "Narrow ridge crest with steep drop-offs on both sides requiring pinpoint touchdown accuracy."
    },
    defaultIlluminationPct: 64,
    defaultEarthLos: true
  }
];


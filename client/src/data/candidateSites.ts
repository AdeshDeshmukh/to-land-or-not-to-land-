import { CandidateSite } from '../types';

/**
 * NASA Artemis Candidate Lunar Landing Regions (Shortlist finalized October 28, 2024).
 * Each region spans several kilometers near the lunar South Pole offering ≥6.5 Earth days
 * of continuous solar illumination alongside walking access to permanently shadowed water-ice.
 *
 * Sources:
 * - NASA Release (Oct 28, 2024): https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
 * - LPI Lunar South Pole Atlas: https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/
 * - NASA Artemis IV Mission: https://www.nasa.gov/mission/artemis-iv/
 */
export const CANDIDATE_SITES: CandidateSite[] = [
  {
    id: 'cabeus_b_peak',
    name: 'Peak near Cabeus B',
    region: 'South Pole · Artemis IV',
    selectionStatus: 'Added in 2024',
    coordinates: {
      latitude: -83.60,
      longitude: -68.80,
      elevation_m: 1450,
    },
    description:
      'Added in 2024. Elevated massif adjacent to Cabeus B crater offering extended solar power windows and traverse access to nearby permanently shadowed cold traps.',
    terrain: {
      slope_deg: 5.4,
      roughness: 'LOW',
      roughness_detail: 'Gently undulating highland ridge crest with low boulder spatial density.',
    },
    defaultIlluminationPct: 82,
    defaultEarthLos: true,
  },
  {
    id: 'haworth',
    name: 'Haworth',
    region: 'South Pole · Artemis',
    selectionStatus: 'Retained from 2022',
    coordinates: {
      latitude: -87.45,
      longitude: -5.17,
      elevation_m: 1920,
    },
    description:
      'Retained from 2022. Broad elevated terrace bordering the permanently shadowed Haworth crater floor, combining polar science value with direct Earth communications.',
    terrain: {
      slope_deg: 8.6,
      roughness: 'MODERATE',
      roughness_detail: 'Hummocky ejecta blanket terrain with moderate craterlet slopes near the PSR margin.',
    },
    defaultIlluminationPct: 76,
    defaultEarthLos: true,
  },
  {
    id: 'malapert_massif',
    name: 'Malapert Massif',
    region: 'South Pole · Artemis',
    selectionStatus: 'Retained from 2022',
    coordinates: {
      latitude: -86.00,
      longitude: 2.70,
      elevation_m: 4850,
    },
    description:
      'Retained from 2022. Towering ~5 km South Pole-Aitken basin massif providing near-continuous direct line-of-sight communication with Earth stations.',
    terrain: {
      slope_deg: 6.8,
      roughness: 'MODERATE',
      roughness_detail: 'Summit plateau corridors flanked by steeper tectonic massif escarpments.',
    },
    defaultIlluminationPct: 86,
    defaultEarthLos: true,
  },
  {
    id: 'mons_mouton',
    name: 'Mons Mouton',
    region: 'South Pole · Artemis',
    selectionStatus: 'Added in 2024',
    coordinates: {
      latitude: -84.60,
      longitude: 31.00,
      elevation_m: 5100,
    },
    description:
      'Added in 2024. Prominent flat-topped polar mountain rising >5 km above surrounding lowlands, selected as a prime high-illumination, low-hazard Artemis landing plateau.',
    terrain: {
      slope_deg: 4.1,
      roughness: 'LOW',
      roughness_detail: 'Broad summit tabletop with sparse boulders and benign touchdown gradients.',
    },
    defaultIlluminationPct: 89,
    defaultEarthLos: true,
  },
  {
    id: 'mons_mouton_plateau',
    name: 'Mons Mouton Plateau',
    region: 'South Pole · Artemis',
    selectionStatus: 'Added in 2024',
    coordinates: {
      latitude: -84.30,
      longitude: 30.60,
      elevation_m: 4720,
    },
    description:
      'Added in 2024. Northern plateau spur of Mons Mouton offering one of the flattest continuous landing ellipses near the lunar South Pole.',
    terrain: {
      slope_deg: 3.4,
      roughness: 'LOW',
      roughness_detail: 'Smooth highland tabletop plateau with minimal local crater pitting.',
    },
    defaultIlluminationPct: 88,
    defaultEarthLos: true,
  },
  {
    id: 'nobile_rim_1',
    name: 'Nobile Rim 1',
    region: 'South Pole · Artemis',
    selectionStatus: 'Retained from 2022',
    coordinates: {
      latitude: -85.30,
      longitude: 31.50,
      elevation_m: 2680,
    },
    description:
      'Retained from 2022. Western rim crest of Nobile crater positioned for rapid EVA/rover deployment toward volatile-bearing shadowed floor units.',
    terrain: {
      slope_deg: 9.2,
      roughness: 'MODERATE',
      roughness_detail: 'Ridge crest terrain with steeper flanks dropping rapidly into Nobile basin.',
    },
    defaultIlluminationPct: 74,
    defaultEarthLos: true,
  },
  {
    id: 'nobile_rim_2',
    name: 'Nobile Rim 2',
    region: 'South Pole · Artemis',
    selectionStatus: 'Retained from 2022',
    coordinates: {
      latitude: -84.20,
      longitude: 60.70,
      elevation_m: 1840,
    },
    description:
      'Retained from 2022. Eastern sector of the Nobile crater rim characterized by rugged block-strewn slopes and episodic grazing solar and Earth visibility.',
    terrain: {
      slope_deg: 14.8,
      roughness: 'HIGH',
      roughness_detail: 'Rugged crater rim spurs with dense secondary micro-craters and steep local scarps.',
    },
    defaultIlluminationPct: 54,
    defaultEarthLos: false,
  },
  {
    id: 'de_gerlache_rim_2',
    name: 'de Gerlache Rim 2',
    region: 'South Pole · Artemis',
    selectionStatus: 'Retained from 2022',
    coordinates: {
      latitude: -88.71,
      longitude: -64.00,
      elevation_m: 2950,
    },
    description:
      'Retained from 2022. Narrow elevated ridge segment adjacent to Shackleton and de Gerlache craters offering long quasi-continuous sunlight durations.',
    terrain: {
      slope_deg: 6.2,
      roughness: 'MODERATE',
      roughness_detail: 'Elevated connecting ridge with moderate surface undulation near steep PSR drops.',
    },
    defaultIlluminationPct: 84,
    defaultEarthLos: true,
  },
  {
    id: 'slater_plain',
    name: 'Slater Plain',
    region: 'South Pole · Artemis',
    selectionStatus: 'Added in 2024',
    coordinates: {
      latitude: -87.13,
      longitude: 127.86,
      elevation_m: -420,
    },
    description:
      'Added in 2024. Smooth plains unit near Slater crater on the far-side polar margin. Low slopes contrast with seasonal solar grazing and relay-dependent comms.',
    terrain: {
      slope_deg: 4.5,
      roughness: 'LOW',
      roughness_detail: 'Relatively level intercrater plains unit surrounded by higher polar massifs.',
    },
    defaultIlluminationPct: 68,
    defaultEarthLos: false,
  },
];

# 📍 Candidate Landing Sites Registry

> **Document Owner**: Lauri Salonen
> **Last Updated**: 2026-11-15
> **Source of truth in code**: [`client/src/data/candidateSites.ts`](../client/src/data/candidateSites.ts)

## Overview
This document records the **9 NASA Artemis candidate lunar landing regions** near the Moon's South Pole that are loaded by the app (shortlist finalized **October 28, 2024**). Each region spans several kilometers and offers at least ~6.5 Earth days of continuous sunlight along with walking access to shadowed ice deposits, according to NASA. Any additional location can be probed ad hoc by clicking the 3D Moon or entering custom coordinates; probed points are scored live but are not part of this registry.

In the app, the markers for these 9 regions can be toggled `ON`/`OFF` from the **NASA Artemis Candidate Sites (9)** control, and the hover **`i`** button shows the same provenance table with source links.

---

## Site Registry

| # | Site Name | Latitude | Longitude | Elevation (m) | Slope (°) | Roughness | Baseline Sun Flux | Earth DTE (baseline) | Selection Status |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | Peak near Cabeus B | -83.60° | -68.80° (68.80° W) | +1,450 | 5.4 | LOW | 82% | Direct | Added in 2024 |
| 2 | Haworth | -87.45° | -5.17° (5.17° W) | +1,920 | 8.6 | MODERATE | 76% | Direct | Retained from 2022 |
| 3 | Malapert Massif | -86.00° | +2.70° (2.70° E) | +4,850 | 6.8 | MODERATE | 86% | Direct | Retained from 2022 |
| 4 | Mons Mouton | -84.60° | +31.00° (31.00° E) | +5,100 | 4.1 | LOW | 89% | Direct | Added in 2024 |
| 5 | Mons Mouton Plateau | -84.30° | +30.60° (30.60° E) | +4,720 | 3.4 | LOW | 88% | Direct | Added in 2024 |
| 6 | Nobile Rim 1 | -85.30° | +31.50° (31.50° E) | +2,680 | 9.2 | MODERATE | 74% | Direct | Retained from 2022 |
| 7 | Nobile Rim 2 | -84.20° | +60.70° (60.70° E) | +1,840 | 14.8 | HIGH | 54% | Occluded | Retained from 2022 |
| 8 | de Gerlache Rim 2 | -88.71° | -64.00° (64.00° W) | +2,950 | 6.2 | MODERATE | 84% | Direct | Retained from 2022 |
| 9 | Slater Plain | -87.13° | +127.86° (127.86° E) | -420 | 4.5 | LOW | 68% | Occluded | Added in 2024 |

> ℹ️ **Modeled values**: Coordinates and selection status come from NASA / LPI. Elevation, slope, roughness and baseline illumination / Earth-visibility values are **approximate, modeled estimates** used by the demo risk engine; they are not official NASA site assessments. The live Go / Caution / No-Go verdict depends on the selected UTC time and the lander constraint profile, so it will differ from these baselines.

---

## References
- [NASA Identifies Candidate Regions for Landing Next Americans on Moon (Oct 2024)](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/)
- [NASA Artemis IV Mission Page](https://www.nasa.gov/mission/artemis-iv/)
- [LPI Lunar South Pole Atlas](https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/)
- [NASA Moon Trek](https://trek.nasa.gov/moon/)

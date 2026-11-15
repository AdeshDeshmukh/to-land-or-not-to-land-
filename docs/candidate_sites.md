# 📍 Candidate Landing Sites Registry

> **Document Owner**: Lauri Salonen
> **Last Updated**: 2026-11-14

## Overview
This document records the 5 pre-selected candidate lunar landing sites used in the MVP. Each site was chosen to provide scientific contrast across safety levels (Green / Yellow / Red).

---

## Site Registry

| # | Site Name | Region | Latitude | Longitude | Elevation (m) | Expected Risk | Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Shackleton Crater Rim | South Pole | -89.54° | 0.00° | ~4,200 | 🟢 GREEN | Artemis III priority zone, persistent sunlight, scientifically famous. |
| 2 | Malapert Mountain | South Pole | -84.90° | 12.90° | ~5,000 | 🟢/🟡 GREEN-YELLOW | High Earth LOS visibility, strong illumination candidate. |
| 3 | Nobile Crater Region | South Pole | -85.20° | 53.50° | ~-1,200 | 🔴 RED | Partially permanently shadowed, steep inner walls — natural hazard zone. |
| 4 | Mare Tranquillitatis (Apollo 11) | Equatorial | 0.67° | 23.47° | ~-20 | 🟢 GREEN | Flat, smooth, historically proven safe — our Green reference baseline. |
| 5 | Connecting Ridge / Peak Near Shackleton | South Pole | -89.45° | -137.30° (137.30° W) | ~3,850 | 🟡 YELLOW | NASA-identified Artemis candidate with high slope variance. |

> ✅ **Verified**: Normalized Connecting Ridge longitude (`222.70° E` ≡ `-137.30°` / `137.30° W`) into standard `[-180°, +180°]` selenographic range and aligned baseline elevations (`~3,850 m`).

---

## References
- [NASA Artemis III Candidate Landing Regions](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/)
- [LPI Lunar South Pole Atlas](https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/)
- [NASA Moon Trek](https://trek.nasa.gov/moon/)

---

## Lauri's Tasks
1. ☐ Verify all 5 coordinate pairs against NASA/LPI published sources.
2. ☐ Confirm elevation values from Moon Trek elevation profile tool.
3. ☐ Write 2–3 sentence scientific context for each site (for the UI description text).
4. ☐ Flag if any site should be swapped for a better candidate.

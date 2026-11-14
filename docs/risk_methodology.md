# 📊 Risk Assessment Methodology

> **Document Owners**: Adesh Deshmukh & Lauri Salonen
> **Last Updated**: 2026-11-14

## Overview
This document defines the scientific criteria and engineering thresholds used by the risk scoring engine to classify lunar landing sites as **Green (Go)**, **Yellow (Caution)**, or **Red (No-Go)**.

All thresholds are grounded in real lander engineering literature and NASA mission planning constraints.

---

## Risk Factors & Thresholds

### Factor 1: Terrain Slope (Lander Tilt Hazard)

| Level | Threshold | Engineering Basis |
| :--- | :--- | :--- |
| 🟢 Green | Slope < 5° | Within safe tilt margin for most lander leg geometries. |
| 🟡 Yellow | 5° ≤ Slope ≤ 15° | Requires careful touchdown targeting; some landers may tip at upper end. |
| 🔴 Red | Slope > 15° | Exceeds safe tilt tolerance — high probability of lander tip-over or slide. |

**Data Source**: LRO LOLA Digital Elevation Model → derived slope maps.

### Factor 2: Surface Roughness (Obstacle Hazard)

| Level | Classification | Engineering Basis |
| :--- | :--- | :--- |
| 🟢 Green | LOW | Sparse boulder field, < 2% surface coverage. Safe for autonomous descent. |
| 🟡 Yellow | MODERATE | Moderate crater/boulder density, 2–10% coverage. Hazard avoidance system needed. |
| 🔴 Red | HIGH | Dense boulder/crater field, > 10% coverage. High probability of landing gear damage. |

**Data Source**: LROC NAC images + derived roughness indices.

### Factor 3: Solar Illumination (Power Feasibility)

| Level | Threshold | Engineering Basis |
| :--- | :--- | :--- |
| 🟢 Green | > 70% of lunar day illuminated | Sustained solar power for surface operations and thermal regulation. |
| 🟡 Yellow | 30% – 70% illuminated | Requires battery reserves or mission timing optimization. |
| 🔴 Red | < 30% illuminated | Permanent or near-permanent shadow. Solar-powered missions not viable without RTG. |

**Data Source**: LRO Diviner thermal maps + illumination models from JPL Horizons ephemeris.

### Factor 4: Earth Line-of-Sight (Communication Window)

| Level | Threshold | Engineering Basis |
| :--- | :--- | :--- |
| 🟢 Green | Direct Earth LOS available (Earth elevation > 5°) | Reliable direct-to-Earth communication for telemetry and commanding. |
| 🟡 Yellow | Partial LOS (Earth elevation 0° – 5°) | Marginal link; relay satellite may be needed. Signal intermittent near horizon. |
| 🔴 Red | No direct LOS (Earth below horizon) | Zero direct communication. Requires lunar relay satellite infrastructure. |

**Data Source**: JPL Horizons ephemeris (Earth elevation angle at observer coordinates).

---

## Composite Scoring Logic

```
IF any factor = RED     → Overall Status = 🔴 RED (No-Go)
ELIF any factor = YELLOW → Overall Status = 🟡 YELLOW (Caution)  
ELSE                     → Overall Status = 🟢 GREEN (Go)
```

**Rationale**: A single critical failure (e.g., extreme slope or zero communication) is sufficient to disqualify a site regardless of other favorable conditions. This mirrors real mission no-go criteria.

---

## References
- Lunar Surface Operations Planning, NASA/TM-2020 series
- LRO LOLA Instrument Overview: https://lola.gsfc.nasa.gov/
- JPL Horizons System: https://ssd.jpl.nasa.gov/horizons/

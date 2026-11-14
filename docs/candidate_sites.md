# 📍 Candidate Landing Sites Registry

> **Document Owner**: Lauri Salonen (Product Lead & Planetary Science Strategist)  
> **Technical Reviewer**: Adesh Deshmukh (Tech Lead)  
> **Last Updated**: 2026-11-14  
> **Sprint**: Sprint 1 Deliverable (PR #1)

---

## 1. Overview & Demonstration Purpose

The **"To Land or Not to Land" (TLNTL)** platform requires 5 pre-selected candidate lunar landing sites for the MVP. These sites were specifically chosen to provide maximum scientific, topographic, and operational contrast across our safety scoring engine:

- 🟢 **Natural Safe Baseline (GREEN)**: Smooth, flat equatorial terrain with high solar elevation and continuous Earth line-of-sight (proven by Apollo 11).
- 🟢/🟡 **High-Value South Polar Peaks (GREEN / YELLOW)**: High illumination plateaus and crater rims offering extended solar power, tempered by steep perimeter slopes.
- 🟡 **High-Variance Artemis Target (YELLOW)**: Ridge features connecting major polar depressions, displaying significant localized slope variance.
- 🔴 **Natural Severe Hazard Zone (RED)**: Permanently Shadowed Regions (PSRs) and deep crater floors with severe thermal sinks, extreme slopes, and radio occultation.

---

## 2. Verified Candidate Site Registry

| # | Site Name | Region | Latitude | Longitude (±180°) | Longitude (0–360° E) | Elevation (m) | Expected Risk | Scientific Role |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Shackleton Crater Rim** | South Pole | `-89.54°` | `0.00°` | `0.00° E` | `+4,200 m` | 🟢 **GREEN** (Solar) / 🟡 **YELLOW** (Slope) | Artemis III primary candidate; persistent solar illumination atop elevated rim. |
| **2** | **Malapert Mountain (Massif)** | South Pole | `-84.90°` | `+12.90°` | `12.90° E` | `+5,050 m` | 🟢/🟡 **GREEN-YELLOW** | Highest relief in south polar region; uninterrupted Direct-to-Earth (DTE) comms. |
| **3** | **Nobile Crater Floor** | South Pole | `-85.20°` | `+53.50°` | `53.50° E` | `-1,200 m` (rim) / `-3,500 m` (floor) | 🔴 **RED** | NASA VIPER study zone; deep permanently shadowed cryogenic trap and radio shadow. |
| **4** | **Mare Tranquillitatis** | Equatorial | `+0.67°` | `+23.47°` | `23.47° E` | `-20 m` (local datum) / `-2,560 m` (lunar sphere) | 🟢 **GREEN** | Flat basaltic plain (Apollo 11 landing site); standard safe baseline reference. |
| **5** | **Connecting Ridge (CR1)** | South Pole | `-89.45°` | `-137.30°` ⚠️ | `222.70° E` | `+4,350 m` | 🟡 **YELLOW** | Narrow topographical bridge between Shackleton and de Gerlache craters. |

---

## 3. Coordinate & Coordinate System Standardization

### ⚠️ Critical Longitude Standardization for Connecting Ridge (CR1)
* **Initial Observation**: Recorded in earlier drafts as `222.70° E`.
* **Standardization Resolution**:
  * In the **East-positive continuous system ($0^\circ$ to $360^\circ\text{ E}$)**: `222.70° E`.
  * In the **standard selenographic $-180^\circ$ to $+180^\circ$ coordinate system** (used by CesiumJS, GeoJSON, and NASA PDS Web GIS tools):
    $$\text{Longitude}_{[-180, 180]} = 222.70^\circ - 360.00^\circ = -137.30^\circ\text{ (or }137.30^\circ\text{ W)}$$
* **Ground Truth Source**: Verified against the Lunar and Planetary Institute (LPI) Lunar South Pole Atlas (CR1 feature designation) and NASA Artemis III Candidate Regions documentation.

### Elevation Datum Notes
* Elevations are derived from the **LRO LOLA (Lunar Orbiter Laser Altimeter) Digital Elevation Model (DEM)** referenced to the mean lunar sphere radius of **$R = 1,737.40\text{ km}$**.
* Mare Tranquillitatis sits at an absolute sphere radius elevation of $-2,560\text{ m}$, representing a relative local surface flat of $-20\text{ m}$. South polar massifs and crater rims reach up to $+4,000\text{ m}$ to $+5,050\text{ m}$ above the reference sphere.

---

## 4. UI Science Copywriting (Web App & CesiumJS Card Text)

These structured entries are formatted for direct ingestion into the frontend web application data model (`client/src/data/candidateSites.json`).

### 1. Shackleton Crater Rim
* **Display Name**: `Shackleton Crater Rim`
* **Region**: `Lunar South Pole`
* **Coordinates**: `89.54° S, 0.00° E` (Elevation: `+4,200 m`)
* **Default Status**: `🟢 / 🟡 Conditional Go`
* **Why NASA Wants to Land Here**:  
  Shackleton's elevated rim receives near-continuous solar illumination (~86–90% of the lunar year), providing an exceptional environment for long-duration solar power generation. Furthermore, its ultra-cold interior floor lies in perpetual shadow, acting as a premier cold trap for volatile compounds and water-ice critical for in-situ resource utilization (ISRU).
* **Key Hazards & Operational Constraints**:  
  The landing corridor is extremely narrow, flanked by steep inner crater slopes exceeding $30^\circ$, which far surpasses safe lander touchdown tilt limits. Navigational precision and touchdown velocity control are paramount to prevent rim roll-over.

---

### 2. Malapert Mountain (Mons Malapert / Malapert Massif)
* **Display Name**: `Malapert Mountain (Massif)`
* **Region**: `Lunar South Pole (Nearside-facing)`
* **Coordinates**: `84.90° S, 12.90° E` (Elevation: `+5,050 m`)
* **Default Status**: `🟢 Go (High Comms / Solar)`
* **Why NASA Wants to Land Here**:  
  Towering over 5,000 meters above surrounding terrain, the Malapert Massif enjoys virtually uninterrupted line-of-sight to Earth, making it the premier location for high-bandwidth direct-to-Earth (DTE) communications without relying on orbital relay satellites. Its high peak also secures extended solar visibility windows across multiple Artemis launch epochs.
* **Key Hazards & Operational Constraints**:  
  The summit plateau has rough, undulating regolith with high block distribution and micro-craters. Ascending approach trajectories must account for severe radar altimetry altitude jumps caused by towering massif flanks.

---

### 3. Nobile Crater Floor (Permanently Shadowed Region)
* **Display Name**: `Nobile Crater Floor`
* **Region**: `Lunar South Pole`
* **Coordinates**: `85.20° S, 53.50° E` (Elevation: `-3,500 m` floor / `-1,200 m` rim)
* **Default Status**: `🔴 No-Go / Extreme Hazard`
* **Why NASA Wants to Land Here**:  
  Nobile is the designated operational target region for NASA's VIPER rover science objectives, harboring proven surface and subsurface hydrogen deposits. Sampling this ancient polar regolith provides unmatched insights into the primordial volatile history of the inner solar system.
* **Key Hazards & Operational Constraints**:  
  Deep inside the crater floor, temperatures drop below 40 Kelvin (-233°C), creating cryogenic battery death risks and instantaneous loss of direct solar power. Direct line-of-sight to Earth is blocked by towering crater walls, causing severe radio communication blackouts.

---

### 4. Mare Tranquillitatis (Apollo 11 Baseline)
* **Display Name**: `Mare Tranquillitatis (Statio Tranquillitatis)`
* **Region**: `Equatorial Nearside`
* **Coordinates**: `0.67° N, 23.47° E` (Elevation: `-20 m` local / `-2,560 m` LOLA datum)
* **Default Status**: `🟢 Go (Reference Baseline)`
* **Why NASA Wants to Land Here**:  
  As the historic landing site of Apollo 11, this expansive titanium-rich basaltic plain offers a geologically well-characterized benchmark for equatorial lunar exploration and regolith mechanics.
* **Key Hazards & Operational Constraints**:  
  The site is subject to standard 14-day lunar night cycles with zero solar illumination during nighttime periods. However, from a touchdown dynamics standpoint, slope angles are minimal (<3°) and boulder density is very low, serving as our ideal control benchmark.

---

### 5. Connecting Ridge (CR1)
* **Display Name**: `Connecting Ridge (Shackleton–de Gerlache)`
* **Region**: `Lunar South Pole`
* **Coordinates**: `89.45° S, -137.30° E` (`222.70° E`) (Elevation: `+4,350 m`)
* **Default Status**: `🟡 Caution / High Variance`
* **Why NASA Wants to Land Here**:  
  This elevated morphological ridge forms a direct traverse corridor connecting Shackleton Crater to de Gerlache Crater. It delivers substantial illumination periods and provides accessible surface rover routes toward several distinct permanently shadowed cold traps.
* **Key Hazards & Operational Constraints**:  
  The ridge crest is narrow with sharp drop-offs on both sides, creating significant localized slope variance (15°–25° slopes within 200 meters of the crest). Landing outside the narrow spine poses a high risk of touchdown tip-over.

---

## 5. Risk Rationale Validation Matrix

| Site | Slope Risk ($\theta$) | Roughness Risk ($\Delta z$) | Solar Illumination ($I_s$) | Earth LOS ($C_{\text{los}}$) | Aggregate Rating | Intended Demonstration Feature |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Mare Tranquillitatis** | 🟢 Minimal (<3°) | 🟢 Minimal | 🟢 Predictable (Equatorial) | 🟢 Continuous 100% | 🟢 **GREEN** | Proves the engine gives historic safe sites a near-perfect score. |
| **Malapert Mountain** | 🟢 Moderate (<8°) | 🟡 Moderate roughness | 🟢 High (>75% duty) | 🟢 Continuous 98–100% | 🟢/🟡 **GREEN** | Demonstrates the power of high elevation for communications & solar. |
| **Shackleton Rim** | 🟡 Sharp boundary (<12° rim, >30° inner) | 🟡 High local relief | 🟢 Very High (>86%) | 🟡 Periodic libration dips | 🟡/🟢 **CONDITIONAL** | Demonstrates why launch date timing matters: green in sun, caution on slope. |
| **Connecting Ridge** | 🟡 Variable (10°–22°) | 🟡 Medium boulders | 🟡 Moderate (65–75%) | 🟡 Libration sensitive | 🟡 **YELLOW** | Demonstrates the sensitivity of the hazard avoidance threshold. |
| **Nobile Crater Floor** | 🔴 Steep walls (>25°) | 🔴 Cryogenic boulder traps | 🔴 Total darkness (0% PSR) | 🔴 Obscured (0% LOS) | 🔴 **RED** | Demonstrates clear, explainable rejection (No-Go) of lethal terrain. |

---

## 6. Frontend JSON Schema Export

This JSON block is structured for direct inclusion in `client/src/data/candidateSites.json`:

```json
[
  {
    "id": "shackleton-rim",
    "name": "Shackleton Crater Rim",
    "region": "South Pole",
    "latitude": -89.54,
    "longitude": 0.00,
    "elevationMeters": 4200,
    "defaultStatus": "YELLOW",
    "whyNasa": "Receives near-continuous solar illumination (~86–90% of the year) for solar power generation, while sitting adjacent to deep permanently shadowed volatile traps.",
    "hazards": "Extremely narrow landing ridge flanked by steep crater walls (>30° slope) with severe tip-over risk.",
    "metrics": {
      "slopeDegrees": 11.2,
      "illuminationPercent": 88.5,
      "earthLosPercent": 82.0,
      "roughnessIndex": 0.42
    }
  },
  {
    "id": "malapert-mountain",
    "name": "Malapert Mountain (Massif)",
    "region": "South Pole",
    "latitude": -84.90,
    "longitude": 12.90,
    "elevationMeters": 5050,
    "defaultStatus": "GREEN",
    "whyNasa": "Offers exceptional 5,000 m elevation with near-constant direct line-of-sight to Earth for telemetry and extended solar power visibility windows.",
    "hazards": "Undulating massif plateau with localized micro-craters and radar altimetry altitude jumps during descent.",
    "metrics": {
      "slopeDegrees": 6.8,
      "illuminationPercent": 79.0,
      "earthLosPercent": 99.2,
      "roughnessIndex": 0.31
    }
  },
  {
    "id": "nobile-crater-floor",
    "name": "Nobile Crater Floor",
    "region": "South Pole",
    "latitude": -85.20,
    "longitude": 53.50,
    "elevationMeters": -3500,
    "defaultStatus": "RED",
    "whyNasa": "Prime science destination for volatile and water-ice discovery (NASA VIPER study zone) containing ancient cryogenic regolith.",
    "hazards": "Perpetual darkness (0% illumination), cryogenic thermal extremes (<40 K), and complete Earth radio occultation by crater rims.",
    "metrics": {
      "slopeDegrees": 27.4,
      "illuminationPercent": 0.0,
      "earthLosPercent": 0.0,
      "roughnessIndex": 0.88
    }
  },
  {
    "id": "mare-tranquillitatis",
    "name": "Mare Tranquillitatis",
    "region": "Equatorial Nearside",
    "latitude": 0.67,
    "longitude": 23.47,
    "elevationMeters": -20,
    "defaultStatus": "GREEN",
    "whyNasa": "Historic Apollo 11 landing site providing an extensively characterized, flat basaltic plain as our reference control baseline.",
    "hazards": "Standard 14-day cryogenic lunar night, but virtually zero terrain hazard with minimal slope (<3°).",
    "metrics": {
      "slopeDegrees": 1.9,
      "illuminationPercent": 50.0,
      "earthLosPercent": 100.0,
      "roughnessIndex": 0.08
    }
  },
  {
    "id": "connecting-ridge",
    "name": "Connecting Ridge (CR1)",
    "region": "South Pole",
    "latitude": -89.45,
    "longitude": -137.30,
    "elevationMeters": 4350,
    "defaultStatus": "YELLOW",
    "whyNasa": "Natural elevated topographical traverse bridge connecting Shackleton and de Gerlache craters with high cumulative solar visibility.",
    "hazards": "Narrow ridge crest with steep bilateral drop-offs (15°–25°), demanding precision guidance to prevent landing on severe slopes.",
    "metrics": {
      "slopeDegrees": 17.5,
      "illuminationPercent": 71.0,
      "earthLosPercent": 64.0,
      "roughnessIndex": 0.54
    }
  }
]
```

---

## 7. Primary Scientific References
1. **NASA Artemis III Candidate Landing Regions Announcement**: [NASA Release 22-088](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/)
2. **LPI Lunar South Pole Atlas**: Lunar and Planetary Institute, [South Pole Candidate Regions](https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/)
3. **NASA Moon Trek Interactive Planetary GIS**: [MoonTrek Portal](https://trek.nasa.gov/moon/)
4. **LRO LOLA Science Team**: *Lunar Reconnaissance Orbiter Lunar Orbiter Laser Altimeter 30-meter Polar Digital Elevation Models (DEM)*.
5. **NASA VIPER Landing Site Selection**: *Nobile Region as the VIPER Mission Destination*, NASA Artemis Lunar Discovery & Exploration Program.

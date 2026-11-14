# 🌕 ARCHITECTURE — To Land or Not to Land

> **NASA Space Apps Challenge 2026**
> **Document Status**: Living Document · Created at T-0 (Hackathon Start)
> **Maintainer**: Adesh Deshmukh (Technical Lead)

---

## Table of Contents

1. [System Overview & Philosophy](#1-system-overview--philosophy)
2. [Complete Directory Structure](#2-complete-directory-structure)
3. [Technology Stack & Justification](#3-technology-stack--justification)
4. [Data Architecture](#4-data-architecture)
5. [Component Architecture](#5-component-architecture)
6. [Risk Scoring Engine Design](#6-risk-scoring-engine-design)
7. [Data Pipeline Architecture](#7-data-pipeline-architecture)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Git Workflow & Branch Strategy](#9-git-workflow--branch-strategy)
10. [Phased Build Plan with Task Ownership](#10-phased-build-plan-with-task-ownership)
11. [Scalability & Future Extensions](#11-scalability--future-extensions)
12. [Conventions & Standards](#12-conventions--standards)

---

## 1. System Overview & Philosophy

### Core Design Principles

| Principle | Rationale |
| :--- | :--- |
| **Client-Side First** | No backend server for the MVP. All scoring, rendering, and data lookup happen in the browser. This eliminates deployment complexity, server costs, and live API failures during the demo. |
| **Pre-Computed Data** | Ephemeris (Sun/Earth angles) and terrain metrics are pre-computed offline and shipped as static JSON. The date slider interpolates across this pre-computed dataset client-side. |
| **Explainability Over Complexity** | Every Green/Yellow/Red score must show *why* it was assigned. Transparent, rule-based scoring — no black-box ML. |
| **Progressive Enhancement** | Phase 1 delivers a working MVP with static data. Phase 2 adds visual depth (shadows, terrain). Phase 3 adds polish and presentation. Each phase is independently deployable. |
| **Separation of Concerns** | Data preparation (Python scripts) is completely decoupled from the web application (React/TypeScript). They share only the JSON contract. |

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OFFLINE DATA PIPELINE                            │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌───────────────────┐  │
│  │ JPL Horizons │───▶│ fetch_ephemeris   │───▶│ ephemeris.json    │  │
│  │ REST API     │    │ .py               │    │ (Sun/Earth angles │  │
│  └──────────────┘    └──────────────────┘    │  per site/date)   │  │
│                                               └─────────┬─────────┘  │
│  ┌──────────────┐    ┌──────────────────┐               │           │
│  │ NASA Moon    │───▶│ extract_terrain   │───▶┌──────────┴────────┐  │
│  │ Trek / LOLA  │    │ .py               │   │candidate_sites    │  │
│  └──────────────┘    └──────────────────┘   │.json               │  │
│                                              │(merged site data)  │  │
│                                              └──────────┬─────────┘  │
└─────────────────────────────────────────────────────────┼───────────┘
                                                          │
                                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CLIENT WEB APPLICATION                           │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                        App Shell                               │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐  │  │
│  │  │  Globe   │  │  Dashboard   │  │     Risk Panel          │  │  │
│  │  │ (Cesium) │  │  (Date Slider│  │  (Go/Caution/No-Go      │  │  │
│  │  │          │  │   + Site     │  │   Factor Breakdown      │  │  │
│  │  │  3D Moon │  │   Selector)  │  │   Comparison Table)     │  │  │
│  │  └────┬─────┘  └──────┬───────┘  └────────────┬────────────┘  │  │
│  │       │               │                        │               │  │
│  │       └───────────────┼────────────────────────┘               │  │
│  │                       │                                        │  │
│  │              ┌────────▼────────┐                               │  │
│  │              │  Risk Scoring   │                               │  │
│  │              │  Engine         │                               │  │
│  │              │  (Pure TS)      │                               │  │
│  │              └────────┬────────┘                               │  │
│  │                       │                                        │  │
│  │              ┌────────▼────────┐                               │  │
│  │              │  Static JSON    │                               │  │
│  │              │  Data Layer     │                               │  │
│  │              └─────────────────┘                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Deploy Target: Vercel (Static Site / SSG)                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Directory Structure

```
to-land-or-not-to-land-/
│
├── .github/                                # GitHub configuration
│   ├── PULL_REQUEST_TEMPLATE.md            # PR checklist for contributors
│   └── workflows/                          # CI/CD (optional stretch goal)
│       └── deploy.yml                      # Auto-deploy to Vercel on merge to main
│
├── docs/                                   # Non-code documentation & research
│   ├── PROJECT_MASTER_PLAN.md              # The Google Doc master plan (versioned)
│   ├── candidate_sites.md                  # Coordinates, reasoning, references for 5 sites
│   ├── risk_methodology.md                 # Scientific formulas, threshold justifications
│   ├── data_sources.md                     # All NASA API/dataset links & access notes
│   ├── meeting_notes/                      # Timestamped sync notes
│   │   └── 2026-11-14_kickoff.md           # Today's kickoff meeting notes
│   └── assets/                             # Diagrams, wireframes, reference images
│       ├── wireframe_globe_view.png
│       ├── wireframe_dashboard.png
│       └── system_diagram.png
│
├── scripts/                                # Offline data preparation (NOT part of the web app)
│   ├── README.md                           # How to run the data pipeline
│   ├── requirements.txt                    # Python dependencies (astroquery, numpy, pandas)
│   ├── fetch_ephemeris.py                  # Query JPL Horizons for Sun/Earth angles per site
│   ├── extract_terrain.py                  # Extract slope/roughness from Moon Trek API
│   ├── merge_site_data.py                  # Combine ephemeris + terrain into final JSON
│   └── output/                             # Raw pipeline output (gitignored except final JSONs)
│       └── .gitkeep
│
├── client/                                 # React + TypeScript + Vite Web Application
│   ├── index.html                          # Vite entry point
│   ├── package.json                        # Dependencies & scripts
│   ├── tsconfig.json                       # TypeScript configuration
│   ├── vite.config.ts                      # Vite build configuration
│   ├── tailwind.config.js                  # Tailwind CSS configuration
│   ├── postcss.config.js                   # PostCSS (required by Tailwind)
│   │
│   ├── public/                             # Static assets served as-is
│   │   ├── favicon.ico                     # Moon/rocket favicon
│   │   ├── og-image.png                    # Social share preview image
│   │   └── textures/                       # Lunar surface textures for globe
│   │       └── moon_8k.jpg                 # High-res Moon basemap texture
│   │
│   └── src/                                # Application source code
│       │
│       ├── main.tsx                        # React DOM entry point
│       ├── App.tsx                         # Root component, layout orchestration
│       ├── App.css                         # Global styles (minimal, Tailwind handles most)
│       │
│       ├── types/                          # TypeScript type definitions (shared contracts)
│       │   ├── site.ts                     # CandidateSite, Coordinates, SiteMetrics interfaces
│       │   ├── risk.ts                     # RiskLevel enum, RiskFactor, RiskAssessment types
│       │   ├── ephemeris.ts                # EphemerisEntry, SunEarthAngles, DateWindow types
│       │   └── index.ts                    # Barrel export for all types
│       │
│       ├── data/                           # Pre-computed static JSON datasets
│       │   ├── candidate_sites.json        # 5 sites with coordinates + terrain metrics
│       │   ├── ephemeris/                  # Per-site ephemeris data (Sun/Earth angles by date)
│       │   │   ├── shackleton_rim.json
│       │   │   ├── malapert_mountain.json
│       │   │   ├── nobile_crater.json
│       │   │   ├── mare_tranquillitatis.json
│       │   │   └── connecting_ridge.json
│       │   └── risk_thresholds.json        # Configurable threshold values (the rules)
│       │
│       ├── engine/                         # Risk scoring & computation logic (PURE functions)
│       │   ├── riskCalculator.ts           # Main scoring: site + date → RiskAssessment
│       │   ├── slopeEvaluator.ts           # Slope angle → Green/Yellow/Red
│       │   ├── roughnessEvaluator.ts       # Surface roughness → Green/Yellow/Red
│       │   ├── illuminationEvaluator.ts    # Solar illumination % → Green/Yellow/Red
│       │   ├── losEvaluator.ts             # Earth line-of-sight → Green/Yellow/Red
│       │   ├── compositeScorer.ts          # Combine 4 factors → overall site status
│       │   └── __tests__/                  # Unit tests for scoring logic
│       │       ├── riskCalculator.test.ts
│       │       └── compositeScorer.test.ts
│       │
│       ├── hooks/                          # Custom React hooks
│       │   ├── useSiteData.ts              # Load & cache candidate site JSON
│       │   ├── useEphemeris.ts             # Load & interpolate ephemeris for selected date
│       │   ├── useRiskAssessment.ts        # Compute risk for current site + date selection
│       │   └── useDateSlider.ts            # Date slider state management
│       │
│       ├── components/                     # React UI components (organized by feature)
│       │   │
│       │   ├── Globe/                      # 3D Lunar Globe (CesiumJS integration)
│       │   │   ├── LunarGlobe.tsx          # Main Cesium viewer with Moon ellipsoid
│       │   │   ├── SitePin.tsx             # Clickable G/Y/R glowing pin entity
│       │   │   ├── GlobeControls.tsx       # Zoom, rotate, fly-to controls
│       │   │   └── Globe.module.css        # Globe-specific styles
│       │   │
│       │   ├── Dashboard/                  # Controls: date slider, site selector, workflow toggle
│       │   │   ├── DateTimeSlider.tsx       # Draggable date/time scrubber
│       │   │   ├── SiteSelector.tsx         # Dropdown / clickable list of 5 sites
│       │   │   ├── WorkflowToggle.tsx       # Switch between Date-First and Site-First mode
│       │   │   └── Dashboard.module.css
│       │   │
│       │   ├── RiskPanel/                  # Risk assessment display
│       │   │   ├── RiskStatusBadge.tsx      # Large Green/Yellow/Red badge with label
│       │   │   ├── FactorBreakdown.tsx      # 4-row factor detail (slope, roughness, etc.)
│       │   │   ├── StatusReason.tsx         # Plain-English explanation of the score
│       │   │   └── RiskPanel.module.css
│       │   │
│       │   ├── SkyPlot/                    # 2D Sun/Earth elevation angle visualization
│       │   │   ├── HorizonPlot.tsx          # Chart showing Sun & Earth angles vs. time
│       │   │   ├── CountdownTimers.tsx      # "Time until Sunset" & "Comms Window Close"
│       │   │   └── SkyPlot.module.css
│       │   │
│       │   ├── Comparison/                 # Side-by-side site comparison (Phase 2)
│       │   │   ├── ComparisonTable.tsx      # Multi-site comparison grid
│       │   │   └── Comparison.module.css
│       │   │
│       │   └── Layout/                     # Shared layout components
│       │       ├── Header.tsx               # App title bar, mode toggle, team credit
│       │       ├── Sidebar.tsx              # Left sidebar (site list + controls)
│       │       ├── Footer.tsx               # NASA attribution & data source credits
│       │       └── Layout.module.css
│       │
│       ├── context/                        # React Context for global state
│       │   ├── SiteContext.tsx              # Currently selected site
│       │   ├── DateContext.tsx              # Currently selected date/time
│       │   └── ModeContext.tsx              # Date-First vs. Site-First workflow mode
│       │
│       └── utils/                          # General utility functions
│           ├── dateHelpers.ts              # Lunar day calculations, date formatting
│           ├── coordinateHelpers.ts         # Lat/Lon conversions, selenographic math
│           └── constants.ts                # Moon radius, default dates, color codes
│
├── ARCHITECTURE.md                         # THIS FILE — system design & build plan
├── README.md                               # Project overview, quickstart, team credits
├── LICENSE                                 # MIT License
└── .gitignore                              # Node, Python, OS, and GIS binary exclusions
```

---

## 3. Technology Stack & Justification

| Layer | Technology | Why This Choice |
| :--- | :--- | :--- |
| **Language** | TypeScript | Type safety catches bugs early in a fast hackathon. Shared types between components prevent data contract mismatches. |
| **Framework** | React 18+ | Industry standard for component-based UIs. Massive ecosystem. Every team member likely knows it. |
| **Build Tool** | Vite | Near-instant dev server hot reload. Zero-config for React + TS. Produces optimized static builds for Vercel. |
| **Styling** | Tailwind CSS | Utility-first approach eliminates CSS file sprawl. Rapid prototyping. Dark theme trivial to implement (space UI aesthetic). |
| **3D Globe** | CesiumJS | Purpose-built for planetary/geospatial visualization. Native support for custom ellipsoids (Moon radius 1,737.4 km). Loads NASA Moon Trek WMTS tiles directly. Battle-tested by NASA, ESA, and USGS. |
| **2D Charts** | Recharts or Chart.js | Lightweight, React-native charting for the Sun/Earth horizon elevation plot. |
| **Data Pipeline** | Python 3.10+ | `astroquery` for JPL Horizons ephemeris queries. `numpy` / `pandas` for numerical processing. One-time offline execution — not part of the web app. |
| **Deployment** | Vercel | Zero-config static site hosting. Automatic HTTPS. GitHub integration for auto-deploy on merge to `main`. Free tier is sufficient. |
| **Version Control** | Git + GitHub | Public repository (NASA Space Apps requirement). PR-based workflow with review gating. |

### What We Are NOT Using (And Why)

| Deliberately Excluded | Reason |
| :--- | :--- |
| **Backend Server (Node/Python API)** | No live server needed. All data is pre-computed and bundled as static JSON. Eliminates deployment failure modes. |
| **Database (PostgreSQL, MongoDB)** | 5 candidate sites with pre-computed time series fit comfortably in JSON files under 2 MB total. A database adds zero value and deployment complexity. |
| **Docker / Kubernetes** | Massive over-engineering for a static web app. Vercel handles everything. |
| **Machine Learning** | Risk scoring must be explainable and transparent. Rule-based thresholds are scientifically defensible and auditable. ML would be a black box that judges cannot verify. |

---

## 4. Data Architecture

### 4.1 Core Data Schema: `CandidateSite`

```typescript
interface CandidateSite {
  id: string;                      // e.g., "shackleton_rim"
  name: string;                    // e.g., "Shackleton Crater Rim"
  region: string;                  // e.g., "South Pole"
  coordinates: {
    latitude: number;              // Selenographic latitude (degrees, -90 to +90)
    longitude: number;             // Selenographic longitude (degrees, 0 to 360)
    elevation_m: number;           // Surface elevation relative to mean sphere (meters)
  };
  description: string;             // 1–2 sentence scientific context
  terrain: {
    slope_deg: number;             // Average slope in degrees
    roughness: "LOW" | "MODERATE" | "HIGH";
    roughness_detail: string;      // "Sparse boulder field, <2% coverage"
  };
}
```

### 4.2 Core Data Schema: `EphemerisEntry`

```typescript
interface EphemerisEntry {
  datetime_utc: string;            // ISO 8601: "2026-11-15T00:00:00Z"
  sun_elevation_deg: number;       // Sun angle above local horizon (negative = below)
  earth_elevation_deg: number;     // Earth angle above local horizon
  solar_illumination_pct: number;  // Derived: proportion of lunar day with sunlight
  earth_los: boolean;              // Derived: true if Earth elevation > 0°
}
```

### 4.3 Core Data Schema: `RiskAssessment`

```typescript
type RiskLevel = "GREEN" | "YELLOW" | "RED";

interface RiskFactor {
  name: string;                    // "Terrain Slope"
  value: string;                   // "4.2°"
  level: RiskLevel;                // "GREEN"
  explanation: string;             // "Well within safe lander tilt tolerance (<5°)"
}

interface RiskAssessment {
  site_id: string;
  date: string;
  overall_status: RiskLevel;
  overall_reason: string;          // "All factors within safe operational limits"
  factors: RiskFactor[];           // Array of 4 individual factor assessments
}
```

### 4.4 Data Flow

```
[candidate_sites.json] ──┐
                          ├──▶ riskCalculator(site, date) ──▶ RiskAssessment
[ephemeris/*.json] ───────┘                                      │
                                                                  ▼
[risk_thresholds.json] ──────────────────────────────▶  UI Components
                                                     (Badge, Breakdown, Reason)
```

---

## 5. Component Architecture

### 5.1 Component Tree

```
<App>
├── <Header />                           # Title, mode toggle, team credit
├── <main>                               # Flex layout: sidebar + globe + panel
│   ├── <Sidebar>
│   │   ├── <WorkflowToggle />           # Date-First ↔ Site-First switch
│   │   ├── <DateTimeSlider />           # Date/time scrubber
│   │   └── <SiteSelector />             # Clickable list of 5 candidate sites
│   │
│   ├── <LunarGlobe>                     # 3D CesiumJS viewer (center, takes 60% width)
│   │   └── <SitePin /> × 5             # Glowing Green/Yellow/Red markers
│   │
│   └── <RightPanel>                     # Right side information panel
│       ├── <RiskStatusBadge />          # Large GO / CAUTION / NO-GO indicator
│       ├── <FactorBreakdown />          # 4-row factor analysis table
│       ├── <StatusReason />             # Plain-English explanation
│       ├── <HorizonPlot />             # Sun/Earth angle chart over time
│       └── <CountdownTimers />          # Time until sunset / Earth-set
│
├── <ComparisonTable />                  # Phase 2: side-by-side multi-site view
└── <Footer />                           # NASA attribution & data source credits
```

### 5.2 State Management Strategy

| State | Scope | Mechanism |
| :--- | :--- | :--- |
| Selected Site | Global | `SiteContext` (React Context) |
| Selected Date/Time | Global | `DateContext` (React Context) |
| Workflow Mode (Date-First / Site-First) | Global | `ModeContext` (React Context) |
| Risk Assessment Result | Derived | `useRiskAssessment()` hook (computed from site + date) |
| Ephemeris Time Series | Per-Site | `useEphemeris(siteId)` hook (loads per-site JSON) |
| Globe Camera Position | Local | CesiumJS internal viewer state |

No external state library (Redux, Zustand) needed. React Context + custom hooks are sufficient for 5 sites and a date slider.

---

## 6. Risk Scoring Engine Design

### 6.1 Individual Factor Evaluation

Each factor is evaluated by a dedicated pure function with no side effects:

```
slopeEvaluator(slope_deg, thresholds) → { level, explanation }
roughnessEvaluator(roughness, thresholds) → { level, explanation }
illuminationEvaluator(solar_pct, thresholds) → { level, explanation }
losEvaluator(earth_los, earth_elevation, thresholds) → { level, explanation }
```

### 6.2 Composite Scoring Logic

```
compositeScorer(factors: RiskFactor[]) → { overall_status, overall_reason }

Rules:
  IF any factor.level === "RED"    → overall = RED   ("No-Go: [factor] exceeds safe limits")
  ELIF any factor.level === "YELLOW" → overall = YELLOW ("Caution: [factor] requires mitigation")
  ELSE                              → overall = GREEN  ("Go: All factors within safe limits")
```

### 6.3 Configurable Thresholds (`risk_thresholds.json`)

Thresholds are stored in a separate JSON file so they can be adjusted without changing code:

```json
{
  "slope": {
    "green_max_deg": 5,
    "yellow_max_deg": 15
  },
  "roughness": {
    "green": "LOW",
    "yellow": "MODERATE",
    "red": "HIGH"
  },
  "illumination": {
    "green_min_pct": 70,
    "yellow_min_pct": 30
  },
  "earth_los": {
    "green_min_elevation_deg": 5,
    "yellow_min_elevation_deg": 0
  }
}
```

---

## 7. Data Pipeline Architecture

### 7.1 Pipeline Overview (`scripts/`)

The data pipeline runs **offline, once**, before or at the start of the hackathon. Its output (JSON files) is committed to `client/src/data/`. The web app never calls external APIs at runtime.

```
Step 1: fetch_ephemeris.py
  Input:  5 site coordinates + date range (±30 days from Nov 14, 2026)
  Source: JPL Horizons REST API (https://ssd.jpl.nasa.gov/horizons/)
  Output: scripts/output/ephemeris_raw/{site_id}.json

Step 2: extract_terrain.py
  Input:  5 site coordinates
  Source: NASA Moon Trek REST API (elevation profile endpoint)
  Output: scripts/output/terrain_raw/{site_id}.json

Step 3: merge_site_data.py
  Input:  Raw ephemeris + terrain outputs
  Output: client/src/data/candidate_sites.json
          client/src/data/ephemeris/{site_id}.json (one per site)
```

### 7.2 Fallback Strategy

If JPL Horizons or Moon Trek APIs are unreachable during the hackathon:
- Use **manually curated reference values** from published NASA/LPI South Pole illumination studies.
- Document the source in `docs/data_sources.md`.
- The scoring engine works identically regardless of whether data came from live API or manual curation.

---

## 8. Deployment Architecture

### 8.1 Deployment Target: Vercel

```
GitHub main branch
       │
       ▼  (auto-trigger on merge)
┌─────────────┐
│   Vercel     │
│  Build:      │
│  npm run     │
│  build       │
│              │
│  Output:     │
│  /dist       │──▶  https://to-land-or-not-to-land.vercel.app
│  (static)    │
└─────────────┘
```

### 8.2 Deployment Checklist

- [ ] Connect GitHub repo to Vercel (one-click import)
- [ ] Set root directory to `client/`
- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`
- [ ] Verify live URL loads the 3D globe without errors
- [ ] Include live URL in NASA Space Apps submission form

---

## 9. Git Workflow & Branch Strategy

### 9.1 Branch Model

```
main (protected)
 │
 ├── feature/cesium-globe          (Ethan)
 ├── feature/risk-panel            (Rishika)
 ├── feature/date-slider           (Rishika)
 ├── feature/scoring-engine        (Adesh)
 ├── feature/ephemeris-pipeline    (Adesh)
 ├── docs/candidate-sites          (Lauri)
 ├── docs/risk-methodology         (Lauri)
 └── docs/meeting-notes            (Lauri)
```

### 9.2 Rules

| Rule | Detail |
| :--- | :--- |
| **No direct commits to `main`** | All work goes through feature branches and Pull Requests. |
| **Adesh reviews and merges all PRs** | Technical lead ensures nothing breaks the build. |
| **Commit message format** | `type: short description` — e.g., `feat: add slope evaluator`, `docs: update candidate sites`, `fix: globe pin color binding` |
| **Accepted commit types** | `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` |
| **PR must include** | Description of what changed, screenshot (if UI), and confirmation it builds locally (`npm run build` passes). |

### 9.3 Contributor Quick-Start

```bash
# Clone the repository
git clone https://github.com/AdeshDeshmukh/to-land-or-not-to-land-.git
cd to-land-or-not-to-land-

# Create your feature branch
git checkout -b feature/your-feature-name

# Make changes, then commit
git add .
git commit -m "feat: describe what you built"

# Push and open a Pull Request on GitHub
git push origin feature/your-feature-name
```

---

## 10. Phased Build Plan with Task Ownership

### Phase 0: Pre-Hackathon (Allowed — Non-Code Only) ✅

| Task | Owner | Deliverable | Status |
| :--- | :--- | :--- | :--- |
| Lock 5 candidate sites with verified coordinates | Lauri | `docs/candidate_sites.md` | ☐ In Progress |
| Lock Green/Yellow/Red scoring thresholds | Adesh + Lauri | `docs/risk_methodology.md` | ✅ Done |
| Review Moon Trek API & JPL Horizons data formats | Adesh | Local notes & tooling ready | ☐ In Progress |
| Create low-fidelity UI wireframes (non-code) | Rishika + Ethan | Figma / sketch images in `docs/assets/` | ☐ To Do |
| Write this architecture document | Adesh | `ARCHITECTURE.md` | ✅ Done |

### Phase 1: Working MVP (Hours 0–16)

**Goal**: A deployed web page with a 3D Moon, 5 clickable pins showing Green/Yellow/Red, a date slider, and a risk breakdown panel.

| Task | Owner | Deliverable |
| :--- | :--- | :--- |
| Initialize GitHub repo, scaffold Vite + React + TS project | **Adesh** | Working `npm run dev` with blank app |
| Run ephemeris data pipeline and commit output JSONs | **Adesh** | `client/src/data/ephemeris/*.json` |
| Build `candidate_sites.json` with terrain metrics | **Adesh + Lauri** | `client/src/data/candidate_sites.json` |
| Implement the 4 risk evaluators + composite scorer | **Adesh** | `client/src/engine/*.ts` with unit tests |
| Render 3D Moon with CesiumJS + NASA tiles | **Ethan + Adesh** | Interactive globe in browser |
| Add 5 clickable site pins with Green/Yellow/Red glow | **Ethan** | Pins respond to click → select site |
| Build DateTimeSlider component | **Rishika** | Draggable date scrubber updates global date state |
| Build RiskStatusBadge + FactorBreakdown components | **Rishika** | Displays Go/Caution/No-Go with 4-factor detail |
| Build WorkflowToggle (Date-First ↔ Site-First) | **Rishika** | Toggle switch changes UI behavior |
| Wire everything together: slider → engine → panel → globe | **Adesh** | End-to-end data flow working |
| Deploy to Vercel | **Adesh** | Live URL accessible |

### Phase 2: High-Impact Visuals & Comparison (Hours 16–34)

**Goal**: Add terrain depth, the horizon/sky plot, site comparison, and countdown timers.

| Task | Owner | Deliverable |
| :--- | :--- | :--- |
| Add LOLA elevation overlay / shadow region layer | **Ethan + Adesh** | Visually richer terrain on the globe |
| Build HorizonPlot (Sun/Earth elevation angles over time) | **Rishika** | 2D chart showing angles vs. hours |
| Build CountdownTimers (Time until Sunset / Earthset) | **Adesh + Rishika** | Live countdown from selected date |
| Build ComparisonTable (side-by-side 2–3 sites) | **Rishika** | Multi-site comparison grid |
| Add "What-If" demo presets (Launch Slip / Shadow Trap) | **Adesh** | 1-click buttons that set date + site |
| Refine globe camera fly-to animations | **Ethan** | Smooth transitions between sites |

### Phase 3: Polish, Presentation & Submission (Hours 34–48)

**Goal**: Final UI polish, educator mode, demo video, pitch deck, and NASA submission.

| Task | Owner | Deliverable |
| :--- | :--- | :--- |
| Add Mission Planner vs. Educator mode toggle | **Rishika + Lauri** | Switch between technical and plain-English views |
| Dark space theme polish, animations, loading states | **Rishika + Ethan** | Visually polished, professional UI |
| Write final README with screenshots and live URL | **Adesh** | Updated `README.md` |
| Record demo video (screen recording + voiceover) | **Lauri + Team** | 2–3 minute demo video |
| Create pitch deck (Google Slides / PDF) | **Lauri** | 5–8 slide presentation |
| Submit on NASA Space Apps portal | **Lauri + Adesh** | Official submission with all artifacts |
| Final Vercel deployment verification | **Adesh** | Live URL confirmed working |

---

## 11. Scalability & Future Extensions

These features are out of scope for the 48-hour hackathon but demonstrate the platform's extensibility:

| Extension | Description |
| :--- | :--- |
| **Custom Coordinate Input** | Allow users to type any Lat/Lon and get a real-time risk assessment (requires on-demand Moon Trek API queries). |
| **Multi-Mission Profiles** | Load different lander specifications (slope tolerance, power requirements) and re-score sites per vehicle. |
| **Historical Mission Overlay** | Plot Apollo, Chang'e, Chandrayaan, and SLIM landing sites on the globe with their actual outcomes. |
| **Collaborative Planning Mode** | Multiple users annotate and discuss candidate sites in real-time (WebSocket integration). |
| **AI-Assisted Site Recommendation** | Given mission constraints (payload mass, power budget, science objectives), recommend optimal landing sites. |

---

## 12. Conventions & Standards

### Code Style
- **Language**: TypeScript (strict mode enabled)
- **Formatting**: Prettier (default config)
- **Linting**: ESLint with `@typescript-eslint`
- **Naming**: `camelCase` for variables/functions, `PascalCase` for components/types, `UPPER_SNAKE_CASE` for constants

### File Naming
- React components: `PascalCase.tsx` (e.g., `LunarGlobe.tsx`)
- Utility functions: `camelCase.ts` (e.g., `riskCalculator.ts`)
- Data files: `snake_case.json` (e.g., `candidate_sites.json`)
- Documentation: `snake_case.md` or `UPPER_CASE.md` for root documents

### NASA Attribution
All pages must include visible attribution:
> Data provided by NASA Planetary Data System (PDS), Lunar Reconnaissance Orbiter (LRO), and JPL Horizons. This project was developed for the 2026 NASA Space Apps Challenge.

---

*This architecture is a living document. All changes should be logged in the Decision & Change Log (see `docs/PROJECT_MASTER_PLAN.md`).*

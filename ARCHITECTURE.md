# 🌕 ARCHITECTURE — To Land or Not to Land
## Grounded in: *Fundamentals of Software Architecture 2E* (Richards & Ford) + *Head First Software Architecture* (Gandhi, Richards, Ford)

> **NASA Space Apps Challenge 2026**
> **Document Status**: Living Document · T-0 Hackathon Start
> **Maintainer**: Adesh Deshmukh (Technical Lead)
> **Version**: 2.0 — Book-Grounded Edition

---

## Table of Contents

1. [Architectural Thinking: The Foundation](#1-architectural-thinking-the-foundation)
2. [Architecture Characteristics (The "-ilities")](#2-architecture-characteristics-the--ilities)
3. [Style Evaluation: Why Not Microservices, Go, or a Distributed Backend](#3-style-evaluation-why-not-microservices-go-or-a-distributed-backend)
4. [Chosen Architecture Style: Modular Monolith + Pipeline Data Layer](#4-chosen-architecture-style-modular-monolith--pipeline-data-layer)
5. [Complete Directory Structure](#5-complete-directory-structure)
6. [Technology Stack with Full Justification](#6-technology-stack-with-full-justification)
7. [Component Architecture & Coupling Rules](#7-component-architecture--coupling-rules)
8. [Data Architecture & Schema Contracts](#8-data-architecture--schema-contracts)
9. [Risk Scoring Engine Design](#9-risk-scoring-engine-design)
10. [The Offline Pipeline (Pipes & Filters Pattern)](#10-the-offline-pipeline-pipes--filters-pattern)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Git Workflow & Branch Strategy](#12-git-workflow--branch-strategy)
13. [Phased Build Plan with Ownership](#13-phased-build-plan-with-ownership)
14. [Architecture Decision Records (ADRs)](#14-architecture-decision-records-adrs)

---

## 1. Architectural Thinking: The Foundation

> *"Everything in software architecture is a trade-off."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 1

> *"There are no right or wrong answers in architecture — only trade-offs."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 2

This architecture was designed by applying the core method taught in both books:

1. **Identify domain concerns**: What is the actual problem this system solves?
2. **Translate concerns to "-ilities"**: Which architecture characteristics matter most?
3. **Evaluate styles against those characteristics**: Which style satisfies the most critical ones at lowest cost?
4. **Document decisions and trade-offs**: ADRs (Architecture Decision Records) capture every non-obvious choice.

**Our domain concern**: Help mission planners and researchers assess whether candidate lunar landing sites are safe for a given arrival date — by combining terrain hazard data with solar illumination and Earth communication ephemeris, presented as a transparent, explainable Green / Yellow / Red classification on an interactive 3D map.

**The critical constraint**: Build it, deploy it, and demonstrate it within **48 hours** with a team of 4 people having diverse skill levels.

---

## 2. Architecture Characteristics (The "-ilities")

> *"Architecture characteristics... define the capabilities of a system — not what it does, but how well it does it."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 4

Using Table 5-1 of Fundamentals of Software Architecture 2E, we translate the domain concern of this project into measurable architectural characteristics:

| Domain Concern | Architecture Characteristic | Priority |
| :--- | :--- | :--- |
| **Time to market (48-hour hackathon)** | Agility, Deployability, Simplicity | 🔴 Critical |
| **Demo reliability (judges open the URL)** | Availability, Reliability, Fault Tolerance | 🔴 Critical |
| **Scientific transparency (explainable scoring)** | Testability, Correctness | 🟠 High |
| **Compelling visual experience** | Performance, Responsiveness | 🟠 High |
| **Hackathon budget (free tier only)** | Feasibility, Cost | 🟠 High |
| **Future extensibility (custom coordinates, multi-lander)** | Evolvability, Modularity | 🟡 Medium |
| **Concurrent user load** | Scalability, Elasticity | 🟢 Low (5-site static data, not a production API) |

**The two most critical characteristics for our context are: Deployability and Reliability.**

A system that crashes when a judge clicks the URL scores zero — regardless of how sophisticated its backend architecture is.

---

## 3. Style Evaluation: Why Not Microservices, Go, or a Distributed Backend

### 3.1 Why Not Microservices

> *"The microservices architecture style provides better scalability, agility, elasticity, and fault tolerance. However, this choice doesn't perform well due to service coupling."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 9

> *"The network is not reliable... The more a system relies on the network (as microservices architectures notably do), the more potential it has to become unreliable."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Fallacy #1

Microservices require:
- Independent deployment pipelines for each service
- Network calls between services (Fallacy #1: network unreliability; Fallacy #2: latency is not zero)
- Service discovery, circuit breakers, health checks
- Containers, orchestration, or cloud functions

For **5 static candidate sites with pre-computed datasets** in a **48-hour hackathon**, microservices introduce pure **accidental complexity** — complexity that serves the architecture, not the domain.

| Characteristic | Microservices Score | Our Need |
| :--- | :--- | :--- |
| Reliability | ⭐⭐ (network dependencies multiply failure modes) | 🔴 Critical |
| Deployability | ⭐⭐ (each service needs its own deployment) | 🔴 Critical |
| Simplicity | ⭐ (highest complexity of all styles) | 🔴 Critical |
| Scalability | ⭐⭐⭐⭐⭐ (excellent) | 🟢 Low priority |

**Verdict**: Microservices optimize for what we don't need and penalize what we do.

### 3.2 Why Not Go as the Primary Stack

Go is an excellent systems programming language. But the question is not "is Go good?" — it is "does Go serve this problem's essential complexity?"

The essential complexity of this project is:
- **Rendering a 3D planetary sphere** in a browser → Requires WebGL/WebGPU (JavaScript-only domain)
- **Scientific planetary data processing** (ephemeris, GeoTIFF, slope computation) → Python has the NASA/SPICE tooling ecosystem
- **Interactive UI** (date slider, risk panels, comparison tables) → React ecosystem

Go's core strengths are:
- Sub-millisecond HTTP handling at high concurrency (not needed; 5 static sites, pre-computed data)
- Low-memory binary deployment (not needed; Vercel handles static files)
- Systems-level concurrency (not needed; no real-time computation in the critical user path)

**Where Go genuinely belongs in this architecture (if time allows in Phase 2+):**
A Go micro-service that accepts an arbitrary `{lat, lon}` and performs a concurrent raster scan across a LOLA grid tile — returning a slope variance heat-map for custom landing ellipses. This is a **legitimate, high-value use** of Go's goroutine-based parallel computation. It is scoped to Phase 2 as a non-critical enhancement.

### 3.3 Why Not Python FastAPI Backend

Same analysis applies. A Python backend:
- Needs a persistent server process (dyno, container, or serverless cold start)
- Has cold start latency on Render/Railway free tiers (up to 30–60 seconds)
- Crashes if Gunicorn runs out of memory on a free tier during the demo
- Adds a network hop in the critical user interaction path

Python belongs in the **offline data pipeline** (one-time execution), not in the runtime architecture.

---

## 4. Chosen Architecture Style: Modular Monolith + Pipeline Data Layer

### 4.1 The Modular Monolith (Runtime: Web Client)

> *"The modular monolith architecture style is partitioned around domains or workflows. The microservices architecture style is based on [the same principle]."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 9

> *"[The modular monolith was] popularized by Simon Brown... A modular monolith architecture is partitioned around domains or workflows, with strong module boundaries."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 9

The web application is a **modular monolith** deployed as a single static bundle to Vercel. It is internally partitioned into strongly-bounded domain modules (Globe, Dashboard, RiskEngine, SkyPlot, Comparison) with explicit, enforced data contracts between them. This gives us:

| Characteristic | Modular Monolith Rating | Why It Fits |
| :--- | :--- | :--- |
| **Simplicity** | ⭐⭐⭐⭐⭐ | Single deployment, no network between modules |
| **Deployability** | ⭐⭐⭐⭐⭐ | One `vercel deploy` → live URL in 30 seconds |
| **Reliability** | ⭐⭐⭐⭐⭐ | No runtime network dependencies (static files) |
| **Testability** | ⭐⭐⭐⭐ | Each module tested in isolation with mocked contracts |
| **Modularity** | ⭐⭐⭐⭐ | Strong domain boundaries prevent spaghetti coupling |
| **Evolvability** | ⭐⭐⭐⭐ | Can extract any module to a service later if needed |

### 4.2 The Pipeline Architecture (Offline: Data Preparation)

> *"The pipeline architecture (also known as pipes and filters architecture)... The topology consists of two main component types: pipes and filters. Filters contain the system functionality and perform a specific business function, and pipes transfer data to the next filter."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 12

The offline data preparation system uses the **Pipes & Filters** pattern perfectly:

```
[Producer Filter]        [Transformer Filter]      [Transformer Filter]     [Consumer Filter]
  JPL Horizons API   →   Parse & normalize       →   Compute G/Y/R        →   Write final JSON
  Moon Trek API      →   ephemeris + terrain          thresholds               to client/data/
```

Each filter performs exactly one responsibility. Pipes are unidirectional. The output is a versioned, committed JSON artifact that the web client consumes at runtime — eliminating all network dependencies from the production path.

### 4.3 The Complete Two-Layer System

```
╔════════════════════════════════════════════════════════════════════════╗
║          LAYER 1: OFFLINE DATA PIPELINE (Python, one-time run)        ║
║                                                                        ║
║  [JPL Horizons] ──pipe──▶ [fetch_ephemeris.py] ──pipe──▶ [raw JSON]   ║
║  [Moon Trek]    ──pipe──▶ [extract_terrain.py] ──pipe──▶ [raw JSON]   ║
║                                 │                                      ║
║                     [merge_site_data.py] ──pipe──▶ [Final JSONs]       ║
║                                 │                                      ║
║                     ┌───────────▼───────────┐                          ║
║                     │  client/src/data/*.json│  (committed to Git)      ║
║                     └───────────────────────┘                          ║
╚════════════════════════════════════════════════════════════════════════╝
                                  │
                    (Build-time static asset bundling)
                                  │
╔════════════════════════════════════════════════════════════════════════╗
║        LAYER 2: MODULAR MONOLITH (TypeScript/React, Vite bundle)       ║
║                                                                        ║
║  ┌────────────┐  ┌─────────────┐  ┌───────────────┐  ┌────────────┐   ║
║  │   GLOBE    │  │  DASHBOARD  │  │  RISK ENGINE  │  │  SKY PLOT  │   ║
║  │  Module    │  │  Module     │  │  Module       │  │  Module    │   ║
║  │            │  │             │  │               │  │            │   ║
║  │ CesiumJS   │  │ DateSlider  │  │ 4 Evaluators  │  │ Recharts   │   ║
║  │ 3D Lunar   │◀─│ SiteSelector│─▶│ Composite     │─▶│ Sun/Earth  │   ║
║  │ Globe      │  │ WorkflowToggle│ │ Scorer        │  │ Horizon    │   ║
║  └────────────┘  └─────────────┘  └───────────────┘  └────────────┘   ║
║         │               │                │                 │            ║
║         └───────────────┴────────────────┴─────────────────┘           ║
║                                  │                                      ║
║                     ┌────────────▼────────────┐                         ║
║                     │  Shared Context Layer    │                         ║
║                     │  (SiteContext,           │                         ║
║                     │   DateContext,           │                         ║
║                     │   ModeContext)           │                         ║
║                     └────────────┬────────────┘                         ║
║                                  │                                      ║
║                     ┌────────────▼────────────┐                         ║
║                     │  Static JSON Data Layer  │                         ║
║                     │  candidate_sites.json    │                         ║
║                     │  ephemeris/{site_id}.json│                         ║
║                     │  risk_thresholds.json    │                         ║
║                     └─────────────────────────┘                         ║
║                                                                        ║
║  Deployed to: Vercel (static CDN, zero server, 100% uptime guarantee)  ║
╚════════════════════════════════════════════════════════════════════════╝
```

---

## 5. Complete Directory Structure

```
to-land-or-not-to-land-/
│
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md         # PR checklist for contributors
│
├── docs/                                # Non-code: science, decisions, meeting notes
│   ├── candidate_sites.md               # Lauri's doc: 5 sites, coordinates, descriptions
│   ├── risk_methodology.md              # Scoring thresholds + scientific justification
│   ├── data_sources.md                  # All NASA API links + pipeline status
│   ├── meeting_notes/
│   │   └── 2026-11-14_kickoff.md
│   └── assets/                          # Wireframes, diagrams (Figma exports)
│
├── scripts/                             # OFFLINE ONLY: Python data pipeline
│   ├── README.md                        # Pipeline setup + run instructions
│   ├── requirements.txt                 # astroquery, requests, numpy, pandas
│   ├── fetch_ephemeris.py               # Filter 1: JPL Horizons → raw ephemeris JSON
│   ├── extract_terrain.py               # Filter 2: Moon Trek API → slope + roughness JSON
│   ├── merge_site_data.py               # Filter 3: merge + compute → final client JSON
│   └── output/
│       └── .gitkeep                     # Pipeline raw output (gitignored except final JSONs)
│
├── client/                              # THE WEB APPLICATION (Modular Monolith)
│   ├── index.html                       # Vite entry point
│   ├── package.json
│   ├── tsconfig.json                    # TypeScript strict mode
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   │
│   ├── public/                          # Static assets served as-is
│   │   ├── favicon.ico
│   │   └── textures/
│   │       └── moon_8k.jpg              # Lunar surface basemap texture
│   │
│   └── src/
│       ├── main.tsx                     # React DOM root
│       ├── App.tsx                      # Layout orchestration
│       │
│       ├── types/                       # Shared TypeScript contracts (the "pipes")
│       │   ├── site.ts                  # CandidateSite, Coordinates, TerrainMetrics
│       │   ├── risk.ts                  # RiskLevel, RiskFactor, RiskAssessment
│       │   ├── ephemeris.ts             # EphemerisEntry, SunEarthAngles
│       │   └── index.ts                 # Barrel re-export
│       │
│       ├── data/                        # Pre-computed static JSON (pipeline output)
│       │   ├── candidate_sites.json     # Site coordinates + terrain metrics
│       │   ├── risk_thresholds.json     # Configurable scoring rules
│       │   └── ephemeris/              # Per-site time series
│       │       ├── shackleton_rim.json
│       │       ├── malapert_mountain.json
│       │       ├── nobile_crater.json
│       │       ├── mare_tranquillitatis.json
│       │       └── connecting_ridge.json
│       │
│       ├── engine/                      # RISK ENGINE MODULE (pure functions, zero side effects)
│       │   ├── slopeEvaluator.ts        # slope_deg + thresholds → RiskFactor
│       │   ├── roughnessEvaluator.ts    # roughness_class + thresholds → RiskFactor
│       │   ├── illuminationEvaluator.ts # solar_pct + thresholds → RiskFactor
│       │   ├── losEvaluator.ts          # earth_elevation + thresholds → RiskFactor
│       │   ├── compositeScorer.ts       # RiskFactor[] → overall RiskAssessment
│       │   ├── riskCalculator.ts        # Public API: calculate(site, date) → RiskAssessment
│       │   └── __tests__/
│       │       ├── evaluators.test.ts
│       │       └── compositeScorer.test.ts
│       │
│       ├── hooks/                       # React integration hooks (stateful bridge to engine)
│       │   ├── useSiteData.ts           # Load + cache candidate_sites.json
│       │   ├── useEphemeris.ts          # Load + interpolate per-site ephemeris for a date
│       │   ├── useRiskAssessment.ts     # Derives RiskAssessment from site + date context
│       │   └── useDateSlider.ts         # Date slider state + bounds
│       │
│       ├── context/                     # Global app state (React Context)
│       │   ├── SiteContext.tsx          # Currently selected site ID
│       │   ├── DateContext.tsx          # Currently selected date/time
│       │   └── ModeContext.tsx          # Date-First vs Site-First workflow mode
│       │
│       ├── components/                  # UI MODULES (each is a bounded domain)
│       │   │
│       │   ├── Globe/                   # 3D GLOBE MODULE (Ethan)
│       │   │   ├── LunarGlobe.tsx       # CesiumJS viewer, Moon ellipsoid, tile layers
│       │   │   ├── SitePin.tsx          # G/Y/R glowing billboard entity per site
│       │   │   ├── GlobeControls.tsx    # Fly-to, zoom, reset camera controls
│       │   │   └── Globe.module.css
│       │   │
│       │   ├── Dashboard/              # CONTROL MODULE (Rishika)
│       │   │   ├── DateTimeSlider.tsx   # Date/time scrubber → updates DateContext
│       │   │   ├── SiteSelector.tsx     # Site list → updates SiteContext
│       │   │   ├── WorkflowToggle.tsx   # Date-First ↔ Site-First switch → ModeContext
│       │   │   └── Dashboard.module.css
│       │   │
│       │   ├── RiskPanel/              # RISK DISPLAY MODULE (Rishika)
│       │   │   ├── RiskStatusBadge.tsx  # Large GO / CAUTION / NO-GO badge
│       │   │   ├── FactorBreakdown.tsx  # 4-row: Slope, Roughness, Illumination, LOS
│       │   │   ├── StatusReason.tsx     # Plain-English explanation string
│       │   │   └── RiskPanel.module.css
│       │   │
│       │   ├── SkyPlot/               # HORIZON PLOT MODULE (Rishika)
│       │   │   ├── HorizonPlot.tsx      # Recharts: Sun/Earth elevation angles vs time
│       │   │   ├── CountdownTimers.tsx  # "Time until Sunset" + "Comms Window Close"
│       │   │   └── SkyPlot.module.css
│       │   │
│       │   ├── Comparison/            # COMPARISON MODULE — Phase 2 (Rishika)
│       │   │   ├── ComparisonTable.tsx  # Side-by-side multi-site comparison grid
│       │   │   └── Comparison.module.css
│       │   │
│       │   └── Layout/                # SHELL MODULE (Adesh)
│       │       ├── Header.tsx           # App title, mode toggle, team credit
│       │       ├── Sidebar.tsx          # Left panel container
│       │       ├── Footer.tsx           # NASA attribution + data source credits
│       │       └── Layout.module.css
│       │
│       └── utils/                       # Shared utilities (no business logic)
│           ├── dateHelpers.ts           # Lunar day math, ISO date formatting
│           ├── coordinateHelpers.ts     # Lat/Lon conversions, selenographic transforms
│           └── constants.ts            # Moon radius (1737.4 km), color tokens, defaults
│
├── ARCHITECTURE.md                      # THIS FILE
├── README.md                            # Project overview, quickstart, team credits
├── LICENSE                              # Apache 2.0 License
└── .gitignore                           # Node + Python + OS + GIS binary exclusions
```

---

## 6. Technology Stack with Full Justification

> *"Choosing the wrong language for the domain creates accidental complexity — complexity that serves the technology stack rather than the problem."*
> — Principle derived from Brooks, **The Mythical Man-Month**, via Richards & Ford

### 6.1 Stack Decision Table

| Layer | Technology | Justification | Trade-off Accepted |
| :--- | :--- | :--- | :--- |
| **Language (Client)** | **TypeScript** (strict) | Type-safe contracts between modules prevent data schema mismatch bugs at compile time, not runtime. This is especially important when the team works in parallel on separate modules that share the same `RiskAssessment` and `EphemerisEntry` interfaces. | Slight verbosity vs. plain JS. Worth it at team size of 4. |
| **UI Framework** | **React 18** | Component model aligns perfectly with the modular monolith's bounded domain modules. Massive ecosystem. `useContext` + custom hooks are sufficient state management for this scope (no Redux needed). | Bundle size slightly larger than SolidJS. Acceptable. |
| **Build Tool** | **Vite** | Sub-100ms hot module reload. Zero config for React + TypeScript. Produces an optimized, tree-shaken static build in `dist/` for Vercel. | Minimal — Vite is the industry standard for this stack. |
| **Styling** | **Tailwind CSS** | Utility-first → no CSS file sprawl in a 48-hour sprint. Dark "space UI" aesthetic is trivial: `bg-slate-950 text-white`. Responsive layouts without writing breakpoint media queries manually. | No semantic CSS class names (a minor code readability concern). |
| **3D Globe** | **CesiumJS** | Purpose-built for planetary and geospatial 3D visualization. Natively supports custom ellipsoids (Moon: `1737.4 km`). Loads NASA Moon Trek WMTS tiles directly via `ImageryLayer`. Used by NASA, ESA, and USGS in production systems. | Heavy bundle size (~2.5 MB gzipped). Mitigated by lazy loading the globe component. |
| **2D Charts** | **Recharts** | Lightweight React-native chart library. Composable `LineChart` + `ReferenceLine` for rendering Sun/Earth elevation angles vs. time on the horizon plot. | Less powerful than D3 for custom projections, but sufficient for our horizon plot. |
| **Data Pipeline Language** | **Python 3.10+** | `astroquery.jplhorizons` is the canonical open-source Python interface to the JPL Horizons ephemeris system. `rasterio` and `numpy` handle GeoTIFF slope extraction. No equivalent Go library exists. | Python is offline-only; it never touches the production web app. |
| **Deployment** | **Vercel** | Zero-config static site hosting from a GitHub repo. Automatic HTTPS. CDN edge distribution. Free tier is sufficient. 100% uptime for static files. No cold starts. | Zero control over infrastructure — but we don't need it. |

### 6.2 What We Are Explicitly NOT Using — and Why

| Excluded Technology | Reason |
| :--- | :--- |
| **Go (Golang) — Runtime** | Go provides goroutine-based concurrency and low-latency HTTP. We don't need concurrent computation in the user-facing request path. Data is pre-computed. If introduced prematurely, Go adds: a persistent server, container deployment, cold-start risk, TLS config, and CORS headers. All accidental complexity for a 5-site, 48-hour hackathon product. |
| **Microservices** | Per Richards & Ford Ch. 9: microservices optimize for scalability, elasticity, and deployability-per-service at the cost of operational complexity and network reliability. We need exactly the opposite trade-off. |
| **Backend Server (Node / Python FastAPI)** | Render/Railway/Fly.io free tiers have 30–60 second cold start times. A backend crash = demo failure. Zero backend = zero failure modes in the production path. |
| **Redux / Zustand** | Overkill. React Context + custom hooks handles state for 5 sites + a date slider without global state manager overhead. |
| **Docker / Kubernetes** | Maximum accidental complexity for a static site. Vercel does container orchestration implicitly. |
| **ML / AI Scoring Model** | Judges cannot verify a black-box model. Rule-based thresholds are scientifically defensible, auditable, and explainable — a core requirement of the product's value proposition. |

---

## 7. Component Architecture & Coupling Rules

> *"Cohesion refers to the extent to which a module's parts should be contained within the same module. The goal is to have high cohesion and low coupling."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 3

> *"Logical components are the building blocks of a system... A logical component should always have a well-defined role and responsibility."*
> — Gandhi, Richards & Ford, **Head First Software Architecture**, Chapter 3

### 7.1 Module Coupling Diagram

```
                    ┌─────────────────────┐
                    │   Shared Types      │
                    │   (types/index.ts)  │
                    │   RiskAssessment    │
                    │   CandidateSite     │
                    │   EphemerisEntry    │
                    └──────────┬──────────┘
                               │ (All modules depend downward on types — never on each other)
              ┌────────────────┼──────────────────┐
              ▼                ▼                   ▼
      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
      │  RISK ENGINE  │ │    HOOKS      │ │  DATA LAYER   │
      │  (pure TS)    │ │  (React glue) │ │  (static JSON)│
      │               │ │               │ │               │
      │ No React.     │ │ Calls engine. │ │ No logic.     │
      │ No I/O.       │ │ Loads data.   │ │ Pure data.    │
      │ No side effects│ │ Manages state.│ │               │
      └───────┬───────┘ └───────┬───────┘ └───────────────┘
              └────────────────┬┘
                               ▼
              ┌────────────────────────────────┐
              │        CONTEXT LAYER           │
              │  SiteContext / DateContext /   │
              │  ModeContext                   │
              └────────────────┬───────────────┘
                               ▼
        ┌──────────────────────────────────────────┐
        │              UI MODULES                   │
        │  Globe ─── Dashboard ─── RiskPanel ───   │
        │  SkyPlot ─── Comparison ─── Layout       │
        │                                           │
        │  Each module reads from Context.          │
        │  Modules do NOT import each other.        │
        └──────────────────────────────────────────┘
```

### 7.2 Coupling Rules (Enforced by Code Review)

| Rule | Rationale |
| :--- | :--- |
| UI modules never import each other directly | Prevents accidental coupling between Globe and RiskPanel. All shared state flows through Context. |
| Risk Engine has zero React imports | The engine is a pure TypeScript library. It can be unit-tested without mounting any component. |
| Data layer is read-only | No module writes to the JSON data files at runtime. Data flows one direction only: file → hook → context → UI. |
| All cross-module contracts are defined in `types/` | The `types/` directory is the shared "pipe" in the pipes-and-filters sense — changing a type here forces all consuming modules to reconcile. |

---

## 8. Data Architecture & Schema Contracts

### 8.1 `CandidateSite` Interface

```typescript
// types/site.ts
export interface CandidateSite {
  id: string;
  name: string;
  region: string;
  coordinates: {
    latitude: number;    // Selenographic (-90 to +90)
    longitude: number;   // Selenographic (0 to 360)
    elevation_m: number; // Relative to mean lunar sphere
  };
  description: string;
  terrain: {
    slope_deg: number;
    roughness: 'LOW' | 'MODERATE' | 'HIGH';
    roughness_detail: string;
    data_source: string;
  };
}
```

### 8.2 `EphemerisEntry` Interface

```typescript
// types/ephemeris.ts
export interface EphemerisEntry {
  datetime_utc: string;        // ISO 8601
  sun_elevation_deg: number;   // Positive = above horizon
  earth_elevation_deg: number;
  solar_illumination_pct: number;
  earth_los: boolean;
}
```

### 8.3 `RiskAssessment` Interface

```typescript
// types/risk.ts
export type RiskLevel = 'GREEN' | 'YELLOW' | 'RED';

export interface RiskFactor {
  name: string;
  value: string;
  level: RiskLevel;
  explanation: string;
}

export interface RiskAssessment {
  site_id: string;
  date: string;
  overall_status: RiskLevel;
  overall_reason: string;
  factors: RiskFactor[];  // Always exactly 4: slope, roughness, illumination, LOS
}
```

### 8.4 Data Flow Direction (Always One-Way)

```
JSON files → useSiteData / useEphemeris hooks
           → useRiskAssessment (derives RiskAssessment via engine)
           → Context (SiteContext, DateContext)
           → UI Components (Globe, RiskPanel, SkyPlot)
```

No data ever flows backwards through this chain.

---

## 9. Risk Scoring Engine Design

### 9.1 Individual Factor Evaluators (Pure Functions)

Each evaluator takes a numeric value and a thresholds config, returns a `RiskFactor`. They are **completely stateless and side-effect-free** — testable in isolation with no mocks:

```typescript
// engine/slopeEvaluator.ts
export function evaluateSlope(slope_deg: number, thresholds: SlopeThresholds): RiskFactor {
  const level: RiskLevel =
    slope_deg < thresholds.green_max ? 'GREEN' :
    slope_deg < thresholds.yellow_max ? 'YELLOW' : 'RED';

  return {
    name: 'Terrain Slope',
    value: `${slope_deg.toFixed(1)}°`,
    level,
    explanation:
      level === 'GREEN' ? `Safe: ${slope_deg.toFixed(1)}° is within lander tilt tolerance (<${thresholds.green_max}°)` :
      level === 'YELLOW' ? `Caution: ${slope_deg.toFixed(1)}° requires careful touchdown targeting` :
      `No-Go: ${slope_deg.toFixed(1)}° exceeds safe tilt margin — high tip-over risk`
  };
}
```

### 9.2 Composite Scorer

```typescript
// engine/compositeScorer.ts
// Implements: IF any RED → RED; ELIF any YELLOW → YELLOW; ELSE GREEN
export function computeOverallStatus(factors: RiskFactor[]): { overall_status: RiskLevel; overall_reason: string } {
  const redFactor = factors.find(f => f.level === 'RED');
  const yellowFactor = factors.find(f => f.level === 'YELLOW');

  if (redFactor) {
    return { overall_status: 'RED', overall_reason: `No-Go: ${redFactor.name} exceeds safe operational limits` };
  }
  if (yellowFactor) {
    return { overall_status: 'YELLOW', overall_reason: `Caution: ${yellowFactor.name} requires mitigation or relay support` };
  }
  return { overall_status: 'GREEN', overall_reason: 'Go: All factors within safe operational limits' };
}
```

### 9.3 Configurable Thresholds (`risk_thresholds.json`)

Thresholds are externalised so Lauri can adjust them without touching code:

```json
{
  "slope": { "green_max_deg": 5, "yellow_max_deg": 15 },
  "roughness": { "green": "LOW", "yellow": "MODERATE", "red": "HIGH" },
  "illumination": { "green_min_pct": 70, "yellow_min_pct": 30 },
  "earth_los": { "green_min_elevation_deg": 5, "yellow_min_elevation_deg": 0 }
}
```

---

## 10. The Offline Pipeline (Pipes & Filters Pattern)

```
Step 1: fetch_ephemeris.py    (Producer + Transformer Filter)
  ↳ Queries JPL Horizons for each of the 5 sites
  ↳ Date range: Nov 1 – Dec 31, 2026 (±6 weeks around hackathon)
  ↳ Outputs: scripts/output/ephemeris_raw/{site_id}.json

Step 2: extract_terrain.py    (Transformer Filter)
  ↳ Queries NASA Moon Trek elevation profile API for each site
  ↳ Derives slope_deg and roughness_class
  ↳ Outputs: scripts/output/terrain_raw/{site_id}.json

Step 3: merge_site_data.py    (Transformer + Consumer Filter)
  ↳ Merges terrain + ephemeris
  ↳ Applies risk_thresholds to pre-compute G/Y/R for the full date range
  ↳ Outputs:
      → client/src/data/candidate_sites.json
      → client/src/data/ephemeris/{site_id}.json
```

**Fallback Protocol**: If JPL Horizons or Moon Trek APIs are unreachable during the hackathon, manually curated values from published NASA/LPI South Pole illumination studies are used and documented in `docs/data_sources.md`.

---

## 11. Deployment Architecture

```
GitHub (main branch)
       │
       └─▶ Vercel (auto-deploy on merge)
                │
                ├── Build command:  cd client && npm run build
                ├── Output dir:     client/dist
                └── Live URL:       https://to-land-or-not-to-land.vercel.app
```

**Deployment Checklist (Phase 3)**:
- [ ] Connect GitHub repo to Vercel (one-click import)
- [ ] Set root to `client/`, build command `npm run build`, output `dist`
- [ ] Verify 3D globe loads without errors on live URL
- [ ] Include live URL in NASA Space Apps submission form

---

## 12. Git Workflow & Branch Strategy

> *"Architecture decisions form the constraints of the system and direct the development teams."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 1

### Branch Model

```
main (protected — always deployable)
├── feature/scoring-engine        → Adesh
├── feature/ephemeris-pipeline    → Adesh
├── feature/cesium-globe          → Ethan
├── feature/cesium-site-pins      → Ethan
├── feature/risk-panel            → Rishika
├── feature/date-slider           → Rishika
├── docs/candidate-sites          → Lauri
└── docs/risk-criteria-update     → Lauri
```

### Rules

| Rule | Detail |
| :--- | :--- |
| No direct commits to `main` | All code enters via PRs reviewed by Adesh |
| Commit format | `type: description` — `feat:`, `fix:`, `docs:`, `test:`, `chore:` |
| PR requires build passing | `npm run build` must succeed before merge |
| No binary data files committed | `.tif`, `.dem`, `.hdf5`, `.zip` are gitignored |

---

## 13. Phased Build Plan with Ownership

### Phase 0 ✅: Pre-Hackathon (Allowed — Non-Code Research)

| Task | Owner | Status |
| :--- | :--- | :--- |
| Lock Green/Yellow/Red thresholds | Adesh + Lauri | ✅ Done |
| Write architecture document | Adesh | ✅ Done |
| Verify 5 candidate site coordinates | **Lauri** | ☐ In Progress |
| Write scientific description per site | **Lauri** | ☐ To Do |
| Low-fidelity UI wireframes | Rishika + Ethan | ☐ To Do |
| Review Moon Trek API + JPL Horizons | Adesh | ☐ In Progress |

### Phase 1 (Hours 0–16): Working MVP

| Task | Owner |
| :--- | :--- |
| Initialize Vite + React + TypeScript scaffold in `client/` | **Adesh** |
| Run offline data pipeline + commit output JSONs | **Adesh** |
| Implement 4 risk evaluators + composite scorer + unit tests | **Adesh** |
| Wire scoring engine to `useRiskAssessment` hook | **Adesh** |
| Build app shell, context providers, layout | **Adesh** |
| Render CesiumJS 3D Moon with NASA Moon Trek tiles | **Ethan + Adesh** |
| Add 5 clickable G/Y/R glowing site pins on the globe | **Ethan** |
| Build `DateTimeSlider` component | **Rishika** |
| Build `SiteSelector` list component | **Rishika** |
| Build `RiskStatusBadge` + `FactorBreakdown` panel | **Rishika** |
| Wire everything: slider → engine → panel → globe pins | **Adesh** |
| Deploy working build to Vercel | **Adesh** |

### Phase 2 (Hours 16–34): High-Impact Visuals

| Task | Owner |
| :--- | :--- |
| Add `HorizonPlot` (Sun/Earth angle Recharts line chart) | **Rishika** |
| Add `CountdownTimers` (until Sunset / Earthset) | **Adesh + Rishika** |
| Add pre-rendered PSR shadow overlay from Moon Trek | **Ethan** |
| Add site fly-to animations on pin click | **Ethan** |
| Build `ComparisonTable` (side-by-side multi-site view) | **Rishika** |
| Add "What-If" demo presets (Launch Slip, Shadow Trap) | **Adesh** |
| Add `WorkflowToggle` (Date-First ↔ Site-First mode) | **Rishika** |

### Phase 3 (Hours 34–48): Polish, Pitch, Submit

| Task | Owner |
| :--- | :--- |
| Mission Planner vs. Educator mode toggle | Rishika + Lauri |
| Dark space theme polish, loading states, animations | Rishika + Ethan |
| Final README with live URL + screenshots | Adesh |
| Record 2–3 minute demo video | **Lauri** (leads) |
| Create pitch deck (5–8 slides) | **Lauri** |
| Submit on NASA Space Apps portal | Lauri + Adesh |
| Final Vercel deployment + live URL verification | **Adesh** |

---

## 14. Architecture Decision Records (ADRs)

> *"Architecture decisions are rules for constructing systems... Capturing the context of why a decision was made — not just what was decided — is essential for the longevity of the architecture."*
> — Richards & Ford, **Fundamentals of Software Architecture 2E**, Chapter 1

### ADR-001: Modular Monolith over Microservices
- **Date**: 2026-11-14
- **Status**: Accepted
- **Context**: 48-hour hackathon, 5 static sites, 4-person team, judges require a live URL.
- **Decision**: Single static deployment (modular monolith) on Vercel.
- **Consequence**: Zero network dependencies in the production path. No server crashes. Bundle size is bounded at ~3 MB gzipped.

### ADR-002: Pre-Computed Static JSON over Live API Calls
- **Date**: 2026-11-14
- **Status**: Accepted
- **Context**: JPL Horizons and Moon Trek APIs may have rate limits, latency, or downtime during judging.
- **Decision**: All ephemeris and terrain data is pre-computed offline and committed to `client/src/data/`.
- **Consequence**: The demo works offline. Date slider interpolation is instantaneous.

### ADR-003: Python for Data Pipeline, TypeScript for Application
- **Date**: 2026-11-14
- **Status**: Accepted
- **Context**: Python has the best planetary science library ecosystem (`astroquery`, `rasterio`). TypeScript provides compile-time safety for the shared data contracts between modules.
- **Decision**: Python is offline only. TypeScript is the runtime application language.
- **Consequence**: No Python runtime in the web application. Clean separation of concerns.

### ADR-004: CesiumJS for 3D Globe
- **Date**: 2026-11-14
- **Status**: Accepted
- **Context**: CesiumJS natively supports custom planetary ellipsoids, NASA Moon Trek WMTS tile services, and accurate 3D terrain rendering. Alternatives (Three.js, Babylon.js) require custom implementation of everything CesiumJS provides out of the box.
- **Decision**: CesiumJS with the Moon's ellipsoid (1,737.4 km radius) and NASA Moon Trek imagery layers.
- **Consequence**: Large initial bundle (~2.5 MB). Mitigated by lazy loading.

### ADR-005: Apache 2.0 License
- **Date**: 2026-11-14
- **Status**: Accepted
- **Context**: NASA Space Apps Challenge requires open-source submissions. Apache 2.0 is an OSI-approved, permissive open-source license that provides explicit patent grant protections, broad commercial and academic usability, and clean compatibility with our dependencies.
- **Decision**: Apache License 2.0.
- **Consequence**: Any person or organisation may use, modify, and distribute the code with attribution.

---

*This architecture document is a living record. All pivots, API decisions, and scope changes must be logged in the Decision & Change Log (see `docs/PROJECT_MASTER_PLAN.md`).*

---
**Authored by**: Adesh Deshmukh
**Reference texts**: *Fundamentals of Software Architecture 2E* (Richards & Ford, O'Reilly 2024) + *Head First Software Architecture* (Gandhi, Richards & Ford, O'Reilly 2024)

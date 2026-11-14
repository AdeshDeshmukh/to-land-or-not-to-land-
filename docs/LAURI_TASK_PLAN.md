# 🚀 Agent Task & Execution Plan: Product, Science & Content Lead (Lauri)

> **Role**: Product Lead & Planetary Science Strategist (Lauri Salonen)  
> **Repository**: [https://github.com/AdeshDeshmukh/to-land-or-not-to-land-](https://github.com/AdeshDeshmukh/to-land-or-not-to-land-)  
> **Reviewer & Tech Lead**: Adesh Deshmukh  
> **Target Branch**: `main` (via Feature Pull Requests)

---

## 🎯 Executive Context for the Agent

You are acting as the AI copilot for **Lauri Salonen**, the Product Lead & Idea Originator for **"To Land or Not to Land"** in the **2026 NASA Space Apps Challenge**. 

**Technical Ownership Split**:
* **Adesh (Tech Lead)**: Manages the runtime architecture, React + TypeScript web application, CesiumJS 3D lunar globe, and the core scoring engine.
* **Lauri (Product / Science Lead)**: Manages domain accuracy, lunar site coordinate validation, scientific UI copywriting, presentation deck, and demo script.

Your goal right now is to execute **Sprint 1 (PR #1: Candidate Site Verification & Science Copy)** and prepare the materials for the pitch.

---

## 📋 Sprint 1 Deliverables (For Your First Pull Request)

### 1. Git Workflow
Follow this exact branch and commit convention:
```bash
# 1. Ensure you are on the latest main branch
git checkout main
git pull origin main

# 2. Create your dedicated task branch
git checkout -b docs/candidate-sites-update
```

---

### 2. Task Details: Update `docs/candidate_sites.md`

Open the existing file `docs/candidate_sites.md` in your local clone and complete the following 4 sections:

#### A. Coordinate & Elevation Verification
Cross-reference and verify the 5 target coordinates with NASA / LPI Artemis candidate documentation:
1. **Shackleton Crater Rim** (South Pole): Confirm latitude, longitude, and rim elevation.
2. **Malapert Mountain** (South Pole): Confirm summit coordinates (known for high Earth visibility).
3. **Nobile Crater Region** (South Pole): Confirm coordinates near permanently shadowed craters (VIPER candidate site).
4. **Mare Tranquillitatis** (Equatorial baseline - Apollo 11): Flat reference site (~0.67° N, 23.47° E).
5. **Connecting Ridge / Peak Near Shackleton**: ⚠️ **CRITICAL CHECK**: Verify the longitude format. It is currently recorded as `222.70° E`. Standardize it to standard selenographic coordinates (either 0°–360° East or -180° to +180° format) and note the exact reference used.

#### B. UI Science Copywriting (Displayed on Web App Cards)
For each of the 5 sites, provide a clean JSON-ready markdown section with:
* **Display Name**: Clean, recognizable site title.
* **Why NASA Wants to Land Here**: 2–3 sentences explaining scientific value (e.g. volatile/water-ice trapping, continuous sunlight on crater rims, solar power viability).
* **Key Hazards / Operational Constraints**: 1–2 sentences explaining the main risk (e.g. slope exceeding lander tilt limit, extreme thermal drops, loss of direct-to-Earth radio line-of-sight).

#### C. Risk Rationale Validation
Confirm that each site matches its intended demonstration purpose:
* 🟢 **Mare Tranquillitatis**: Natural GREEN baseline (flat basaltic plain).
* 🟢 / 🟡 **Shackleton Rim / Malapert**: High illumination targets (GREEN for sun, but steep slopes nearby require caution).
* 🔴 **Nobile Crater Floor**: Natural RED hazard zone (deep shadow, communication blackouts).

---

### 3. Submission: Open Pull Request #1
Once you have updated `docs/candidate_sites.md`:
```bash
# Stage the modified document
git add docs/candidate_sites.md

# Commit using conventional commits format
git commit -m "docs: finalize 5 candidate site coordinates, elevations, and UI science copy"

# Push branch to origin
git push origin docs/candidate-sites-update
```

**Next**: Open a Pull Request on GitHub against `main`:
* **Title**: `docs: finalize candidate site coordinates and UI copy`
* **Description**: Mention that coordinates have been verified against NASA/LPI references and that the UI copy is ready for frontend consumption.
* **Assignee / Reviewer**: `@AdeshDeshmukh`

---

## 📊 Sprint 2 Deliverables (Pitch Deck & Demo Narrative)

While Adesh reviews PR #1 and wires the data into the 3D web application, begin drafting **`docs/PITCH_AND_DEMO.md`** with the following 2 components:

### 1. Pitch Deck Outline (5–7 Slides)
Draft slide-by-slide bullet points:
* **Slide 1**: *Title & Team* — "To Land or Not to Land: Explainable Lunar Landing Site Risk Assessment."
* **Slide 2**: *The Problem* — Why landing at the Moon's South Pole is perilous (steep crater slopes, changing illumination, comms shadows).
* **Slide 3**: *The Gap* — Existing tools (JPL Horizons, QuickMap) are fragmented; planners need instant Go / Caution / No-Go decision support.
* **Slide 4**: *Our Solution* — Dual-workflow 3D interactive platform (Date-First for launch slips, Site-First for science targets).
* **Slide 5**: *The Science Engine* — 4 transparent engineering factors (Slope, Roughness, Solar Illumination, Earth LOS).
* **Slide 6**: *NASA Data Integration* — LRO LOLA DEMs, LROC, JPL Horizons ephemeris.
* **Slide 7**: *Vision & Scalability* — Artemis mission expansion & autonomous hazard avoidance.

### 2. Demo Video Script (2 Minutes)
Draft a timed script for the screen recording:
* **0:00 – 0:30**: Introduction of the 3D lunar globe and the 5 pre-pinned sites glowing Green/Yellow/Red.
* **0:30 – 1:00**: Demonstrate the **Date-First Workflow** (scrubbing the launch date slider and showing candidate sites transition as illumination shifts).
* **1:00 – 1:30**: Demonstrate the **Site-First Workflow** (clicking Shackleton Rim, inspecting the 4-factor breakdown panel, showing why slope and illumination drive the rating).
* **1:30 – 2:00**: Wrap-up highlighting NASA data integration and utility for mission planners.

---

## 📌 Summary of Collaboration Rules
1. **No direct pushes to `main`**: All changes go through PRs.
2. **Focus strictly on domain, copy, and presentation**: Adesh owns the code in `client/` and `scripts/`.
3. **If stuck**: Ping Adesh directly on Slack or drop a comment on the GitHub PR.

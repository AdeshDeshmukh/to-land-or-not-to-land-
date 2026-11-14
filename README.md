# 🌕 To Land or Not to Land

> **Interactive Lunar Landing Site Risk Assessment & Decision Support Platform**  
> NASA Space Apps Challenge 2026 — Open Science Project

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com/)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black.svg?logo=three.js&logoColor=white)](https://threejs.org/)

---

## 🎯 Project Overview

**To Land or Not to Land** is a web-based mission control decision support application designed to evaluate candidate Artemis lunar landing sites using authoritative NASA datasets (LRO LOLA slope and elevation, Moon Trek WAC basemaps, and JPL Horizons ephemerides).

It provides real-time **Green / Yellow / Red** multi-factor engineering risk assessments alongside an **interactive 3D Lunar Globe** with real-time slope heatmaps and descent zoom capabilities.

---

## 🚀 Quick Start with Docker (Recommended)

Run the application instantly without installing Node.js, npm, or local dependencies:

### 1. Clone the repository
```bash
git clone https://github.com/AdeshDeshmukh/to-land-or-not-to-land-.git
cd to-land-or-not-to-land-
```

### 2. Start with Docker Compose
```bash
docker compose up --build
```

### 3. Open in Browser
Visit **`http://localhost:3000`** in your web browser.

To stop the container:
```bash
docker compose down
```

---

## 💻 Manual Local Development (Without Docker)

### Prerequisites
- Node.js 20+ installed
- npm 10+ installed

### Steps
```bash
# 1. Navigate to the client directory
cd client

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev

# 4. Open in browser
# http://localhost:3000
```

To create a production build:
```bash
npm run build
npm run preview
```

---

## 🛰️ Key Features

- **Interactive 3D Lunar Globe**: True WebGL Moon with realistic regolith, impact basins, and orbital controls (left-drag orbit, scroll zoom, right-drag pan).
- **NASA LOLA Slope Heatmap Overlay**:
  - 🟢 **< 5°**: Safe touchdown terrain (e.g. Mare Tranquillitatis, Shackleton crater rim).
  - 🟡 **5°–15°**: Moderate slope caution zone (e.g. Malapert mountain flanks).
  - 🔴 **> 15°**: Hazard / No-Go zone (e.g. Nobile crater interior steep walls).
- **Auto-Zoom & Descent Camera**: Smooth camera interpolation to target coordinates when a site is selected.
- **Site Landing Footprints**: Pulsing radar beacons and 1 km landing target crosshairs.
- **4-Factor Engineering Evaluator**:
  1. Surface Slope Angle
  2. Surface Roughness & Obstacles
  3. Solar Illumination Percentage & Shadow Transitions
  4. Direct Earth Line-of-Sight (LOS) Comms Link
- **Launch Window Slip Simulator**: Dynamic scrubber simulating $\pm 14$ days launch shifts with recalculating solar shadows.
- **Multi-Site Comparison Matrix**: Side-by-side engineering trade study modal.
- **Horizon & SkyPlot**: 2D elevation angle profile for Sun and Earth tracking.

---

## 👥 Contributors & Team

- **Adesh Deshmukh** — Tech Lead & Full-Stack Architect ([@AdeshDeshmukh](https://github.com/AdeshDeshmukh))
- **Lauri Salonen** — Product & Science Lead ([@salonelauri](https://github.com/salonelauri))
- **Rishika** — Data & UI Design
- **Ethan** — 3D & Visualization

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](file:///Users/adeshkishordeshmukh/Documents/Adesh_project/NASA_project!/to-land-or-not-to-land-/LICENSE) file for details. Built for the NASA Space Apps Challenge 2026.

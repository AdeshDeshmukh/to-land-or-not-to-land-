# 🌕 3D Interactive Lunar Globe — Full Technical Specification

> **Project**: To Land or Not to Land — NASA Space Apps Challenge 2026  
> **Feature**: Replace 2D canvas globe with real 3D CesiumJS interactive lunar globe  
> **Priority**: CRITICAL — This is the visual centrepiece of the entire application  
> **Branch**: `feature/cesium-3d-lunar-globe`

---

## 🎯 Goal Statement

Build an **aerospace-grade, production-quality 3D interactive Moon globe** inside the existing React + TypeScript + Vite + Tailwind app. When a user opens the app, they see a beautiful rotating Moon in 3D space. They can:

1. **Freely orbit, zoom, and tilt** the Moon with mouse / touch / trackpad
2. **See 5 glowing pin markers** at the exact lat/lon coordinates of the candidate landing sites
3. **Click a pin** → the camera smoothly flies (auto-zooms) to that region
4. **See a colour-coded terrain heatmap** draped over the Moon's surface:  
   - 🟢 Green = slope < 5° (safe to land)  
   - 🟡 Yellow = slope 5–15° (marginal)  
   - 🔴 Red = slope > 15° (unsafe)
5. **See a details panel** slide in from the right showing the full risk breakdown for the selected site
6. All of this embedded **inside the existing dark-themed React dashboard** — not a separate page

---

## 🛠️ Tech Stack Decisions

| Concern | Choice | Reason |
|---------|--------|--------|
| 3D Globe engine | **CesiumJS** (`cesium` npm package) | Native support for Moon ellipsoid (1737.4 km radius), WMTS imagery layers, terrain providers, camera fly-to, billboard collections. The industry standard for geospatial 3D. |
| Moon surface imagery | **NASA Moon Trek WMTS** | Free, authoritative, no API key. Provides photorealistic LRO WAC mosaic tiles. |
| Slope overlay | **NASA Moon Trek slope layer** (LOLA-derived) | Pre-computed by USGS/NASA. Available as WMS/WMTS raster. We style it with a custom colour map. |
| React integration | **`resium`** (`resium` npm package) | Idiomatic React wrapper for CesiumJS. Use `<Viewer>`, `<BillboardGraphics>`, `<ImageryLayer>`, `<CameraFlyTo>` as JSX. Avoids manual DOM refs. |
| Bundle size | Lazy-loaded via `React.lazy` + `Suspense` | Cesium is ~6MB unzipped. Lazy load the globe component so the initial dashboard loads fast. |
| Cesium assets | `vite-plugin-cesium` | Copies Cesium's static assets (Workers, ThirdParty, Assets, Widgets CSS) to `public/` at build time automatically. Zero manual config. |

---

## 📦 Installation Commands

Run these inside `client/`:

```bash
npm install cesium resium
npm install --save-dev vite-plugin-cesium
```

---

## ⚙️ Vite Config Update (`client/vite.config.ts`)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'   // ← add this

export default defineConfig({
  plugins: [
    react(),
    cesium(),   // ← add this — copies Cesium assets automatically
  ],
})
```

---

## 🌙 CesiumJS Moon Setup Details

### Moon Ellipsoid
Cesium's default ellipsoid is Earth. Override it:
```typescript
const moonEllipsoid = new Cesium.Ellipsoid(1737400, 1737400, 1737400) // metres, Moon radius
```

### Moon Trek WMTS Basemap
NASA Moon Trek provides photorealistic WAC (Wide Angle Camera) mosaic tiles:

```
URL Template: https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.jpg
Tile Matrix Set: default028mm
Projection: Geographic (EPSG:4326)
Max Zoom: ~6 (global) to ~12 (regional)
```

Fallback if Moon Trek is unavailable: Use a local fallback Moon texture (single JPEG of the Moon) as a `SingleTileImageryProvider`.

### LOLA Slope Overlay
NASA Moon Trek also hosts the LOLA-derived slope map as a coloured raster:
```
URL: https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_Slope_90N90S_30mp_v02/1.0.0/default/default028mm/{TileMatrix}/{TileRow}/{TileCol}.png
```
This tile layer should be added as a second `ImageryLayer` with ~60% opacity, blended over the base mosaic.

---

## 🗂️ Files to Create / Modify

### 1. `client/src/components/LunarGlobe3D.tsx` ← **REPLACE** existing `LunarGlobe.tsx`

This is the main component. Full specification:

```typescript
// Props interface
interface LunarGlobe3DProps {
  sites: CandidateSite[]          // All 5 candidate sites
  selectedSiteId: string | null   // Currently selected site (drives camera fly-to)
  onSelectSite: (id: string) => void // Callback when user clicks a pin
  showSlopeOverlay: boolean       // Toggle slope heatmap on/off
}
```

**Internal behaviour:**

#### A. Viewer Initialisation
- Use `resium` `<Viewer>` with:
  - `globe.ellipsoid` = Moon ellipsoid
  - `scene.skyBox` disabled (we use our own Starfield background)
  - `scene.backgroundColor` = `Cesium.Color.TRANSPARENT`
  - `scene.moon` hidden (we ARE the moon)
  - `scene.sun` visible for realistic lighting
  - `animation` widget hidden
  - `timeline` widget hidden
  - `baseLayerPicker` hidden
  - `geocoder` hidden
  - `homeButton` hidden
  - `sceneModePicker` hidden
  - `navigationHelpButton` hidden
  - `fullscreenButton` hidden
  - `infoBox` hidden (we use our own details panel)
  - `selectionIndicator` hidden (we use our own)

#### B. Imagery Layers
1. **Layer 0** — Moon Trek WAC Mosaic (base)
2. **Layer 1** — LOLA Slope overlay (opacity 0.6, only shown when `showSlopeOverlay === true`)

#### C. Site Pins (BillboardCollection)
For each of the 5 sites, place a `<BillboardGraphics>` with:
- **Position**: `Cesium.Cartesian3.fromDegrees(site.longitude, site.latitude, 10000)` (10km above surface to avoid Z-fighting)
- **Image**: A glowing circle SVG rendered to canvas at runtime (not an external file):
  - 🟢 Green (#00ff88) glow for GREEN risk rating
  - 🟡 Yellow (#ffcc00) glow for YELLOW risk rating  
  - 🔴 Red (#ff4444) glow for RED risk rating
  - Outer glow ring pulses (animated) for selected site
- **Scale**: `0.6` normally, `0.9` when selected
- **VerticalOrigin**: `Cesium.VerticalOrigin.BOTTOM`
- **HeightReference**: `Cesium.HeightReference.CLAMP_TO_GROUND`
- **Label**: Site name in white, font size 11px, only visible when zoomed in enough (distanceDisplayCondition)
- **On click**: Call `onSelectSite(site.id)`

#### D. Camera Fly-To on Site Selection
When `selectedSiteId` changes, trigger:
```typescript
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(
    site.longitude,
    site.latitude,
    50000   // 50km above surface — close enough to see terrain detail
  ),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-45),  // 45° down angle
    roll: 0,
  },
  duration: 2.5,   // smooth 2.5s animation
  easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
})
```
When no site is selected (null), fly to global overview:
```typescript
destination: Cesium.Cartesian3.fromDegrees(0, -60, 3_000_000) // polar overview
```

#### E. Cleanup
On component unmount, call `viewer.destroy()` to free WebGL context.

---

### 2. `client/src/components/SiteInspectionPanel.tsx` ← **NEW**

A side panel that slides in from the right when a site is selected. Displays:

```
╔════════════════════════════════╗
║  🌙 Shackleton Crater Rim      ║
║  Latitude: -89.54°  Lon: 0.00° ║
╠════════════════════════════════╣
║  Overall Risk: 🟢 LOW           ║
╠════════════════════════════════╣
║  Factor          Score  Rating ║
║  ─────────────────────────────  ║
║  Slope (4.2°)     92/100  🟢   ║
║  Illumination     86%     🟢   ║
║  LOS to Earth     ✅            ║
║  Surface Rough    Low     🟢   ║
╠════════════════════════════════╣
║  [📊 Compare All Sites]         ║
║  [📍 Reset Globe View]          ║
╚════════════════════════════════╝
```

Styling: dark glassmorphism card (`bg-black/70 backdrop-blur-md border border-white/10`), slides in with CSS `transform: translateX` transition. Tailwind classes throughout.

---

### 3. `client/src/components/SlopeToggle.tsx` ← **NEW**

A floating toggle button overlaid on the globe (bottom-left corner):
```
[ 🗺️ Slope Overlay  ON/OFF ]
```
Calls parent state setter to toggle `showSlopeOverlay`.

---

### 4. `client/src/App.tsx` ← **MODIFY**

Replace the `<LunarGlobe>` import and usage with the new lazy-loaded `<LunarGlobe3D>`:

```typescript
const LunarGlobe3D = React.lazy(() => import('./components/LunarGlobe3D'))

// In JSX:
<React.Suspense fallback={<GlobeLoader />}>
  <LunarGlobe3D
    sites={candidateSites}
    selectedSiteId={selectedSiteId}
    onSelectSite={setSelectedSiteId}
    showSlopeOverlay={showSlopeOverlay}
  />
</React.Suspense>
```

Also add `showSlopeOverlay` state:
```typescript
const [showSlopeOverlay, setShowSlopeOverlay] = useState(true)
```

The globe should occupy **at least 65% of the viewport height** — make it the dominant visual element.

---

### 5. `client/src/components/GlobeLoader.tsx` ← **NEW**

A loading placeholder shown while CesiumJS hydrates:
```
[Animated lunar loading ring with text "Initialising 3D Lunar Surface..."]
```
Dark background, centered spinner using CSS animation. No external library.

---

## 🎨 Visual Design Requirements

### Overall Aesthetic
- **Theme**: Deep space / NASA mission control  
- **Colour palette**: Near-black background (`#050a1a`), electric blue accents (`#0ea5e9`), white text  
- **Globe**: Floats in a subtle glow on the dark background — no hard rectangular border  
- **Pins**: Neon glow effect (CSS `filter: drop-shadow`) matching risk colour  
- **UI panels**: Glassmorphism (`backdrop-blur`, semi-transparent dark)  
- **Typography**: Monospace for coordinates and scores (`font-mono`); Sans-serif for labels

### Layout (1920×1080 reference)
```
┌─────────────────────────────────────────────────────────────┐
│  [🌕 TO LAND OR NOT TO LAND]  [UTC CLOCK]  [RISK LEGEND]   │  ← Header (64px)
├──────────────────┬──────────────────────────────────────────┤
│  SITE LIST        │                                          │
│  ─────────────── │          3D LUNAR GLOBE                  │
│  🟢 Shackleton   │       (interactive, fills space)         │
│  🟡 Malapert     │                                          │
│  🔴 Nobile       │          [Slope Toggle bottom-left]      │
│  🟢 Tranquill.   │                                          │
│  🟡 C. Ridge     │                                          │
│  ─────────────── │                                          │
│  [Compare All]   │                                          │
├──────────────────┴──────────────────────────────────────────┤
│  [SITE INSPECTION PANEL — slides in from right on select]   │
└─────────────────────────────────────────────────────────────┘
```

On mobile (< 768px): Stack vertically. Globe on top (60vw height), site list below, inspection panel as bottom sheet.

---

## 📡 Data Flow

```
candidateSites.ts  →  riskEngine.ts  →  LunarGlobe3D (pins + colours)
                                     →  SiteInspectionPanel (risk details)
App.tsx state: selectedSiteId (string | null)
                showSlopeOverlay (boolean)
```

No new data files needed — reuse existing `candidateSites.ts` and `riskEngine.ts`.

---

## 🧪 Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | 3D Moon globe renders on load | Open `localhost:3000`, see rotating sphere |
| 2 | 5 coloured pins visible | Pins visible with correct Green/Yellow/Red colours |
| 3 | Click pin → camera flies to site | Camera animates smoothly to 50km altitude above site |
| 4 | Slope overlay toggle works | Clicking toggle shows/hides LOLA slope layer |
| 5 | Inspection panel shows correct data | Select Shackleton → see slope 4.2°, 86% illumination |
| 6 | Globe is scrollable/zoomable | Mouse wheel zooms, left-click drag orbits |
| 7 | TypeScript build passes | `npm run build` exits 0 |
| 8 | No console errors in browser | Chrome DevTools console is clean |
| 9 | Mobile layout does not break | Globe visible at 390px width |
| 10 | Fallback if Moon Trek tiles fail | Offline: single-texture Moon fallback renders |

---

## ⚠️ Known Gotchas

1. **Cesium Ion token**: By default, `resium` tries to connect to Cesium Ion (Cesium's cloud). Set `Cesium.Ion.defaultAccessToken = ''` to disable Ion and use only local/Moon Trek tiles. Otherwise you'll get a 401 error on load.
2. **WebGL context limit**: Browsers allow ~8 WebGL contexts. If `<Viewer>` is mounted/unmounted rapidly (dev hot-reload), old contexts may accumulate. The `viewer.destroy()` cleanup in `useEffect` return handles this.
3. **Moon Trek CORS**: Moon Trek WMTS tiles are served with CORS headers — they work from any origin. No proxy needed.
4. **Cesium Workers**: `vite-plugin-cesium` handles copying Workers to `public/`. Without this, `Cesium` throws "Worker not found" errors at runtime.
5. **South Pole camera init**: Most sites are near the South Pole. Set initial camera to `fromDegrees(0, -75, 2_000_000)` for best first view.
6. **`resium` version pinning**: Use `resium@^1.17` (compatible with `cesium@^1.112`). Check peer deps before installing.

---

## 🚀 Implementation Order

1. Install packages (`cesium`, `resium`, `vite-plugin-cesium`)
2. Update `vite.config.ts` with `cesium()` plugin
3. Create `GlobeLoader.tsx` (simple, no deps)
4. Create `LunarGlobe3D.tsx` (core feature)
5. Create `SiteInspectionPanel.tsx`
6. Create `SlopeToggle.tsx`
7. Update `App.tsx` (lazy import, layout changes)
8. Run `npm run build` — fix any TS errors
9. Test locally at `localhost:3000`
10. Commit → push → PR → merge

---

## 📝 Commit Message

```
feat(globe): replace 2D canvas with CesiumJS 3D interactive lunar globe

- Install cesium, resium, vite-plugin-cesium
- LunarGlobe3D: Moon ellipsoid, WAC mosaic basemap, LOLA slope overlay
- Auto camera fly-to on site selection (2.5s animation)
- Coloured glowing billboard pins per risk rating
- SiteInspectionPanel: glassmorphism details card
- SlopeToggle: floating toggle for LOLA heatmap
- GlobeLoader: suspense fallback
- App.tsx: lazy-load globe, 65vh layout, showSlopeOverlay state
- Cesium.Ion.defaultAccessToken = '' (no cloud dependency)

Closes #GLOBE-001
```

---

*Document version 1.0 — Authored during pre-hackathon research phase. Implementation begins at hackathon start: 2026-11-14 09:00 local.*


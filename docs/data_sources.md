# 🛰️ NASA Data Sources & APIs

> **Document Owner**: Adesh Deshmukh
> **Last Updated**: 2026-11-14

## Overview
This document catalogs all NASA and scientific data sources used in the project, their purpose, access method, and current status.

---

## Primary Data Sources

### 1. NASA Moon Trek (Interactive Portal & Tile APIs)

| Property | Detail |
| :--- | :--- |
| **Purpose** | Lunar basemap imagery, elevation profiles, slope maps, permanently shadowed region overlays |
| **Interactive Portal** | https://trek.nasa.gov/moon/ |
| **REST API Documentation** | https://trek.nasa.gov/tiles/apidoc/trekAPI.html |
| **WMTS Tile Server** | https://trek.nasa.gov/tiles/Moon/EQ/ |
| **Access** | Public, no authentication required |
| **Data Formats** | WMTS tiles (PNG), GeoTIFF (via REST download), elevation profile JSON |

### 2. LRO LOLA (Lunar Orbiter Laser Altimeter)

| Property | Detail |
| :--- | :--- |
| **Purpose** | High-resolution digital elevation models (DEMs) for slope and roughness computation |
| **Science Node** | https://lola.gsfc.nasa.gov/ |
| **PDS Geosciences Archive** | https://pds-geosciences.wustl.edu/missions/lro/lola.htm |
| **Resolution** | Global 118 m/pixel DEM; regional products at higher resolution |
| **Access** | Public, bulk download from PDS |
| **Data Formats** | GeoTIFF, PDS IMG, binary grid files |

### 3. LROC NAC (Lunar Reconnaissance Orbiter Camera — Narrow Angle Camera)

| Property | Detail |
| :--- | :--- |
| **Purpose** | Ultra-high-resolution surface imagery and derived terrain models (2–5 m/pixel) for roughness assessment |
| **Product Search** | https://wms.lroc.asu.edu/lroc/rdr_product_select |
| **Access** | Public |
| **Data Formats** | GeoTIFF, PDS IMG |

### 4. JPL Horizons System (Ephemeris)

| Property | Detail |
| :--- | :--- |
| **Purpose** | Compute Sun and Earth elevation angles at arbitrary lunar surface coordinates for any date/time |
| **Web Interface** | https://ssd.jpl.nasa.gov/horizons/app.html |
| **REST API** | https://ssd.jpl.nasa.gov/api/horizons.api |
| **Python Library** | `astroquery.jplhorizons` (via pip) |
| **Access** | Public, no authentication required |
| **Output** | Tabular ephemeris: azimuth, elevation, distance for target bodies |

### 5. NASA Artemis III Candidate Landing Regions

| Property | Detail |
| :--- | :--- |
| **Purpose** | Official NASA-published candidate landing regions for Artemis crewed missions (our benchmark locations) |
| **Press Release** | https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/ |
| **LPI South Pole Atlas** | https://www.lpi.usra.edu/lunar/lunar-south-pole-atlas/ |

---

## Secondary / Reference Sources

| Source | URL | Use Case |
| :--- | :--- | :--- |
| NASA Open Data Portal | https://data.nasa.gov/ | General dataset discovery |
| NASA PDS Central | https://pds.nasa.gov/ | Planetary data system index |
| USGS Astrogeology WMS | https://astrogeology.usgs.gov/search | Planetary web map services for CesiumJS |
| NASA Scientific Visualization Studio | https://svs.gsfc.nasa.gov/ | Reference animations and imagery |
| CesiumJS Documentation | https://cesium.com/platform/cesiumjs/ | 3D globe rendering engine |

---

## Data Pipeline Status

| Dataset | Status | Assigned To |
| :--- | :--- | :--- |
| Moon Trek basemap tiles | ☐ Test tile loading in CesiumJS | Adesh / Ethan |
| LOLA slope values for 5 sites | ☐ Extract from Moon Trek elevation profile API | Adesh |
| JPL Horizons ephemeris for 5 sites | ☐ Run `fetch_ephemeris.py` for ±30 day window | Adesh |
| LROC roughness classification | ☐ Manual classification from published NAC imagery | Lauri |
| Artemis coordinate verification | ☐ Cross-check all 5 Lat/Lon pairs | Lauri |

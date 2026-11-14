# 🔧 Data Pipeline Scripts

> **Owner**: Adesh Deshmukh

## Overview
This directory contains offline Python scripts that pre-compute scientific data for the web application. These scripts run **once** before or during the hackathon. Their JSON outputs are committed to `client/src/data/` and consumed by the frontend at runtime.

The web application **never** calls external APIs directly — all data is pre-baked.

## Scripts

| Script | Purpose | Input | Output |
| :--- | :--- | :--- | :--- |
| `fetch_ephemeris.py` | Query JPL Horizons for Sun/Earth elevation angles at each candidate site across a date range | Site coordinates + date range | `output/ephemeris_raw/{site_id}.json` |
| `extract_terrain.py` | Query NASA Moon Trek API for elevation profiles and slope values at each site | Site coordinates | `output/terrain_raw/{site_id}.json` |
| `merge_site_data.py` | Combine ephemeris + terrain data into the final JSON consumed by the frontend | Raw outputs from above | `../client/src/data/candidate_sites.json` + `../client/src/data/ephemeris/*.json` |

## Setup

```bash
cd scripts/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run Pipeline

```bash
python fetch_ephemeris.py
python extract_terrain.py
python merge_site_data.py
```

## Dependencies
See `requirements.txt`:
- `astroquery` — JPL Horizons API client
- `requests` — HTTP client for Moon Trek REST API
- `numpy` — Numerical computation
- `pandas` — Data manipulation and JSON export

# RF SIM

RF SIM is a browser-based RF planning and analysis platform for building tactical communications and EW scenarios, placing radios, relays, jammers, sensors, and overlays on a live map, and using terrain-aware modeling to evaluate line of sight, coverage, masking, link quality, relay placement, and command-post siting.

The primary way to use RF SIM is the hosted site:

`https://www.rfsim.us`

This repository contains the web client, local helper services, and the optional backend/API used for authenticated projects, snapshots, analytics, TAK integration, and shared deployments.

## What RF SIM Does

RF SIM is organized around the main planning views selected from the top navigation bar:

- **T/O** builds the table of organization, unit hierarchy, and symbology baseline for the scenario.
- **EMITTERS** is a dedicated workspace for creating, organizing, and configuring RF emitters as visual cards — independent of map placement.
- **SENSORS** is an optional receiver and collection-planning workspace that can be enabled or disabled in **Settings > Views**. It sits between EMITTERS and MAP when enabled.
- **MAP** is the main geographic workspace for placing emitters on terrain, importing overlays, and inspecting the physical battlespace.
- **ANALYSIS** turns terrain, geometry, emitter settings, sensor context, and environment into RF findings such as coverage, masking, conflicts, collection opportunities, and network risk.

## Core Capabilities

- Terrain-aware LOS and propagation analysis with local DTED and optional Cesium terrain.
- Deterministic site studies for relay siting, RF sensor siting, command-post siting, and direct-link analysis.
- 2D Leaflet map plus synchronized 3D Cesium viewing.
- Terrain heatmaps, contours, viewsheds, terrain sampling, and path-specific LOS inspection.
- Emitter workspace with visual cards showing device graphics, net configuration, unit linkage, and map visibility status.
- Optional Sensors workspace for adding RF receivers, linking them to T/O units, placing them on the map, and estimating which emitters can be received or collected from a given location.
- Waveform-aware topology linking — radios must share the same waveform and frequency to draw a link (MIMO, Wave Relay, TSM-X, SINCGARS, P25, DMR, and others).
- Import of `GeoJSON`, `KML`, `KMZ`, ATAK data package `ZIP`, and DTED terrain files.
- Map Contents workflows for folders, visibility control, search, rename, reorder, relocation, and deletion.
- Guest/local use without an account, plus signed-in projects, duplication, deletion, and snapshots when the backend is available.
- Offline download and local caching workflows for imagery, elevation, and OSM building data.
- AI-assisted planning, scenario interpretation, site comparison, document generation, and RF/EW narrative support.
- Optional AI provider support for Anthropic, GenAI.mil via relay, and local models through the included proxy.
- Optional TAK configuration and streaming workflows for project-linked operational use.

## Typical Workflow

1. Build the unit structure in **T/O**.
2. Open **EMITTERS** and add emitter cards for each radio in the scenario, configuring waveform, frequency, and RF parameters.
3. Right-click cards in the Emitter Workspace to edit, duplicate, add or configure nets, link to a T/O unit, or delete.
4. Optionally enable **SENSORS** in **Settings > Views** when collection planning matters, then add receiver systems, link them to collection units, and evaluate which placed emitters they can sense.
5. Place emitters and sensors on the map from **MAP** for geographic analysis, or keep them workspace-only for planning.
6. Load terrain and import overlays for the actual area of interest.
7. Use **EMITTERS** topology controls to inspect network link relationships, filtered by waveform and frequency compatibility.
8. Run RF studies and AI-assisted comparisons in **ANALYSIS** to refine the plan and generate outputs.

## Sensors and Collection Planning

The **SENSORS** view is optional. Enable it from **Settings > Views** when a scenario needs RF collection, spectrum monitoring, SIGINT/EW receiver placement, or sensor-to-emitter reasoning.

Sensors help collection units answer practical questions:

- Which emitters are likely detectable from this receiver location?
- Is the receiver frequency range, bandwidth, sensitivity, antenna type, and height appropriate for the target emissions?
- Which S2, EW, SIGINT, or collection team owns the receiver in the T/O?
- Where should receivers be placed on terrain to improve collection opportunities?
- Which emitters are below sensitivity, marginal, or likely collectible?

The Sensors workspace is intentionally separate from EMITTERS: emitters represent transmitting RF assets, while sensors represent receiving/collection assets. Both can be linked to T/O units and placed on the map so ANALYSIS and AI workflows can reason across organization, RF configuration, and terrain.

## Ways To Use RF SIM

### Hosted site

Use the hosted site if you want the normal production workflow, account-backed projects, snapshots, shared persistence, and the least setup work.

### Frontend-only local run

Use a local frontend run when you want guest-mode workflows, UI development, or browser-only testing without the backend.

```powershell
node frontend-dev-server.js
```

Then open `http://127.0.0.1:8080`.

### Full local stack

Use the full stack when you need authenticated projects, backend APIs, local deployment work, or helper services such as the AI relay and offline data server.

Backend:

```powershell
cd backend
npm install
Copy-Item .env.example .env
node src/server.js
```

Frontend:

```powershell
node frontend-dev-server.js
```

Windows users can also use:

```text
launchers/local_run.bat
```

## Documentation

- [Documentation Hub](docs/README.md)
- [Operator Guide](docs/operator-guide.md)
- [AI Prompt Guide](docs/ai-prompts.md)
- [AWS / EC2 Production Notes](docs/aws-ec2-production.md)
- [Deterministic Geometry / AI Upgrade Notes](docs/feature-upgrade-deterministic-geometry-ai.md)

## Repository Layout

```text
app.js                  Main frontend application logic
index.html              Application shell
styles.css              Frontend styling
app-config.js           Frontend runtime config
simulation-worker.js    Coverage and planning worker
frontend-dev-server.js  Local static server with /api proxy
genai-proxy.js          Local AI relay for GenAI.mil and local model access
local-data-server.js    Local offline tile/elevation/OSM cache server
backend/                Node.js + PostgreSQL API for auth/projects/analytics
deploy/                 Docker Compose + nginx deployment assets
docs/                   Operator, deployment, and feature documentation
launchers/              Windows/macOS helper launchers
images/                 App imagery and symbology assets
rust/                   RF compute and propagation support code
```

## Checks

Frontend:

```powershell
npm run check
```

Backend:

```powershell
cd backend
npm run check
```

## Operational Note

RF SIM is a planning and scenario-support tool. Terrain, propagation, weather, building, and AI-assisted outputs are decision aids and should be validated before operational use.

# RF SIM

RF SIM is a browser-based RF planning and analysis platform for building tactical communications and EW scenarios, placing radios, relays, jammers, sensors, and overlays on a live map, and using terrain-aware modeling to evaluate line of sight, coverage, masking, link quality, relay placement, and command-post siting.

The primary way to use RF SIM is the hosted site:

`https://www.rfsim.us`

This repository contains the web client, local helper services, and the optional backend/API used for authenticated projects, snapshots, analytics, TAK integration, and shared deployments.

## What RF SIM Does

RF SIM is organized around four core workspaces:

- `T/O` builds the table of organization, unit hierarchy, and symbology baseline for the scenario.
- `MAP` is the main scenario workspace for placing emitters, relays, sensors, routes, shapes, imported overlays, and terrain-backed planning data.
- `TOPOLOGY` visualizes network relationships, link structure, and connection quality between emitters or units.
- `ANALYZE` turns terrain, geometry, emitter settings, and environment into RF findings such as coverage, masking, conflicts, and network risk.

## Core Capabilities

- Terrain-aware LOS and propagation analysis with local DTED and optional Cesium terrain.
- Deterministic site studies for relay siting, RF sensor siting, command-post siting, and direct-link analysis.
- 2D Leaflet map plus synchronized 3D Cesium viewing.
- Terrain heatmaps, contours, viewsheds, terrain sampling, and path-specific LOS inspection.
- Import of `GeoJSON`, `KML`, `KMZ`, ATAK data package `ZIP`, and DTED terrain files.
- Map Contents workflows for folders, visibility control, search, rename, reorder, relocation, and deletion.
- Guest/local use without an account, plus signed-in projects, duplication, deletion, and snapshots when the backend is available.
- Offline download and local caching workflows for imagery, elevation, and OSM building data.
- AI-assisted planning, scenario interpretation, site comparison, document generation, and RF/EW narrative support.
- Optional AI provider support for Anthropic, GenAI.mil via relay, and local models through the included proxy.
- Optional TAK configuration and streaming workflows for project-linked operational use.

## Typical Workflow

1. Build the unit structure in `T/O`.
2. Link emitters and assets to the right units.
3. Place assets accurately in `MAP`.
4. Load terrain and import overlays for the actual area of interest.
5. Verify RF parameters such as band, frequency, waveform, power, antenna height, gain, and system loss.
6. Inspect network relationships in `TOPOLOGY`.
7. Run `ANALYZE`, deterministic site studies, and AI-assisted comparisons to refine the plan and generate outputs.

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

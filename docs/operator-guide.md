# RF SIM Operator Guide

## Purpose

RF SIM is built to help planners turn terrain, geometry, emitter settings, and operational constraints into actionable RF decisions. It is strongest when the question is geographic, networked, and tradeoff-driven, such as:

- Which relay site gives the best coverage?
- Which command-post location preserves links while reducing skyline exposure?
- Why can one node reach one unit but not another?
- Which route segments or movement corridors create dead zones?
- Which sites are strongest for sensors, retrans, or backhaul?
- Where is the network vulnerable to terrain, masking, or single-node loss?

## Core Workflow

1. Build the unit structure in `PLAN`.
2. Add radios, relays, sensors, jammers, routes, and supporting map content in `MAP`.
3. Import DTED, KML/KMZ, GeoJSON, ATAK ZIP, and other operational overlays for the area of interest.
4. Set the RF inputs that actually drive results: frequency, waveform, power, antenna gain, antenna height, system loss, and placement.
5. Inspect relationships in `TOPOLOGY` to see how the network is structured and where it is fragile.
6. Use `ANALYZE`, terrain inspection, LOS checks, and deterministic site studies to refine the plan.
7. Use the AI agent to compare COAs, explain outcomes, generate planning products, and accelerate interpretation.

## Workspace Overview

### PLAN

Use `PLAN` to create the table of organization and the unit hierarchy that the rest of the scenario hangs on. This is where unit identity, symbology, and parent-child structure become coherent before emitters are placed.

### MAP

Use `MAP` to build the physical RF problem. This is the main workspace for:

- placing radios, relays, sensors, jammers, and other assets
- drawing shapes, routes, and planning areas
- importing overlays and terrain
- managing content through folders and map-content controls
- switching between 2D and 3D terrain views
- sampling terrain, checking LOS, and inspecting local geometry

`MAP` also contains the deterministic site-study workflow used for relay siting, sensor site selection, command-post siting, and direct-link studies.

### TOPOLOGY

Use `TOPOLOGY` to inspect the network as a graph instead of a map. It is useful for seeing link relationships, which units or emitters are isolated, and where a small number of nodes carry too much of the network.

### ANALYZE

Use `ANALYZE` when the scenario is built cleanly and you want RF findings rather than map editing. This view is oriented toward:

- coverage review
- terrain impacts and masking
- conflict and deconfliction checks
- frequency and waveform summaries
- network-quality explanation
- AI-assisted interpretation of the current scenario state

## Deterministic RF Workflows

RF SIM is strongest when the geometry is explicit and the question can be answered with deterministic analysis before AI interpretation.

### Site studies

The site-study workflow supports:

- `Relay Siting`
- `RF Sensor Site`
- `Command Post Site`
- `Direct Link Study`

Use these when you need ranked candidate positions with study results instead of a general recommendation. Site studies can score candidate points, show required mast height, summarize link legs, and let you inspect or promote candidates back into the scenario.

### Terrain-backed inspection

Use terrain sampling, LOS checks, viewsheds, heatmaps, and contours when the argument depends on relief, masking, skyline exposure, or whether a path is actually blocked by terrain.

### Offline workflows

If you need to operate with unstable connectivity, use the offline workflow to define an area, cache imagery/elevation/building data to the local data server, or export a ZIP package for later use.

## AI Workflow

The AI agent is there to speed up interpretation and planning output, not to replace disciplined RF engineering.

Use AI after the scenario is grounded in actual terrain, assets, and geometry. The best results come when you:

- build the TO and place the relevant assets first
- attach the current map view when terrain or layout matters
- add map-context items instead of describing everything from scratch
- specify the radios, terrain, distances, threat conditions, and constraints
- ask for a concrete output such as ranked sites, tradeoffs, failure modes, relay plans, fallback architecture, or a report

The in-app agent supports specialist workflows such as relay planning, RF sensor site selection, command-post siting, microwave backhaul, spectrum deconfliction, EW threat analysis, movement-route comms, link diagnosis, terrain masking, and site comparison.

## Use Cases RF SIM Supports Well

- Tactical voice/data network planning across complex terrain
- Relay and retrans placement for LOS and degraded terrain
- Command-post siting with survivability and masking tradeoffs
- Sensor siting with backhaul and observation constraints
- Route and convoy comms analysis
- EW-aware network planning under jamming or intercept risk
- Spectrum and band-assignment review
- Direct-link diagnosis between specific nodes
- Network fragility review and single-point-of-failure identification
- AI-assisted planning-product generation and COA comparison

## Data, Persistence, And Deployment Modes

### Guest / local mode

Use guest mode when you need fast local or browser-scoped work without account-backed persistence.

### Signed-in mode

When the backend is available, RF SIM supports persistent projects, project duplication, deletion, snapshots, analytics, and stored configuration that are not available in a pure frontend-only run.

### Local helper services

Optional helper services add important capabilities:

- `genai-proxy.js` for GenAI.mil and local-model relay workflows
- `local-data-server.js` for offline caching of imagery, elevation, and OSM data
- backend services for accounts, projects, analytics, and shared deployments
- TAK configuration and project-linked streaming features when your environment requires them

## Practical Guidance

- Build the geometry first, then ask AI to interpret it.
- Use deterministic studies when you need exact site ranking or direct-link reasoning.
- Use AI for comparison, explanation, documentation, and decision support.
- Treat terrain, weather, building, and AI outputs as planning aids that still need validation.

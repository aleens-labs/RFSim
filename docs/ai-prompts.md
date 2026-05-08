# RF SIM AI Prompt Guide

This guide is for prompts that work well inside the RF SIM AI panel when the scenario is already grounded in actual map content, terrain, and asset placement.

## What Produces The Best Results

The strongest prompts usually include seven things:

1. The mission or planning problem.
2. The terrain or operational environment.
3. The radios, waveforms, or network layers involved.
4. The assets, units, endpoints, or map items that matter.
5. The constraints: EMCON, survivability, enemy EW, mobility, mast height, limited relays, time, or throughput.
6. The exact output you want.
7. The decision standard: best coverage, lowest exposure, least mast height, best fallback plan, and so on.

## How To Improve Results In RF SIM

Inside the app, do this before sending a complex prompt:

- Build the T/O and configure emitters in EMITTERS before sending complex prompts.
- Place the relevant assets or import the area geometry in MAP first.
- Use **Add Current Map View** when terrain, urban clutter, or geometry matters.
- Use **Add Map Context** to attach the exact map items, routes, or polygons you want the model to reason about.
- Mention the specific radio family, waveform, and power constraints instead of saying only "radios."
- Ask for tradeoffs, ranked options, or fallback architecture instead of asking for a generic opinion.
- When a deterministic study exists, ask the AI to interpret or compare the study output rather than invent coordinates from scratch.

## Prompt Pattern

Use this structure for most complex scenarios:

```text
I am planning [mission/problem] in [terrain/environment].
Use [radios/waveforms/network layers] between [key units/sites/assets].
Assume [constraints, threats, mast/power limits, mobility limits].
Prioritize [decision standard].
Tell me [exact output: ranked sites, relay plan, dead zones, failure modes, fallback, report].
```

## High-Signal Prompt Templates

### Relay Planning

```text
Plan a relay architecture for this scenario using the placed assets and current map view. Prioritize LOS, Fresnel clearance, minimum mast height, and survivability. Rank the best relay positions, explain why each one works, and identify the single relay whose loss would hurt the network most.
```

### Command-Post Siting

```text
Compare command-post options in this area using the placed geometry and terrain. I need the best site that preserves communications to required nodes while reducing skyline exposure, visual signature, and likely EW detection risk. Rank the candidates and explain the tradeoffs.
```

### Link Diagnosis

```text
Diagnose why the link between these specific endpoints is weak or failing. Use terrain, frequency, antenna height, waveform, and geometry to explain the root cause. Tell me whether the fix is better solved by moving a node, adding mast height, changing settings, or adding a relay.
```

### Route / Movement Comms

```text
Analyze this route for communication dead zones and likely handoff points while the force is moving. Identify the route segments most likely to break command traffic, recommend where relays or overwatch nodes should sit, and describe what fails first if one relay is lost.
```

### EW Threat Analysis

```text
Assess this network under enemy EW pressure. Focus on jamming risk, DF exposure, high-signature nodes, and which emitters are easiest to detect or target. Recommend changes that preserve communications while reducing intercept and geolocation risk.
```

### Site Comparison

```text
Compare these candidate sites side by side. I need a ranked recommendation based on connectivity, masking, mast requirement, survivability, and fallback options if the top site becomes unavailable.
```

## Example Prompts For Complex Scenarios

### Mountain battalion command net

```text
Plan a battalion command net in steep mountain terrain using AN/PRC-163 Falcon IV VHF LOS radios between the TAC, two company CPs, and an observation post. Use the placed assets and terrain in the current map view. Recommend exact ridgeline placement, mast heights, and whether I need a retrans site to keep LOS while reducing enemy intercept risk from the valley floor. Prioritize the lowest-signature plan that still preserves reliable command traffic.
```

### Dense urban breach control

```text
Build an urban breach communications plan using AN/PRC-148 MBITR VHF LOS radios for assault, support, and breach elements operating on opposite sides of this dense block. Identify where building shadowing will cut the net, recommend rooftop or upper-floor relay options, and explain which relay location keeps control reliable without overexposing the team.
```

### EW-pressured ridge retrans

```text
Use AN/VRC-90 and AN/PRC-163 sets to plan a ridge-line retrans architecture while an enemy EW cell is searching for high-power emitters. Show the tradeoff between retrans height, power, and survivability, recommend alternates if the primary relay is targeted, and tell me which changes reduce DF risk without collapsing coverage.
```

### Route comms during displacement

```text
Analyze communications continuity while this battalion TOC displaces along the drawn route using AN/PRC-117G and AN/VRC-90 radios. Identify when retrans must leapfrog, what links are likely to degrade during movement, and how to keep command traffic alive with the fewest extra emitters.
```

### Mixed-band fallback architecture

```text
Build a fallback plan for this dispersed force using VHF LOS as the primary layer and HF NVIS as the emergency layer. Use the placed units, terrain, and route geometry. Explain when I should stay on the LOS net, when to shift to HF, which sites need the clearest fallback posture, and what traffic should move first when the primary layer starts failing.
```

### Command-post site selection under survivability constraints

```text
Compare command-post positions in this area using terrain masking, skyline exposure, and required communications to the placed subordinate nodes. I want the site that best balances survivability and connectivity, not simply the highest ground. Rank the top options, state the mast requirement for each, and explain the main tradeoff that would make me choose option two instead of option one.
```

### Sensor siting with backhaul limits

```text
Run an RF sensor site-selection problem in this area. I need the best sensor location for observation quality and terrain dominance, but it also needs viable backhaul to the friendly network already placed on the map. Rank the best sites, explain which terrain features make them strong, and identify which one is most resilient if one backhaul leg is degraded.
```

### Direct-link troubleshooting

```text
Explain why one of these nodes can talk to unit A but not unit B. Use terrain, path geometry, frequency, antenna height, and network structure to identify the most likely cause. Then give me the smallest change that fixes the problem and the next-best fallback if I cannot move the original node.
```

## Bad Prompt vs Better Prompt

Bad:

```text
Can these radios talk?
```

Better:

```text
Use the placed AN/PRC-163 and AN/PRC-152A nodes in the current map view to determine whether this company net will stay connected across the ridgeline and valley. Identify the blocked legs, explain whether terrain or settings are the primary cause, and recommend the minimum relay or mast-height change needed to restore command traffic while keeping EMCON risk low.
```

## When To Ask For Deterministic Studies

Ask for a deterministic workflow when you need:

- ranked relay positions
- command-post siting comparisons
- RF sensor placement
- direct-link candidate evaluation
- terrain-backed candidate inspection instead of a narrative answer

Then ask the AI to interpret, compare, and document the study outputs.

## Extended Prompt Library

For a larger raw corpus of scenario prompts, see the extended RF planning prompt library in the repository root if available.

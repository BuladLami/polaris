# POLARIS

**Priority-Optimized Location and Risk-Adaptive Infrastructure Siting**

A GIS decision-support prototype for health-facility siting in **Talomo District, Davao City**, built on a hazard-integrated **Random Forest** suitability model.

University of the Immaculate Conception — College of Computer Studies.

**Live application:** https://polaris-thesis.vercel.app

---

## What it does

POLARIS scores every candidate site in the district on a **single composite
suitability scale from 0 to 1** and explains each score in plain language.

- **Recommend** — pick a search area and get the **top eligible sites**
  inside it, each with a written justification.
- **Evaluate** — click any point and read its composite score and what drives it.

Hazard is not optional. Flood, landslide and storm-surge susceptibility are
subtracted from every score, and a site rated High on any hazard — or sitting
inside the **50 m shoreline setback** — is never recommended, whatever it scores.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript, built with Vite 7 |
| Map | [mapcn](https://github.com/AnmolSaini16/mapcn) `@mapcn/map` on MapLibre GL |
| UI | Tailwind CSS v4 + shadcn/ui primitives (Radix) |
| Model | Random Forest (scikit-learn), trained offline |
| Data | Static JSON — no backend, no browser inference |
| Deploy | Vercel |

The browser runs **no inference**. `public/data/candidate_sites.json` carries
every site's pre-computed score, class, eligibility flag and interpretation; the
app is a pure presentation layer that fetches it **once per session** and
recomputes only when you press a button or hit Refresh.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build to /build
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
```

## Project layout

```
polaris/
├── data/legacy/                  # pre-defense export, kept for reproducible migration
├── public/data/
│   ├── candidate_sites.json      # scored sites + metadata (the only data the app reads)
│   ├── talomo_boundary.json      # OSM district boundary
│   ├── talomo_coastline.json     # OSM coastline — drives the 50 m buffer
│   └── talomo_barangays.json     # OSM admin_level=10 polygons
├── scripts/
│   ├── fetch-geodata.mjs         # pulls boundary / coastline / barangays from OSM
│   └── migrate-sites.mjs         # rebuilds candidate_sites.json in the revised schema
└── src/
    ├── App.tsx                   # orchestration, load-once state
    ├── components/
    │   ├── ui/                   # shadcn primitives + vendored mapcn map.tsx
    │   ├── map/                  # site dots, shoreline band, boundary, search radius
    │   └── *.tsx                 # panels and dialogs
    ├── lib/                      # dataset loader, geometry, scoring vocabulary
    └── types/polaris.ts          # dataset schema
```

## Data

### Using output from the training pipeline (preferred)

Run the revised notebook, then copy its export over the app's:

```bash
cp .../outputs/webapp_export/candidate_sites.json public/data/candidate_sites.json
```

No code changes are needed — the app reads the pipeline's schema directly.

### Regenerating the reference geometry

```bash
npm run data:geo   # boundary + coastline + barangays from OSM
```

Existing files are kept if a fetch fails, so an offline run never degrades the
dataset.

### The provisional dataset currently shipped

`public/data/candidate_sites.json` was produced by `npm run data:migrate` from
the pre-defense export. Its scores are the **hazard-integrated MCDA composite**
defined in Section 5 of the revised pipeline — the exact pseudo-target the
Random Forest is trained to reproduce. They are **not** Random Forest
predictions, and they are **not** the discarded neural network's output. The app
surfaces this as a *Provisional dataset* badge under **Model and dataset**.
Replace the file as above for final results.

```bash
npm run data:build   # refetch the map geometry only; never touches the scored dataset
```

## Reading a score

Every site gets **one** number between 0 and 1. **Closer to 1 is more suitable.**

| Class | Composite score |
|---|---|
| Highly Suitable | ≥ 0.60 |
| Moderately Suitable | 0.40 – 0.60 |
| Low Suitability | 0.25 – 0.40 |
| Not Suitable | < 0.25 |

Individual factor values run in the same direction. Road accessibility is a
normalized *inverse* distance to the road network, so **0.007 means the site is
far from roads and poorly accessible** — not that it is nearly zero-risk. The
in-app guide (**?** in the header, and the welcome screen) says all of this
before you see a single number.

## Study area

Talomo District, Davao City — OSM relation 19143671. Coordinates are WGS84;
distances use the haversine formula.

## Attribution

Basemap tiles © [CARTO](https://carto.com/attributions), map data ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Hazard
layers from Project NOAH (landslide, storm surge) and the ph112402000 flood
susceptibility shapefile.

POLARIS is an advisory decision-support tool. Final siting decisions remain with
planning officers.

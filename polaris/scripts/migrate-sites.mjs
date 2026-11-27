/**
 * migrate-sites.mjs
 * ---------------------------------------------------------------------------
 * Rebuilds `public/data/candidate_sites.json` in the schema the revised
 * POLARIS pipeline exports, so the prototype demonstrates every panel
 * revision without waiting on a Colab re-run.
 *
 * WHAT THIS SCRIPT DOES AND DOES NOT DO
 * -------------------------------------
 * The legacy export carried two model outputs (`pred_score_A` = service-only,
 * `pred_score_B` = hazard-integrated) produced by the pre-defense *neural
 * network*. Panel revision #1 replaces that network with a Random Forest, so
 * neither number may be relabelled as an RF prediction.
 *
 * Instead this script recomputes the single composite score directly from the
 * MCDA formulation in Section 5 of the revised pipeline:
 *
 *     S_raw = 0.40*building_density' + 0.25*road_accessibility'
 *           + 0.15*facility_distance'
 *           - 0.08*flood' - 0.07*landslide' - 0.05*storm_surge'
 *     S     = MinMax(S_raw)
 *
 * using the normalized factors already present in the legacy file. That is the
 * exact pseudo-target the Random Forest is trained to reproduce (Section 11
 * reports Spearman rho ~ 1.0 between the two), so it is a faithful, fully
 * reproducible stand-in — and the metadata says so explicitly. Replace the
 * output with the notebook's own `candidate_sites.json` once the RF pipeline
 * has been run; the app reads both without changes.
 *
 * It also adds what the legacy export lacked:
 *   - real shoreline distance per site, measured against OSM coastline
 *     geometry, so the 50 m buffer (panel revision #2) is demonstrable;
 *   - barangay names from OSM admin_level=10 polygons instead of hardcoded
 *     latitude/longitude range guesses;
 *   - a plain-language interpretation per site (panel revisions #3, #5, #7).
 *
 * Usage:  npm run data:migrate
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
// The pre-defense export is kept out of `public/` so it is never served, but
// stays in the repo so this migration is reproducible.
const LEGACY_DIR = path.join(ROOT, "data", "legacy");
const LEGACY = path.join(LEGACY_DIR, "candidate_sites.legacy.json");
const OUT = path.join(DATA_DIR, "candidate_sites.json");

/* ------------------------------------------------------------------ */
/*  Constants — mirrored from the revised pipeline                      */
/* ------------------------------------------------------------------ */

const TAU1 = 0.25;
const TAU2 = 0.4;
const TAU3 = 0.6;

const SHORELINE_BUFFER_M = 50;
const TOP_N_RECOMMENDATIONS = 3;
const EPSILON = 1e-5;

const SERVICE_WEIGHTS = {
  building_density: 0.4,
  road_accessibility: 0.25,
  facility_distance: 0.15,
};

const HAZARD_PENALTY_WEIGHTS = {
  flood_susceptibility: 0.08,
  landslide_susceptibility: 0.07,
  storm_surge_susceptibility: 0.05,
};

const STRONG_T = 0.66;
const WEAK_T = 0.33;

const HAZARD_TEXT = ["no", "low", "moderate", "high"];

const FACTOR_LABELS = {
  building_density: "building footprint density (population proxy)",
  road_accessibility: "road accessibility",
  facility_distance: "distance from existing facilities (service coverage gap)",
};

const SCORE_GUIDE =
  "HOW TO READ SUITABILITY SCORES: Every site receives ONE composite " +
  "suitability score between 0 and 1 that already factors in all service " +
  "criteria (building footprint density as a population proxy, road " +
  "accessibility, and distance from existing healthcare facilities) and all " +
  "hazard penalties (flood, landslide, and storm surge susceptibility). " +
  "Scores closer to 1 indicate HIGHER overall suitability; scores closer to " +
  "0 indicate LOWER suitability. Classification thresholds: below 0.25 = Not " +
  "Suitable; 0.25 to below 0.40 = Low Suitability; 0.40 to below 0.60 = Suitable; " +
  "0.60 and above = Highly Suitable. Individual factor values follow the " +
  "same 0-to-1 direction: for example, a road-accessibility value near zero " +
  "(such as 0.007) means the site is far from the road network and has LOW " +
  "accessibility, while values near 1 mean the site is adjacent to roads. " +
  "Sites within 50 metres of the shoreline are excluded outright, and any " +
  "site with a High hazard designation is never recommended regardless of " +
  "its numeric score. POLARIS is an advisory tool: final siting decisions " +
  "remain with planning officers.";

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

const LAT0 = 7.05;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

/** Local equirectangular projection — sub-metre accurate over one district. */
const toX = (lon) => lon * M_PER_DEG_LON;
const toY = (lat) => lat * M_PER_DEG_LAT;

/** Squared distance from point p to segment ab, all in projected metres. */
function pointSegmentDistSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

/** Ray-casting point-in-polygon over a linear ring of [lon, lat] pairs. */
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat) {
      const xCross = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (lon < xCross) inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  const polygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];

  for (const rings of polygons) {
    if (!rings.length) continue;
    if (!pointInRing(lon, lat, rings[0])) continue;
    // Subtract holes.
    let inHole = false;
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(lon, lat, rings[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function bboxOf(coords) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/* ------------------------------------------------------------------ */
/*  Shoreline distance                                                  */
/* ------------------------------------------------------------------ */

/**
 * Distance in metres from every site to the nearest OSM coastline segment.
 * Ways are pre-projected and bbox-indexed so the O(sites x segments) sweep
 * stays fast; a way is only scanned when it could beat the running best.
 */
function computeShorelineDistances(sites, coastline) {
  const ways = coastline.features
    .filter((f) => f.geometry?.type === "LineString")
    .map((f) => {
      const pts = f.geometry.coordinates.map(([lon, lat]) => [
        toX(lon),
        toY(lat),
      ]);
      return { pts, bbox: bboxOf(pts) };
    })
    .filter((w) => w.pts.length >= 2);

  return sites.map((site) => {
    const px = toX(site.longitude);
    const py = toY(site.latitude);
    let bestSq = Infinity;

    for (const way of ways) {
      // Cheap reject: distance to the way's bbox already exceeds the best hit.
      const dxBox = Math.max(way.bbox.minX - px, 0, px - way.bbox.maxX);
      const dyBox = Math.max(way.bbox.minY - py, 0, py - way.bbox.maxY);
      if (dxBox * dxBox + dyBox * dyBox >= bestSq) continue;

      const { pts } = way;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pointSegmentDistSq(
          px,
          py,
          pts[i][0],
          pts[i][1],
          pts[i + 1][0],
          pts[i + 1][1],
        );
        if (d < bestSq) bestSq = d;
      }
    }
    return Math.sqrt(bestSq);
  });
}

/* ------------------------------------------------------------------ */
/*  Interpretation layer (pipeline Section 10)                          */
/* ------------------------------------------------------------------ */

function interpretSite(site, normalized, hazards, shorelineExcluded) {
  const parts = [];

  parts.push(
    `This site obtained a composite suitability score of ${site.score.toFixed(3)} ` +
      `— scores closer to 1 indicate higher suitability — placing it in the ` +
      `"${site.suitability_class}" class.`,
  );

  const strong = Object.keys(FACTOR_LABELS).filter(
    (f) => normalized[f] >= STRONG_T,
  );
  const weak = Object.keys(FACTOR_LABELS).filter((f) => normalized[f] <= WEAK_T);

  if (strong.length) {
    parts.push(
      `Its main strengths are ${strong.map((f) => FACTOR_LABELS[f]).join(" and ")}.`,
    );
  }
  if (weak.length) {
    parts.push(
      `It is held back by comparatively low ${weak
        .map((f) => FACTOR_LABELS[f])
        .join(" and ")}.`,
    );
  }

  // Panel revision #7 — spell out what a near-zero accessibility value means.
  if (normalized.road_accessibility <= 0.05) {
    parts.push(
      `In particular, the road-accessibility value of ` +
        `${normalized.road_accessibility.toFixed(3)} is very close to zero, ` +
        `which means the site lies far from the mapped road network and is ` +
        `difficult to access.`,
    );
  }

  const hazardNotes = [];
  for (const [key, level] of Object.entries(hazards)) {
    if (level >= 2) {
      const name = key.replace("_susceptibility", "").replace(/_/g, " ");
      hazardNotes.push(`${HAZARD_TEXT[level]} ${name} susceptibility`);
    }
  }
  parts.push(
    hazardNotes.length
      ? `The score is penalized by ${hazardNotes.join(" and ")}.`
      : "No moderate or high hazard designations affect this site.",
  );

  if (shorelineExcluded) {
    parts.push(
      `This site lies within the ${SHORELINE_BUFFER_M}-metre shoreline ` +
        `setback and is therefore EXCLUDED from the recommendation list ` +
        `outright, regardless of its numeric score.`,
    );
  } else if (!site.recommendation_eligible) {
    parts.push(
      "Because at least one hazard layer classifies this site as High, it is " +
        "EXCLUDED from the recommendation list regardless of its numeric score.",
    );
  }

  return parts.join(" ");
}

function classifySuitability(score) {
  if (score >= TAU3) return "Highly Suitable";
  if (score >= TAU2) return "Suitable";
  if (score >= TAU1) return "Low Suitability";
  return "Not Suitable";
}

/* ------------------------------------------------------------------ */

async function readJson(file, optional = false) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (optional) return null;
    throw err;
  }
}

async function main() {
  console.log("POLARIS — rebuilding candidate_sites.json in the revised schema\n");

  const legacy = await readJson(LEGACY);
  if (!Array.isArray(legacy)) {
    throw new Error(
      `${path.relative(ROOT, LEGACY)} is not the legacy site array. ` +
        "This script migrates the pre-defense export only.",
    );
  }

  const norm = await readJson(path.join(LEGACY_DIR, "normalization_params.json"));
  const coastline = await readJson(
    path.join(DATA_DIR, "talomo_coastline.json"),
    true,
  );
  const barangays = await readJson(
    path.join(DATA_DIR, "talomo_barangays.json"),
    true,
  );

  console.log(`   Legacy sites read           : ${legacy.length.toLocaleString()}`);

  /* -- 1. Shoreline distance ------------------------------------------- */
  let shoreline;
  if (coastline?.features?.length) {
    shoreline = computeShorelineDistances(legacy, coastline);
    console.log(
      `   Shoreline distance computed : against ${coastline.features.length} OSM coastline ways`,
    );
  } else {
    shoreline = legacy.map(() => Number.POSITIVE_INFINITY);
    console.warn(
      "   !! No coastline geometry — run `npm run data:geo` first.\n" +
        "      Shoreline distances set to Infinity; no site will be excluded.",
    );
  }

  /* -- 2. Barangay assignment ------------------------------------------ */
  const barangayOf = legacy.map(() => null);
  if (barangays?.features?.length) {
    for (let i = 0; i < legacy.length; i++) {
      for (const f of barangays.features) {
        if (pointInGeometry(legacy[i].longitude, legacy[i].latitude, f.geometry)) {
          barangayOf[i] = f.properties.name;
          break;
        }
      }
    }
    const matched = barangayOf.filter(Boolean).length;
    const distinct = new Set(barangayOf.filter(Boolean)).size;
    console.log(
      `   Barangays assigned          : ${matched.toLocaleString()}/${legacy.length.toLocaleString()} sites across ${distinct} barangays`,
    );
  } else {
    console.warn("   !! No barangay polygons — sites will have no barangay name.");
  }

  /* -- 3. Composite MCDA score (Section 5) ------------------------------ */
  const rawScores = legacy.map(
    (s) =>
      SERVICE_WEIGHTS.building_density * s.building_density_norm +
      SERVICE_WEIGHTS.road_accessibility * s.road_accessibility_norm +
      SERVICE_WEIGHTS.facility_distance * s.facility_distance_norm -
      HAZARD_PENALTY_WEIGHTS.flood_susceptibility * s.flood_norm -
      HAZARD_PENALTY_WEIGHTS.landslide_susceptibility * s.landslide_norm -
      HAZARD_PENALTY_WEIGHTS.storm_surge_susceptibility * s.stormsurge_norm,
  );

  // The pipeline removes shoreline-excluded sites *before* the rescale, so the
  // min/max come from the retained sites only. Excluded sites are kept here so
  // the prototype can render the buffer, but they are clipped, not rescaled.
  const retained = rawScores.filter(
    (_, i) => shoreline[i] >= SHORELINE_BUFFER_M,
  );
  const lo = Math.min(...(retained.length ? retained : rawScores));
  const hi = Math.max(...(retained.length ? retained : rawScores));
  const span = hi - lo || 1;
  const scores = rawScores.map((r) =>
    Math.min(1, Math.max(0, (r - lo) / span)),
  );

  /* -- 4. Assemble site records ----------------------------------------- */
  const bdMax = norm.building_density.max;
  const accMin = norm.road_accessibility.min;
  const accMax = norm.road_accessibility.max;
  const fdMin = norm.facility_distance_m.min;
  const fdMax = norm.facility_distance_m.max;

  const records = legacy.map((s, i) => {
    const hazards = {
      flood_susceptibility: s.flood,
      landslide_susceptibility: s.landslide,
      storm_surge_susceptibility: s.stormsurge,
    };
    const normalized = {
      building_density: s.building_density_norm,
      road_accessibility: s.road_accessibility_norm,
      facility_distance: s.facility_distance_norm,
      flood_susceptibility: s.flood_norm,
      landslide_susceptibility: s.landslide_norm,
      storm_surge_susceptibility: s.stormsurge_norm,
    };

    const shorelineDistance = shoreline[i];
    const shorelineExcluded = shorelineDistance < SHORELINE_BUFFER_M;
    const highHazard = Object.values(hazards).some((h) => h === 3);

    // Recover raw units from the stored min-max normalization.
    const accessibility = normalized.road_accessibility * (accMax - accMin) + accMin;
    const roadDistanceM = 1 / accessibility - EPSILON;

    const record = {
      site_id: s.site_id,
      latitude: s.latitude,
      longitude: s.longitude,
      barangay: barangayOf[i],
      score: Number(scores[i].toFixed(4)),
      suitability_class: classifySuitability(scores[i]),
      recommendation_level: 0,
      recommendation_eligible: !highHazard && !shorelineExcluded,
      interpretation: "",
      factors: {
        building_density: Math.round(normalized.building_density * bdMax),
        road_distance_m: Number(roadDistanceM.toFixed(1)),
        facility_distance_m: Number(
          (normalized.facility_distance * (fdMax - fdMin) + fdMin).toFixed(1),
        ),
        shoreline_distance_m: Number.isFinite(shorelineDistance)
          ? Number(shorelineDistance.toFixed(1))
          : null,
      },
      factors_normalized: Object.fromEntries(
        Object.entries(normalized).map(([k, v]) => [k, Number(v.toFixed(4))]),
      ),
      hazards,
    };

    record.interpretation = interpretSite(
      record,
      normalized,
      hazards,
      shorelineExcluded,
    );
    return record;
  });

  /* -- 5. Recommendation levels 0-4 (Section 9) ------------------------- */
  const CLASS_BASE_LEVEL = {
    "Not Suitable": 0,
    "Low Suitability": 1,
    Suitable: 2,
    "Highly Suitable": 3,
  };
  const highly = records.filter((r) => r.suitability_class === "Highly Suitable");
  const highlySorted = [...highly].sort((a, b) => a.score - b.score);
  const pctOf = new Map(
    highlySorted.map((r, idx) => [r.site_id, (idx + 1) / highlySorted.length]),
  );

  for (const r of records) {
    let level = CLASS_BASE_LEVEL[r.suitability_class];
    if (r.suitability_class === "Highly Suitable") {
      level = (pctOf.get(r.site_id) ?? 0) >= 0.5 ? 4 : 3;
    }
    r.recommendation_level = r.recommendation_eligible ? level : 0;
  }

  /* -- 6. Top-N recommendations ----------------------------------------- */
  const topRecommendations = records
    .filter((r) => r.recommendation_eligible)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N_RECOMMENDATIONS)
    .map((r, idx) => ({
      recommendation_rank: idx + 1,
      site_id: r.site_id,
      score: r.score,
      suitability_class: r.suitability_class,
      latitude: r.latitude,
      longitude: r.longitude,
      barangay: r.barangay,
      interpretation: r.interpretation,
    }));

  const shorelineExcludedCount = records.filter(
    (r) =>
      r.factors.shoreline_distance_m !== null &&
      r.factors.shoreline_distance_m < SHORELINE_BUFFER_M,
  ).length;
  const highHazardCount = records.filter(
    (r) =>
      Object.values(r.hazards).some((h) => h === 3) &&
      !(
        r.factors.shoreline_distance_m !== null &&
        r.factors.shoreline_distance_m < SHORELINE_BUFFER_M
      ),
  ).length;

  const dataset = {
    metadata: {
      project: "POLARIS",
      study_area: "Talomo District, Davao City",
      model: "MCDA composite baseline (hazard-integrated, single configuration)",
      model_status: "provisional",
      model_note:
        "Scores here are the hazard-integrated MCDA composite defined in " +
        "Section 5 of the revised pipeline — the exact pseudo-target the " +
        "Random Forest is trained to reproduce. They are NOT Random Forest " +
        "predictions and are NOT the pre-defense neural network's output, " +
        "which was discarded under panel revision #1. Replace this file with " +
        "outputs/webapp_export/candidate_sites.json from the revised Random " +
        "Forest pipeline for final results; the application reads both.",
      score_guide: SCORE_GUIDE,
      thresholds: { tau1: TAU1, tau2: TAU2, tau3: TAU3 },
      weights: {
        service: SERVICE_WEIGHTS,
        hazard_penalty: HAZARD_PENALTY_WEIGHTS,
      },
      shoreline_buffer_m: SHORELINE_BUFFER_M,
      top_n_recommendations: TOP_N_RECOMMENDATIONS,
      dataset_clarification: {
        raw_osm_records_extracted: null,
        training_candidate_sites: records.length,
        shoreline_excluded_sites: shorelineExcludedCount,
        note:
          "Raw OSM records are elements extracted for feature engineering " +
          "(building footprints, road nodes/edges, facilities); training " +
          "candidate sites are the grid points scored by the model. The two " +
          "figures describe different quantities. The raw-record count is " +
          "reported by the training pipeline and is unavailable in this " +
          "migrated dataset.",
      },
      advisory_note:
        "POLARIS is an advisory decision-support tool; final siting " +
        "decisions remain with planning officers.",
      generated_by: "scripts/migrate-sites.mjs",
      generated_at: new Date().toISOString(),
    },
    top_recommendations: topRecommendations,
    sites: records,
  };

  await writeFile(OUT, JSON.stringify(dataset), "utf8");

  const classCounts = records.reduce((acc, r) => {
    acc[r.suitability_class] = (acc[r.suitability_class] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n   Candidate sites written     : ${records.length.toLocaleString()}`);
  console.log(`   Excluded by ${SHORELINE_BUFFER_M} m shoreline : ${shorelineExcludedCount.toLocaleString()}`);
  console.log(`   Ineligible (High hazard)    : ${highHazardCount.toLocaleString()}`);
  console.log("   Class distribution          :");
  for (const [k, v] of Object.entries(classCounts)) {
    console.log(`      ${k.padEnd(22)}: ${v.toLocaleString()}`);
  }
  console.log("   Top recommendations         :");
  for (const t of topRecommendations) {
    console.log(
      `      #${t.recommendation_rank} ${t.site_id} score ${t.score.toFixed(3)} (${t.barangay ?? "—"})`,
    );
  }
  console.log(`\n   -> ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

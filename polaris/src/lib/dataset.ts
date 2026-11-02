import type { FeatureCollection } from "geojson";

import { isInsideGeometry } from "@/lib/geo";
import type { PolarisDataset } from "@/types/polaris";

/**
 * Static, load-once data access.
 *
 * The application is a pure presentation layer: no inference runs in the
 * browser, and the scored dataset never changes on its own. So everything is
 * fetched exactly once, memoised at module scope, and re-read only when the
 * user explicitly asks for it via the Refresh control (`reload()`).
 */

export interface PolarisBundle {
  dataset: PolarisDataset;
  boundary: FeatureCollection | null;
  coastline: FeatureCollection | null;
  /**
   * Existing health facilities, clipped to the district boundary for display.
   * Not the full referent for `facility_distance_m` — that was measured against
   * the pipeline's unclipped set, which extends past Talomo.
   */
  facilities: FeatureCollection | null;
  /** Barangay names that actually contain at least one scored site. */
  barangays: BarangayEntry[];
  loadedAt: Date;
}

export interface BarangayEntry {
  name: string;
  latitude: number;
  longitude: number;
  siteCount: number;
}

const DATA_BASE = `${import.meta.env.BASE_URL}data`;

let inflight: Promise<PolarisBundle> | null = null;

async function getJson<T>(path: string, cacheBust: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${path}${cacheBust}`, {
    cache: cacheBust ? "reload" : "default",
  });
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
  }
  // A host with an SPA fallback answers a missing file with index.html and
  // HTTP 200. Name that case instead of surfacing a raw JSON parse error.
  if (res.headers.get("content-type")?.includes("text/html")) {
    throw new Error(
      `Failed to load ${path} (the server returned a web page, not JSON — the file is probably missing)`,
    );
  }
  return (await res.json()) as T;
}

async function getOptionalJson<T>(
  path: string,
  cacheBust: string,
): Promise<T | null> {
  try {
    return await getJson<T>(path, cacheBust);
  } catch {
    // Boundary/coastline are cartographic garnish — the app is fully usable
    // without them, so a missing file must not block the scored sites.
    console.warn(`[POLARIS] optional layer "${path}" unavailable`);
    return null;
  }
}

/**
 * Derives the barangay list for the search box from the scored sites
 * themselves, so the dropdown can only ever offer a barangay that actually has
 * results. Each entry's coordinate is the centroid of its sites.
 */
function deriveBarangays(dataset: PolarisDataset): BarangayEntry[] {
  const acc = new Map<string, { lat: number; lon: number; n: number }>();

  for (const site of dataset.sites) {
    const name = site.barangay;
    if (!name) continue;
    const entry = acc.get(name) ?? { lat: 0, lon: 0, n: 0 };
    entry.lat += site.latitude;
    entry.lon += site.longitude;
    entry.n += 1;
    acc.set(name, entry);
  }

  return [...acc.entries()]
    .map(([name, { lat, lon, n }]) => ({
      name,
      latitude: lat / n,
      longitude: lon / n,
      siteCount: n,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Drops facilities that fall outside the district boundary.
 *
 * The training pipeline exports every health facility it pulled from OSM,
 * which reaches across Davao City — the last district run carried 190, of which
 * 141 sat outside Talomo (Cabantian, District B, Brokenshire and the like).
 * Drawn on the map they read as context the study never claimed, and they pull
 * the eye far outside the area the scores actually cover.
 *
 * This filter lives here rather than in the exported JSON on purpose: the data
 * files are overwritten wholesale on every pipeline sync, so a fix applied to
 * `talomo_facilities.json` would be undone by the next `outputs_district` drop.
 *
 * Note this is a *display* filter only. `facility_distance_m` was computed
 * against the full set, and a facility just over the border legitimately serves
 * people near it — so the scores are left exactly as the pipeline produced them.
 */
function facilitiesWithinBoundary(
  facilities: FeatureCollection | null,
  boundary: FeatureCollection | null,
): FeatureCollection | null {
  if (!facilities) return null;

  // Without a boundary there is nothing to test against. Keep the full set
  // rather than silently rendering an empty layer.
  const outline = boundary?.features?.[0]?.geometry;
  if (!outline) return facilities;

  const kept = facilities.features.filter((feature) => {
    if (feature.geometry?.type !== "Point") return false;
    const [lon, lat] = feature.geometry.coordinates;
    return isInsideGeometry(lon, lat, outline);
  });

  if (kept.length === facilities.features.length) return facilities;

  console.info(
    `[POLARIS] facilities layer: showing ${kept.length} of ` +
      `${facilities.features.length} (dropped ` +
      `${facilities.features.length - kept.length} outside Talomo)`,
  );

  return { ...facilities, features: kept };
}

async function fetchBundle(force: boolean): Promise<PolarisBundle> {
  const cacheBust = force ? `?t=${Date.now()}` : "";

  const [dataset, boundary, coastline, facilities] = await Promise.all([
    getJson<PolarisDataset>("candidate_sites.json", cacheBust),
    getOptionalJson<FeatureCollection>("talomo_boundary.json", cacheBust),
    getOptionalJson<FeatureCollection>("talomo_coastline.json", cacheBust),
    getOptionalJson<FeatureCollection>("talomo_facilities.json", cacheBust),
  ]);

  if (!Array.isArray(dataset?.sites)) {
    throw new Error(
      "candidate_sites.json is not in the expected format. Expected an object " +
        "with `metadata`, `top_recommendations` and `sites`. Run " +
        "`npm run data:migrate`, or export a fresh file from the training pipeline.",
    );
  }

  return {
    dataset,
    boundary,
    coastline,
    facilities: facilitiesWithinBoundary(facilities, boundary),
    barangays: deriveBarangays(dataset),
    loadedAt: new Date(),
  };
}

/** Loads the bundle once; subsequent calls resolve from the module cache. */
export function loadBundle(): Promise<PolarisBundle> {
  inflight ??= fetchBundle(false);
  return inflight;
}

/** Discards the cache and re-reads from the network. User-initiated only. */
export function reloadBundle(): Promise<PolarisBundle> {
  inflight = fetchBundle(true);
  return inflight;
}

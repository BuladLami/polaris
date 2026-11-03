import {
  findNearestSite,
  isInsideBounds,
  sitesWithinRadius,
  type LngLatBounds,
} from "@/lib/geo";
import { isShorelineExcluded } from "@/lib/suitability";
import type {
  RankedSite,
  RecommendationSummary,
  Site,
} from "@/types/polaris";

/**
 * Search configuration and the pure ranking logic behind recommendation mode.
 *
 * Everything here is free of React and of component state, so the scoring
 * behaviour can be read, reasoned about and tested on its own. The hooks in
 * `src/hooks/` own the state; this file owns the rules.
 */

/* ------------------------------------------------------------------ */
/*  Bounds                                                             */
/* ------------------------------------------------------------------ */

export const MIN_RADIUS_M = 100;
export const MAX_RADIUS_M = 5000;
export const DEFAULT_RADIUS_M = "500";

/**
 * Bounds on the shortlist size. The upper bound is deliberate: panel revision
 * #4 exists to stop the tool dumping an unreviewable list on planning staff,
 * so the field widens the shortlist without ever removing the cap.
 */
export const MIN_TOP_N = 1;
export const MAX_TOP_N = 10;
export const DEFAULT_TOP_N = 3;

/** A click farther than this from any scored site is off-grid (sea / outside). */
const OFF_GRID_M = 1000;

/* ------------------------------------------------------------------ */
/*  Input parsing                                                      */
/* ------------------------------------------------------------------ */

export interface ShortlistSize {
  /** False when the field is empty, non-numeric or out of bounds. */
  valid: boolean;
  /** Always usable: falls back to the default when the input is invalid. */
  value: number;
}

/**
 * Parses the "sites to show" field once. `valid` gates the search and drives
 * the error message; `value` is what slices the results. Deriving both from a
 * single parse keeps the field from displaying one count and ranking by
 * another.
 */
export function parseShortlistSize(input: string): ShortlistSize {
  const parsed = Number.parseInt(input, 10);
  const valid =
    Number.isFinite(parsed) && parsed >= MIN_TOP_N && parsed <= MAX_TOP_N;
  return { valid, value: valid ? parsed : DEFAULT_TOP_N };
}

/** Optional sign, digits, at most one decimal point, and nothing else. */
const DECIMAL_DEGREES = /^[+-]?(\d+\.?\d*|\.\d+)$/;

/**
 * A latitude/longitude pair, or null while either field is unusable. The whole
 * field is checked first: `parseFloat` alone stops at the first bad character,
 * so "7.0730abc" would quietly become 7.073.
 */
export function parseCoordinates(
  latitude: string,
  longitude: string,
): { lat: number; lon: number } | null {
  const [lat, lon] = [latitude.trim(), longitude.trim()];
  if (!DECIMAL_DEGREES.test(lat) || !DECIMAL_DEGREES.test(lon)) return null;
  return { lat: Number.parseFloat(lat), lon: Number.parseFloat(lon) };
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Returns a message explaining why a point cannot be used, or null when it is
 * fine. Shared by both modes so "outside the district" means the same thing
 * whether you are searching or evaluating.
 */
export function validateSearchPoint(
  sites: readonly Site[],
  bounds: LngLatBounds | null,
  lat: number,
  lon: number,
): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return "Enter a valid latitude and longitude, or click the map.";
  }
  if (bounds && !isInsideBounds(lat, lon, bounds, 0.01)) {
    return "That point is outside Talomo District. Pick a location inside the district.";
  }
  const nearest = findNearestSite(sites, lat, lon);
  if (!nearest || nearest.distanceM > OFF_GRID_M) {
    return "No scored site lies near that point — it is likely offshore or outside the district. Pick a location on land inside the district.";
  }
  return null;
}

export function validateRadius(radiusM: number): string | null {
  if (
    !Number.isFinite(radiusM) ||
    radiusM < MIN_RADIUS_M ||
    radiusM > MAX_RADIUS_M
  ) {
    return `Enter a search radius between ${MIN_RADIUS_M} and ${MAX_RADIUS_M.toLocaleString()} metres.`;
  }
  return null;
}

export const SHORTLIST_SIZE_ERROR = `Enter how many sites to show, between ${MIN_TOP_N} and ${MAX_TOP_N}.`;

/* ------------------------------------------------------------------ */
/*  Ranking                                                            */
/* ------------------------------------------------------------------ */

export interface RankingResult {
  ranked: RankedSite[];
  summary: RecommendationSummary;
}

/**
 * The single place ranking happens.
 *
 * Sites inside the radius are counted, the two hard gates are tallied for the
 * "withheld from this shortlist" note, and only eligible sites compete for the
 * top N. Ineligible sites are never silently ranked and dropped — they are
 * excluded and reported.
 */
export function rankSitesInRadius(
  sites: readonly Site[],
  lat: number,
  lon: number,
  radiusM: number,
  topN: number,
  bufferM: number,
): RankingResult {
  const inRadius = sitesWithinRadius(sites, lat, lon, radiusM);

  // One pass rather than three: the shoreline test used to run twice per site
  // and the list was walked a third time to collect the eligible ones.
  // Eligibility is still read straight from the dataset's own flag — the
  // shoreline tally is a separate question about the same site, not a gate
  // applied on top of it.
  let shorelineExcluded = 0;
  let hazardExcluded = 0;
  const eligible: typeof inRadius = [];

  for (const entry of inRadius) {
    if (isShorelineExcluded(entry.site, bufferM)) shorelineExcluded += 1;
    else if (!entry.site.recommendation_eligible) hazardExcluded += 1;

    if (entry.site.recommendation_eligible) eligible.push(entry);
  }

  const ranked: RankedSite[] = eligible
    .sort((a, b) => b.site.score - a.site.score)
    .slice(0, topN)
    .map(({ site, distanceM }, i) => ({
      ...site,
      localRank: i + 1,
      distanceFromCentreM: distanceM,
    }));

  return {
    ranked,
    summary: { inRadius: inRadius.length, shorelineExcluded, hazardExcluded },
  };
}

/** Zoom to settle on after a search, tightened for small radii. */
export function zoomForRadius(radiusM: number): number {
  if (radiusM <= 400) return 16;
  if (radiusM <= 1200) return 14.6;
  return 13.4;
}

import type { AppMode } from "@/types/polaris";

/**
 * What a click on the map does (post-defense revision).
 *
 * Recommendation mode: a click on a site dot opens that site's breakdown (the
 * cursor is a hand there); a facility ring with details opens its card; a click
 * anywhere else places the search centre. Only the dots take the click, so the
 * open map between them is always free for placing the centre.
 *
 * Evaluation mode: a click always evaluates the clicked point. On a site dot
 * that evaluates that same site, so nothing is lost.
 */
export type MapClick =
  | { kind: "facility"; fid: number }
  | { kind: "site"; siteId: string }
  | { kind: "point" };

/** What is under the cursor: a clickable facility ring and/or a site dot. */
export interface MapHit {
  facilityId: number | null;
  siteId: string | null;
}

export function resolveMapClick(mode: AppMode, hit: MapHit): MapClick {
  if (mode !== "recommendation") return { kind: "point" };
  // Facilities are drawn over the dots and own their hover card, so they win.
  if (hit.facilityId !== null) return { kind: "facility", fid: hit.facilityId };
  if (hit.siteId !== null) return { kind: "site", siteId: hit.siteId };
  return { kind: "point" };
}

/** True when facility rings and site dots take the click (Recommend mode). */
export function objectClicksEnabled(mode: AppMode): boolean {
  return mode === "recommendation";
}

/** The dot layers a Recommend-mode click can open, topmost first. */
export const CLICKABLE_SITE_LAYERS = ["result-dots", "site-dots"] as const;

/** The last line of a site's hover card: what a click there will do. */
export function siteHoverHint(mode: AppMode): string {
  return mode === "recommendation"
    ? "Click for the full breakdown"
    : "Click to evaluate this site";
}

import type { AppMode } from "@/types/polaris";

/**
 * What a click on the map does (post-defense revision).
 *
 * Recommendation mode: a click always places the search centre, even when it
 * lands on a site dot or inside a site's tile. Site details open from the
 * result cards and the numbered markers instead. A facility ring that has
 * details still opens its card: it is not a site, and its hover card says so.
 *
 * Evaluation mode: a click always evaluates the clicked point. On a site dot
 * that evaluates that same site, so nothing is lost.
 */
export type MapClick = { kind: "facility"; fid: number } | { kind: "point" };

export function resolveMapClick(mode: AppMode, facilityId: number | null): MapClick {
  if (mode === "recommendation" && facilityId !== null) {
    return { kind: "facility", fid: facilityId };
  }
  return { kind: "point" };
}

/** True when facility rings take the click (their details card opens). */
export function facilityClicksEnabled(mode: AppMode): boolean {
  return mode === "recommendation";
}

/** The last line of a site's hover card: what a click there will do. */
export function siteHoverHint(mode: AppMode): string {
  return mode === "recommendation"
    ? "Click to place the search centre here"
    : "Click to evaluate this site";
}

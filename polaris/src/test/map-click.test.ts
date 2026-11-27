/**
 * Map clicks (post-defense). Recommend mode: a site dot opens its breakdown,
 * a facility ring its card, open map places the search centre. Evaluate mode:
 * every click evaluates the point.
 */
import { describe, expect, it } from "vitest";

import {
  CLICKABLE_SITE_LAYERS,
  objectClicksEnabled,
  resolveMapClick,
  siteHoverHint,
} from "@/components/map/map-click";

const none = { facilityId: null, siteId: null };

describe("Recommend mode", () => {
  it("opens the site's breakdown when a site dot is clicked", () => {
    expect(resolveMapClick("recommendation", { ...none, siteId: "TALOMO_0349" })).toEqual({
      kind: "site",
      siteId: "TALOMO_0349",
    });
  });

  it("places the search centre when the click is on open map", () => {
    expect(resolveMapClick("recommendation", none)).toEqual({ kind: "point" });
  });

  it("opens a facility's details when its ring is clicked, even over a dot", () => {
    expect(objectClicksEnabled("recommendation")).toBe(true);
    expect(resolveMapClick("recommendation", { facilityId: 7, siteId: "TALOMO_0349" })).toEqual({
      kind: "facility",
      fid: 7,
    });
  });

  it("takes clicks on the dots only, never on a site's tile", () => {
    expect([...CLICKABLE_SITE_LAYERS]).toEqual(["result-dots", "site-dots"]);
  });

  it("tells the reader on the hover card that a click opens the breakdown", () => {
    expect(siteHoverHint("recommendation")).toBe("Click for the full breakdown");
  });
});

describe("Evaluate mode", () => {
  it("evaluates the clicked point, over a site dot or not", () => {
    expect(objectClicksEnabled("evaluation")).toBe(false);
    expect(resolveMapClick("evaluation", { ...none, siteId: "TALOMO_0349" })).toEqual({ kind: "point" });
    expect(resolveMapClick("evaluation", none)).toEqual({ kind: "point" });
  });

  it("evaluates the point even over a facility ring", () => {
    expect(resolveMapClick("evaluation", { facilityId: 7, siteId: null })).toEqual({ kind: "point" });
  });

  it("tells the reader a click evaluates the site", () => {
    expect(siteHoverHint("evaluation")).toBe("Click to evaluate this site");
  });
});

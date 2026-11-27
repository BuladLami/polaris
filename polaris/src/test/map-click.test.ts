/**
 * Recommend-mode click conflict (post-defense): a map click never opens a
 * site. In Recommend mode it places the search centre, even over a site dot or
 * tile; in Evaluate mode it evaluates the point.
 */
import { describe, expect, it } from "vitest";

import {
  facilityClicksEnabled,
  resolveMapClick,
  siteHoverHint,
} from "@/components/map/map-click";

describe("Recommend mode", () => {
  it("places the search centre on a click over a site dot or tile", () => {
    // Site hits are not an input at all: whatever is under the cursor, a click
    // with no facility ring under it is a point.
    expect(resolveMapClick("recommendation", null)).toEqual({ kind: "point" });
  });

  it("still opens a facility's details when its ring is clicked", () => {
    expect(facilityClicksEnabled("recommendation")).toBe(true);
    expect(resolveMapClick("recommendation", 7)).toEqual({ kind: "facility", fid: 7 });
  });

  it("tells the reader on the hover card that a click places the search centre", () => {
    expect(siteHoverHint("recommendation")).toBe("Click to place the search centre here");
  });
});

describe("Evaluate mode", () => {
  it("evaluates the clicked point, over a site or not", () => {
    expect(resolveMapClick("evaluation", null)).toEqual({ kind: "point" });
  });

  it("evaluates the point even over a facility ring", () => {
    expect(facilityClicksEnabled("evaluation")).toBe(false);
    expect(resolveMapClick("evaluation", 7)).toEqual({ kind: "point" });
  });

  it("tells the reader a click evaluates the site", () => {
    expect(siteHoverHint("evaluation")).toBe("Click to evaluate this site");
  });
});

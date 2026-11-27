/**
 * The user-facing wording added after the defense: the tile note in the map
 * key, the class ranges, and the building-density note.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EvaluationPanel } from "@/components/EvaluationPanel";
import { MapLegend } from "@/components/MapLegend";
import { FactorRow } from "@/components/ScoreDisplay";
import { ScoreGuideBody } from "@/components/ScoreGuideDialog";
import { BUILDING_DENSITY_NOTE, TILE_NOTE } from "@/lib/suitability";

import { loadDataset } from "./data";

// The map key reads the window width to decide whether it starts open.
vi.stubGlobal("window", { innerWidth: 1920 });

const legend = (tiles: boolean) =>
  renderToStaticMarkup(
    <MapLegend
      shorelineBufferM={50}
      showShorelineBuffer={false}
      onToggleShorelineBuffer={() => {}}
      showAllSites
      onToggleAllSites={() => {}}
      showFacilities
      onToggleFacilities={() => {}}
      facilityCount={49}
      siteCount={1502}
      excludedCount={16}
      tiles={tiles}
    />,
  );

/** renderToStaticMarkup escapes text; compare against the escaped form. */
const html = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#x27;");

describe("map key", () => {
  it("states the exact tile note", () => {
    expect(TILE_NOTE).toBe(
      "Each tile is the area a site stands for. A facility can be placed anywhere suitable inside it, after checking the actual site.",
    );
    expect(legend(true)).toContain(html(TILE_NOTE));
  });

  it("drops the tile note and uses round swatches when sites are drawn as dots", () => {
    const dots = legend(false);
    expect(dots).not.toContain(html(TILE_NOTE));
    expect(dots).not.toContain("rounded-[2px]");
    expect(legend(true)).toContain("rounded-[2px]");
  });

  it("lists the four classes with their ranges", () => {
    const out = legend(true);
    for (const text of ["Highly Suitable", "0.60 and above", "Suitable",
      "0.40 to below 0.60", "Low Suitability", "0.25 to below 0.40",
      "Not Suitable", "below 0.25"]) {
      expect(out).toContain(text);
    }
    expect(out).not.toContain("Moderately");
  });
});

describe("building density note", () => {
  it("has the exact wording", () => {
    expect(BUILDING_DENSITY_NOTE).toBe(
      "Building density counts buildings, not people. A tall condominium counts as one building, the same as a house.",
    );
  });

  it("appears in the score guide", () => {
    expect(renderToStaticMarkup(<ScoreGuideBody />)).toContain(html(BUILDING_DENSITY_NOTE));
    expect(renderToStaticMarkup(<ScoreGuideBody compact />)).toContain(
      html(BUILDING_DENSITY_NOTE),
    );
  });

  it("appears under a factor row that is given it (the site details dialog)", () => {
    const row = renderToStaticMarkup(
      <FactorRow label="Buildings nearby" normalized={0.4} note={BUILDING_DENSITY_NOTE} />,
    );
    expect(row).toContain(html(BUILDING_DENSITY_NOTE));
  });

  it("appears in the evaluation panel, and the pre-computed text is untouched", () => {
    const site = loadDataset().sites[0];
    const out = renderToStaticMarkup(
      <EvaluationPanel
        result={{ latitude: site.latitude, longitude: site.longitude, site,
          distanceM: 10, outsideCoverage: false }}
        metadata={null}
        onOpenDetails={() => {}}
      />,
    );
    expect(out).toContain(html(BUILDING_DENSITY_NOTE));
    expect(site.interpretation).not.toContain("condominium");
  });
});

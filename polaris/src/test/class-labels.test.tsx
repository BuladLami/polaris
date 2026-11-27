/**
 * Post-defense revision: the second class is "Suitable", not "Moderately
 * Suitable". Only the label changed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScoreGuideBody } from "@/components/ScoreGuideDialog";
import { SuitabilityBadge } from "@/components/ScoreDisplay";
import { CLASS_INDEX } from "@/components/map/site-features";
import { normalizeClassLabels } from "@/lib/dataset";
import {
  CLASS_COLOR_VAR,
  CLASS_HEX,
  SUITABILITY_CLASSES,
} from "@/lib/suitability";
import type { PolarisDataset, Site } from "@/types/polaris";

import { dataPath, loadDataset, readText } from "./data";

const LABELS = ["Highly Suitable", "Suitable", "Low Suitability", "Not Suitable"];

describe("class labels", () => {
  it("are the four post-defense labels, best first", () => {
    expect(SUITABILITY_CLASSES).toEqual(LABELS);
  });

  it("have a colour, a map index and a CSS token for every label", () => {
    for (const cls of SUITABILITY_CLASSES) {
      expect(CLASS_HEX[cls]).toBeDefined();
      expect(CLASS_COLOR_VAR[cls]).toBeDefined();
      expect(CLASS_INDEX[cls]).toBeTypeOf("number");
    }
    expect(Object.keys(CLASS_HEX).sort()).toEqual([...LABELS].sort());
  });

  it("render as 'Suitable' and never as 'Moderately Suitable'", () => {
    const badge = renderToStaticMarkup(<SuitabilityBadge suitabilityClass="Suitable" />);
    expect(badge).toContain("Suitable");
    const guide = renderToStaticMarkup(<ScoreGuideBody />);
    for (const label of LABELS) expect(guide).toContain(label);
    expect(guide).not.toContain("Moderately");
  });
});

describe("the deployed candidate_sites.json", () => {
  const raw = readText(dataPath("candidate_sites.json"));
  const dataset = loadDataset();

  it("no longer contains the retired label", () => {
    expect(raw).not.toContain("Moderately");
  });

  it("uses only the four labels, on sites and on the shortlist", () => {
    for (const s of dataset.sites) expect(LABELS).toContain(s.suitability_class);
    for (const r of dataset.top_recommendations) expect(LABELS).toContain(r.suitability_class);
  });

  it("keeps the class counts of the 3 November 2026 run", () => {
    const counts: Record<string, number> = {};
    for (const s of dataset.sites) {
      counts[s.suitability_class] = (counts[s.suitability_class] ?? 0) + 1;
    }
    const expected = {
      "Highly Suitable": 37,
      Suitable: 307,
      "Low Suitability": 920,
      "Not Suitable": 238,
    };
    expect(counts).toEqual(expected);
    const meta = (dataset.metadata as unknown as Record<string, unknown>)
      .suitability_class_counts;
    expect(meta).toEqual(expected);
  });
});

describe("normalizeClassLabels (older exports)", () => {
  const site = (cls: string, id = "S1") =>
    ({ site_id: id, score: 0.45, suitability_class: cls }) as unknown as Site;
  const dataset = (sites: Site[]) =>
    ({
      metadata: {},
      top_recommendations: [
        { site_id: "S1", score: 0.45, suitability_class: "Moderately Suitable" },
      ],
      sites,
    }) as unknown as PolarisDataset;

  it("maps 'Moderately Suitable' to 'Suitable' and touches nothing else", () => {
    const out = normalizeClassLabels(
      dataset([site("Moderately Suitable"), site("Low Suitability", "S2")]),
    );
    expect(out.sites.map((s) => s.suitability_class)).toEqual(["Suitable", "Low Suitability"]);
    expect(out.top_recommendations[0].suitability_class).toBe("Suitable");
    expect(out.sites[0].score).toBe(0.45);
    expect(out.sites[0].site_id).toBe("S1");
  });

  it("passes an already-relabelled export through unchanged", () => {
    const current = loadDataset();
    expect(normalizeClassLabels(current)).toBe(current);
  });
});

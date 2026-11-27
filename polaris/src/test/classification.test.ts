/**
 * Class boundaries: each class runs from its threshold up to, but not
 * including, the next (τ ≤ ŷ < next τ). A score of exactly 0.25, 0.40 or 0.60
 * belongs to the class above.
 */
import { describe, expect, it } from "vitest";

import {
  classifyScore,
  classRange,
  DEFAULT_THRESHOLDS,
} from "@/lib/suitability";

import { loadDataset, readText, REPO_ROOT } from "./data";
import path from "node:path";
import fs from "node:fs";

describe("classifyScore at the thresholds", () => {
  it.each([
    [0.25, "Low Suitability"],
    [0.4, "Suitable"],
    [0.6, "Highly Suitable"],
  ])("a score of exactly %s is %s (the upper class)", (score, cls) => {
    expect(classifyScore(score)).toBe(cls);
  });

  it.each([
    [0.2499999, "Not Suitable"],
    [0.3999999, "Low Suitability"],
    [0.5999999, "Suitable"],
  ])("a score just below, %s, is %s", (score, cls) => {
    expect(classifyScore(score)).toBe(cls);
  });

  it("covers the ends of the scale", () => {
    expect(classifyScore(0)).toBe("Not Suitable");
    expect(classifyScore(1)).toBe("Highly Suitable");
  });
});

describe("classRange wording", () => {
  it("says where each class starts and that it stops below the next threshold", () => {
    const t = DEFAULT_THRESHOLDS;
    expect(classRange("Not Suitable", t)).toBe("below 0.25");
    expect(classRange("Low Suitability", t)).toBe("0.25 to below 0.40");
    expect(classRange("Suitable", t)).toBe("0.40 to below 0.60");
    expect(classRange("Highly Suitable", t)).toBe("0.60 and above");
  });
});

describe("the deployed dataset follows the same rule", () => {
  const dataset = loadDataset();

  it("gives every site the class its exported score falls in", () => {
    const wrong = dataset.sites.filter(
      (s) => classifyScore(s.score, dataset.metadata.thresholds) !== s.suitability_class,
    );
    expect(wrong.map((s) => s.site_id)).toEqual([]);
  });

  it("puts the one site scored exactly 0.25 in Low Suitability", () => {
    const atBoundary = dataset.sites.filter((s) => [0.25, 0.4, 0.6].includes(s.score));
    expect(atBoundary.map((s) => [s.site_id, s.suitability_class])).toEqual([
      ["TALOMO_0914", "Low Suitability"],
    ]);
  });
});

describe("the pipeline classifier", () => {
  const notebook = path.join(REPO_ROOT, "pipeline", "POLARIS_model.ipynb");
  const present = fs.existsSync(notebook);

  it.skipIf(!present)("uses strict '<' in threshold order and the new label", () => {
    const nb = JSON.parse(readText(notebook)) as { cells: { source: string[] }[] };
    const code = nb.cells.map((c) => c.source.join("")).join("\n");
    const f14 = code.slice(code.indexOf("def f14_classify"), code.indexOf("_reg('F14'"));
    const order = ["if score < TAU1:", "return CLASS_NOT", "if score < TAU2:",
      "return CLASS_LOW", "if score < TAU3:", "return CLASS_MOD", "return CLASS_HIGH"];
    let at = -1;
    for (const step of order) {
      const next = f14.indexOf(step, at + 1);
      expect(next, step).toBeGreaterThan(at);
      at = next;
    }
    expect(code).toContain("CLASS_MOD, CLASS_HIGH = 'Suitable', 'Highly Suitable'");
    expect(code).toContain(
      "EXPORT_CLASS_LABELS = {'Highly Suitable', 'Suitable', 'Low Suitability', 'Not Suitable'}",
    );
  });
});

/**
 * Project NOAH hazard overlays (post-defense, Sir Ian / Ma'am Regina): three
 * independent toggles, off by default, drawn under everything else, and
 * matching the hazard class every site was scored with.
 */
import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { FeatureCollection } from "geojson";
import { describe, expect, it, vi } from "vitest";

import { MapLegend } from "@/components/MapLegend";
import { LAYER_ORDER } from "@/components/map/layer-order";
import { isInsideGeometry } from "@/lib/geo";
import {
  HAZARD_LAYERS,
  HAZARD_NOTE,
  HAZARD_TOGGLES_OFF,
  toggleHazard,
  type HazardToggles,
} from "@/lib/hazards";

import { APP_ROOT, dataPath, loadDataset, readText } from "./data";
import path from "node:path";

vi.stubGlobal("window", { innerWidth: 1920 });

const legend = (hazards: HazardToggles) =>
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
      tiles
      hazards={hazards}
      onToggleHazard={() => {}}
    />,
  );

/** The checkbox for one label in the rendered legend, checked or not. */
const isChecked = (html: string, label: string) => {
  const at = html.indexOf(`>${label}</span>`);
  expect(at, label).toBeGreaterThan(-1);
  const input = html.slice(html.lastIndexOf("<input", at), at);
  return /\schecked(=|\s|>|\/)/.test(input);
};

describe("hazard toggles", () => {
  it("start off", () => {
    expect(Object.values(HAZARD_TOGGLES_OFF)).toEqual([false, false, false]);
    const html = legend(HAZARD_TOGGLES_OFF);
    for (const layer of HAZARD_LAYERS) expect(isChecked(html, layer.label)).toBe(false);
    // No Low/Moderate/High key until an overlay is on.
    expect(html).not.toContain("data-hazard-key");
  });

  it("switch independently of each other", () => {
    for (const layer of HAZARD_LAYERS) {
      const on = toggleHazard(HAZARD_TOGGLES_OFF, layer.key);
      for (const other of HAZARD_LAYERS) {
        expect(on[other.key]).toBe(other.key === layer.key);
      }
      expect(toggleHazard(on, layer.key)).toEqual(HAZARD_TOGGLES_OFF);
    }
    const all = HAZARD_LAYERS.reduce((s, l) => toggleHazard(s, l.key), HAZARD_TOGGLES_OFF);
    expect(Object.values(all)).toEqual([true, true, true]);
    const html = legend(all);
    for (const layer of HAZARD_LAYERS) expect(isChecked(html, layer.label)).toBe(true);
  });

  it("show the Low / Moderate / High key and the note", () => {
    const html = legend({ ...HAZARD_TOGGLES_OFF, flood: true });
    expect(html).toContain("data-hazard-key");
    for (const word of ["Low", "Moderate", "High"]) expect(html).toContain(`${word}</li>`);
    expect(HAZARD_NOTE).toBe(
      "Hazard areas come from Project NOAH maps. Turn one on to see why a site is marked unsafe.",
    );
    expect(html).toContain(HAZARD_NOTE);
  });
});

describe("hazard layer order", () => {
  const index = (id: string) => (LAYER_ORDER as readonly string[]).indexOf(id);
  const hazardIds = HAZARD_LAYERS.flatMap((l) => [`hazard-${l.key}`, `hazard-${l.key}-line`]);

  it("puts every hazard layer at the bottom, just above the basemap", () => {
    expect(hazardIds.map(index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps tiles, the shoreline band, dots and facilities above the hazards", () => {
    const topHazard = Math.max(...hazardIds.map(index));
    for (const above of [
      "highlight-tile",
      "highlight-tile-outline",
      "shoreline-buffer-band",
      "site-dots",
      "facility-points",
      "result-dots",
    ]) {
      expect(index(above), above).toBeGreaterThan(topHazard);
    }
    expect(index("highlight-tile")).toBeLessThan(index("shoreline-buffer-band"));
    expect(index("shoreline-buffer-band")).toBeLessThan(index("facility-points"));
  });
});

describe("overlay against the site data", () => {
  const fixture = path.join(APP_ROOT, "src", "test", "fixtures", "site_grid_points.json");
  const points = JSON.parse(readText(fixture)).points as Record<string, [number, number]>;
  const sites = loadDataset().sites;

  it.each(HAZARD_LAYERS.map((l) => [l.label, l] as const))(
    "%s: the overlay class at every site's grid point equals the site's class",
    (_label, layer) => {
      const file = dataPath(layer.file);
      expect(fs.existsSync(file), layer.file).toBe(true);
      const fc = JSON.parse(readText(file)) as FeatureCollection;
      const mismatches: string[] = [];
      for (const site of sites) {
        const [lon, lat] = points[site.site_id];
        let cls = 0;
        for (const f of fc.features) {
          const c = Number(f.properties?.hazard_class);
          if (c > cls && isInsideGeometry(lon, lat, f.geometry)) cls = c;
        }
        if (cls !== site.hazards[layer.siteKey]) mismatches.push(site.site_id);
      }
      expect(mismatches).toEqual([]);
    },
    60_000,
  );
});

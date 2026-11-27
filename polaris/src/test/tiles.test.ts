/**
 * Site tiles: one 250 m cell per candidate site, joined to the site by id.
 */
import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";

import {
  CLASS_INDEX,
  tilesToFeatureCollection,
} from "@/components/map/site-features";
import { beforeIdFor, LAYER_ORDER } from "@/components/map/layer-order";
import { findNearestSite, isInsideGeometry } from "@/lib/geo";
import { shorelineBufferOf } from "@/lib/suitability";

import { loadDataset, loadTiles } from "./data";

const dataset = loadDataset();
const tiles = loadTiles();
const bufferM = shorelineBufferOf(dataset.metadata);

describe("talomo_site_tiles.json coverage", () => {
  const ids = tiles.features.map((f) => f.properties?.site_id as string);

  it("has exactly one tile for every site, and no tile without a site", () => {
    const siteIds = dataset.sites.map((s) => s.site_id);
    expect(ids.length).toBe(siteIds.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...siteIds].sort());
  });

  it("carries no score data — only the id to join on", () => {
    for (const f of tiles.features) {
      expect(Object.keys(f.properties ?? {})).toEqual(["site_id"]);
      expect(["Polygon", "MultiPolygon"]).toContain(f.geometry.type);
    }
  });

  it("contains each site's own point inside its tile", () => {
    const byId = new Map(tiles.features.map((f) => [f.properties?.site_id, f.geometry]));
    const outside = dataset.sites.filter(
      (s) => !isInsideGeometry(s.longitude, s.latitude, byId.get(s.site_id)),
    );
    expect(outside.map((s) => s.site_id)).toEqual([]);
  });

  it("evaluates a click anywhere well inside a tile to that tile's site", () => {
    // Full squares only (a clipped edge tile is not symmetric about its site).
    const squares = tiles.features.filter(
      (f) => f.geometry.type === "Polygon" && (f.geometry as Polygon).coordinates[0].length === 5,
    );
    expect(squares.length).toBeGreaterThan(1300);
    for (const f of squares) {
      const ring = (f.geometry as Polygon).coordinates[0].slice(0, 4);
      const cx = ring.reduce((a, p) => a + p[0], 0) / 4;
      const cy = ring.reduce((a, p) => a + p[1], 0) / 4;
      // 60% of the way from the centre to each corner: ~75 m inside each edge.
      for (const [x, y] of ring) {
        const lon = cx + 0.6 * (x - cx);
        const lat = cy + 0.6 * (y - cy);
        expect(isInsideGeometry(lon, lat, f.geometry)).toBe(true);
        expect(findNearestSite(dataset.sites, lat, lon)?.site.site_id).toBe(
          f.properties?.site_id,
        );
      }
    }
  });
});

describe("tilesToFeatureCollection (the join)", () => {
  it("colours every tile from its own site record", () => {
    const joined = tilesToFeatureCollection(tiles, dataset.sites, bufferM);
    expect(joined.features.length).toBe(dataset.sites.length);
    const byId = new Map(dataset.sites.map((s) => [s.site_id, s]));
    for (const f of joined.features) {
      const site = byId.get(f.properties.site_id)!;
      expect(f.properties.cls).toBe(CLASS_INDEX[site.suitability_class]);
      const excluded =
        site.factors.shoreline_distance_m !== null &&
        site.factors.shoreline_distance_m < bufferM;
      expect(f.properties.excluded).toBe(excluded ? 1 : 0);
    }
  });

  it("keeps only the tiles of the sites it is given (the search results)", () => {
    const some = dataset.sites.slice(100, 112);
    const joined = tilesToFeatureCollection(tiles, some, bufferM);
    expect(joined.features.map((f) => f.properties.site_id).sort()).toEqual(
      some.map((s) => s.site_id).sort(),
    );
  });

  it("marks exactly the 16 shoreline-excluded sites for slate grey", () => {
    const joined = tilesToFeatureCollection(tiles, dataset.sites, bufferM);
    expect(joined.features.filter((f) => f.properties.excluded === 1).length).toBe(16);
  });
});

describe("layer stacking", () => {
  const index = (id: string) => (LAYER_ORDER as readonly string[]).indexOf(id);

  it("keeps the district tiles under everything else POLARIS draws", () => {
    expect(index("site-tiles")).toBe(0);
    expect(index("site-tiles-outline")).toBe(1);
  });

  it("keeps the search ring, the shoreline band and facilities above the result tiles", () => {
    for (const above of ["search-radius-line", "shoreline-buffer-band", "facility-points"]) {
      expect(index(above)).toBeGreaterThan(index("result-tiles-outline"));
    }
    // The radius fill and the district outline's faint fill sit below the
    // result tiles, so neither tints them.
    expect(index("search-radius-fill")).toBeLessThan(index("result-tiles"));
    expect(index("talomo-boundary-fill")).toBeLessThan(index("result-tiles"));
  });

  it("inserts a late layer beneath the first layer that belongs above it", () => {
    const onMap = new Set(["talomo-boundary-line", "facility-points", "shoreline-buffer-band"]);
    const has = (id: string) => onMap.has(id);
    expect(beforeIdFor("site-tiles", has)).toBe("talomo-boundary-line");
    expect(beforeIdFor("result-tiles", has)).toBe("shoreline-buffer-band");
    expect(beforeIdFor("result-dots", has)).toBeUndefined();
    expect(beforeIdFor("not-a-polaris-layer", has)).toBeUndefined();
  });
});

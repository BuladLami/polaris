import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

import { isShorelineExcluded } from "@/lib/suitability";
import type { Site, SuitabilityClass } from "@/types/polaris";

/**
 * GeoJSON for the site layers. Kept apart from `layers.tsx`, which pulls in
 * MapLibre, so the join can be tested on its own.
 */

/** Class order the paint expressions match on: 0 = worst, 3 = best. */
export const CLASS_INDEX: Record<SuitabilityClass, number> = {
  "Not Suitable": 0,
  "Low Suitability": 1,
  Suitable: 2,
  "Highly Suitable": 3,
};

/**
 * Exactly what the site layers need and nothing more: `cls` and `excluded` are
 * read by the paint expression, `site_id` by the hit test. Everything else a
 * card wants is looked up from the `Site` record by id, so ~1,500 features do
 * not each carry a copy of it.
 */
export interface SitePointProperties {
  site_id: string;
  cls: number;
  excluded: number;
}

export type TileGeometry = Polygon | MultiPolygon;

function siteProperties(site: Site, bufferM: number): SitePointProperties {
  return {
    site_id: site.site_id,
    cls: CLASS_INDEX[site.suitability_class],
    excluded: isShorelineExcluded(site, bufferM) ? 1 : 0,
  };
}

export function sitesToFeatureCollection(
  sites: readonly Site[],
  bufferM: number,
): FeatureCollection<Point, SitePointProperties> {
  return {
    type: "FeatureCollection",
    features: sites.map((site) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [site.longitude, site.latitude] },
      properties: siteProperties(site, bufferM),
    })),
  };
}

/**
 * Joins the tile file (geometry + `site_id` only) to the scored sites, so each
 * tile is coloured from its own site record and the file never has to carry a
 * copy of any score. Only tiles whose site is in `sites` are kept, which is how
 * the search results get their own, smaller set.
 */
export function tilesToFeatureCollection(
  tiles: FeatureCollection,
  sites: readonly Site[],
  bufferM: number,
): FeatureCollection<TileGeometry, SitePointProperties> {
  const byId = new Map(sites.map((site) => [site.site_id, site]));
  const features: Feature<TileGeometry, SitePointProperties>[] = [];

  for (const tile of tiles.features) {
    const id = tile.properties?.site_id;
    const site = typeof id === "string" ? byId.get(id) : undefined;
    const geometry = tile.geometry;
    if (!site || (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon")) {
      continue;
    }
    features.push({
      type: "Feature",
      geometry,
      properties: siteProperties(site, bufferM),
    });
  }
  return { type: "FeatureCollection", features };
}

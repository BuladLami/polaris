import { useEffect, useRef } from "react";
import type MapLibreGL from "maplibre-gl";
import type { GeoJSON } from "geojson";

import { useMap } from "@/components/ui/map";

/** `Omit` that distributes across a union, preserving per-layer paint typing. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/**
 * A layer definition without `source` — this hook supplies the source id, so
 * callers must not (and cannot) set it.
 */
export type LayerSpec = DistributiveOmit<MapLibreGL.LayerSpecification, "source">;

/**
 * Declaratively attaches one GeoJSON source plus its layers to the map that
 * mapcn's <Map> provides through context, and keeps the data in sync.
 *
 * mapcn ships <MapGeoJSON> for polygon fill/outline work, but the suitability
 * dots and the shoreline band need circle and width-scaled line layers, which
 * that component does not express. This hook is the supported extension path:
 * it composes on `useMap()` rather than reaching around it.
 */
export function useMapSource(
  sourceId: string,
  data: GeoJSON | null,
  layers: LayerSpec[],
) {
  const { map, isLoaded } = useMap();
  const layersRef = useRef<LayerSpec[]>(layers);
  layersRef.current = layers;

  // Create source + layers once the style is ready; tear them down on unmount
  // or when the map/style is swapped (e.g. a light/dark theme change).
  useEffect(() => {
    if (!map || !isLoaded || !data) return;

    let cancelled = false;

    // NOTE: do not gate this on `map.isStyleLoaded()`. That returns false
    // while the basemap's own tiles are still streaming, and no further
    // `styledata` event follows a tile load — so gating on it silently drops
    // the layer on first paint and it only appears if the caller toggles the
    // data off and on again. Adding a source only needs the style *spec*
    // parsed, which mapcn's `isLoaded` (the map's `load` event) already
    // guarantees. Anything genuinely premature throws and is retried below.
    const attach = () => {
      if (cancelled) return;

      // Idempotent: `idle` fires after every pan and zoom settle, so once the
      // source and its layers are present this must cost nothing. Without this
      // guard every settle would re-`setData` the whole feature collection.
      const hasSource = Boolean(map.getSource(sourceId));
      const hasLayers = layersRef.current.every((l) => map.getLayer(l.id));
      if (hasSource && hasLayers) return;

      try {
        if (!hasSource) {
          map.addSource(sourceId, { type: "geojson", data });
        } else {
          (map.getSource(sourceId) as MapLibreGL.GeoJSONSource).setData(data);
        }

        for (const layer of layersRef.current) {
          if (!map.getLayer(layer.id)) {
            map.addLayer({
              ...layer,
              source: sourceId,
            } as MapLibreGL.AddLayerObject);
          }
        }
      } catch {
        // Style not ready yet (mid-swap). One of the retries below will land.
      }
    };

    attach();
    // `style.load` covers theme swaps, which wipe every custom source and
    // layer. `idle` is the safety net: it fires once the map has finished
    // everything it was doing, so a first-paint miss cannot persist.
    map.on("style.load", attach);
    map.on("styledata", attach);
    map.on("idle", attach);

    return () => {
      cancelled = true;
      map.off("style.load", attach);
      map.off("styledata", attach);
      map.off("idle", attach);

      try {
        for (const layer of layersRef.current) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
        }
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // The map was torn down before we got here; nothing left to clean up.
      }
    };
    // `data` updates are handled by the effect below so re-attaching is not
    // needed on every data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, sourceId, !!data]);

  // Push data updates without recreating the source.
  useEffect(() => {
    if (!map || !isLoaded || !data) return;
    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource | undefined;
    source?.setData(data);
  }, [map, isLoaded, sourceId, data]);

  // Push paint/layout updates without recreating the layers.
  useEffect(() => {
    if (!map || !isLoaded) return;
    for (const layer of layers) {
      if (!map.getLayer(layer.id)) continue;
      const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
      for (const [prop, value] of Object.entries(paint)) {
        map.setPaintProperty(layer.id, prop, value as never);
      }
      const layout = (layer as { layout?: Record<string, unknown> }).layout ?? {};
      for (const [prop, value] of Object.entries(layout)) {
        map.setLayoutProperty(layer.id, prop, value as never);
      }
    }
  }, [map, isLoaded, layers]);
}

/** Web Mercator ground resolution at the equator, zoom 0, for 512 px tiles. */
const METRES_PER_PIXEL_AT_ZOOM_0 = 78271.5;

/**
 * Pixel width of a fixed ground distance, as a MapLibre zoom expression.
 *
 * MapLibre tiles are 512 px, so Web Mercator resolution is
 * `78271.5 * cos(lat) / 2^zoom` metres per pixel and pixel width is proportional
 * to `2^zoom`. An exponential-base-2 interpolation reproduces that exactly rather
 * than approximating it.
 *
 * `minPixels` applies the standard cartographic minimum-width convention: a
 * 100 m band is about 5 px at the zoom where the whole district is in view, which
 * is easy to miss. Below the zoom at which true scale reaches `minPixels` the
 * band is held at that floor; at and above it the width is exact.
 *
 * A `zoom` interpolation must be the outermost expression in MapLibre, so the
 * floor cannot be applied by wrapping this in `max`. It is baked in as a flat
 * leading segment instead: interpolating between two equal stops yields that
 * constant, so `[8 → floor, z0 → floor, 22 → exact]` is flat up to `z0` and
 * exactly `a·2^z` beyond it.
 */
export function metresToPixelsExpression(
  metres: number,
  latitude: number,
  minPixels = 0,
): MapLibreGL.ExpressionSpecification {
  // metresPerPixel = 78271.5 * cos(lat) / 2^zoom, so
  // pixels = metres * 2^zoom / (78271.5 * cos(lat)).
  const perZoomUnit =
    metres / (METRES_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitude * Math.PI) / 180));

  const widthAt = (zoom: number) => perZoomUnit * 2 ** zoom;
  const MIN_ZOOM = 8;
  const MAX_ZOOM = 22;

  // Zoom at which the true-scale width first reaches the requested floor.
  const floorZoom =
    minPixels > 0 ? Math.log2(minPixels / perZoomUnit) : Number.NEGATIVE_INFINITY;

  if (floorZoom <= MIN_ZOOM) {
    return [
      "interpolate",
      ["exponential", 2],
      ["zoom"],
      MIN_ZOOM,
      widthAt(MIN_ZOOM),
      MAX_ZOOM,
      widthAt(MAX_ZOOM),
    ] as MapLibreGL.ExpressionSpecification;
  }

  return [
    "interpolate",
    ["exponential", 2],
    ["zoom"],
    MIN_ZOOM,
    minPixels,
    floorZoom,
    minPixels,
    MAX_ZOOM,
    widthAt(MAX_ZOOM),
  ] as MapLibreGL.ExpressionSpecification;
}

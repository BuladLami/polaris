/**
 * The stacking order of every POLARIS layer, bottom to top.
 *
 * A layer is added when its data first arrives — the district-wide sites only
 * when their toggle is switched on, the results only after a search — and
 * MapLibre puts a newly added layer on top of everything. Left at that, the
 * stacking would depend on what the user happened to switch on first: tiles
 * switched on late would cover the facility rings and the shoreline band. So
 * each layer is inserted below the first layer that belongs above it and is
 * already on the map, which gives this order however the layers arrive.
 *
 * The site tiles sit at the bottom because they cover the whole district; the
 * 50 m shoreline band (a hard gate) and the facility rings stay above them.
 */
export const LAYER_ORDER = [
  "site-tiles",
  "site-tiles-outline",
  "talomo-boundary-line",
  "talomo-boundary-fill",
  "search-radius-fill",
  "result-tiles",
  "result-tiles-outline",
  "search-radius-line",
  "shoreline-buffer-band",
  "shoreline-coastline",
  "site-dots",
  "facility-points",
  "result-dots",
] as const;

/** The layer to insert `id` beneath, or undefined to add it on top. */
export function beforeIdFor(
  id: string,
  hasLayer: (id: string) => boolean,
): string | undefined {
  const at = (LAYER_ORDER as readonly string[]).indexOf(id);
  if (at === -1) return undefined;
  return LAYER_ORDER.slice(at + 1).find((above) => hasLayer(above));
}

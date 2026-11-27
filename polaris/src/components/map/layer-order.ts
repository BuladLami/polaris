/**
 * The stacking order of every POLARIS layer, bottom to top.
 *
 * A layer is added when its data first arrives — the district-wide sites only
 * when their toggle is switched on, the results only after a search — and
 * MapLibre puts a newly added layer on top of everything. Left at that, the
 * stacking would depend on what the user happened to switch on first: a
 * highlighted tile could cover the dots or the facility rings. So
 * each layer is inserted below the first layer that belongs above it and is
 * already on the map, which gives this order however the layers arrive.
 *
 * A highlighted tile sits under the shoreline band (a hard gate), the dots and
 * the facility rings, so the dot it belongs to stays visible in its middle.
 */
export const LAYER_ORDER = [
  "talomo-boundary-line",
  "talomo-boundary-fill",
  "search-radius-fill",
  "search-radius-line",
  "highlight-tile",
  "highlight-tile-outline",
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

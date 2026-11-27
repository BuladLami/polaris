import { useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";

import { loadHazardLayer } from "@/lib/dataset";
import {
  HAZARD_LAYERS,
  type HazardLayerKey,
  type HazardToggles,
} from "@/lib/hazards";

/** Per overlay: undefined = not fetched yet, null = file missing. */
export type HazardData = Partial<Record<HazardLayerKey, FeatureCollection | null>>;

/**
 * Fetches each hazard overlay the first time it is switched on, then keeps it
 * for the session, so switching it off and on again costs nothing.
 */
export function useHazardLayers(toggles: HazardToggles): HazardData {
  const [data, setData] = useState<HazardData>({});
  const requested = useRef(new Set<HazardLayerKey>());

  useEffect(() => {
    for (const layer of HAZARD_LAYERS) {
      if (!toggles[layer.key] || requested.current.has(layer.key)) continue;
      requested.current.add(layer.key);
      void loadHazardLayer(layer.file).then((fc) =>
        setData((prev) => ({ ...prev, [layer.key]: fc })),
      );
    }
  }, [toggles]);

  return data;
}

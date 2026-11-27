import type { HazardKey } from "@/types/polaris";

/**
 * Project NOAH hazard overlays (post-defense revision). Display only: the
 * hazard class each site was scored with is already in candidate_sites.json;
 * these maps show where those classes come from.
 *
 * Built by `npm run data:hazards` (scripts/build_hazard_layers.py).
 */

export type HazardLayerKey = "flood" | "landslide" | "storm_surge";

export interface HazardLayerInfo {
  key: HazardLayerKey;
  /** Toggle label in the map key. */
  label: string;
  /** File under public/data/. */
  file: string;
  /** The matching hazard field on each site. */
  siteKey: HazardKey;
}

export const HAZARD_LAYERS: readonly HazardLayerInfo[] = [
  { key: "flood", label: "Flood", file: "talomo_hazard_flood.json", siteKey: "flood_susceptibility" },
  { key: "landslide", label: "Landslide", file: "talomo_hazard_landslide.json", siteKey: "landslide_susceptibility" },
  { key: "storm_surge", label: "Storm surge", file: "talomo_hazard_storm_surge.json", siteKey: "storm_surge_susceptibility" },
];

export type HazardToggles = Record<HazardLayerKey, boolean>;

/** Every overlay starts off. */
export const HAZARD_TOGGLES_OFF: HazardToggles = {
  flood: false,
  landslide: false,
  storm_surge: false,
};

/** Flips one overlay and leaves the others as they were. */
export function toggleHazard(state: HazardToggles, key: HazardLayerKey): HazardToggles {
  return { ...state, [key]: !state[key] };
}

/** The three classes drawn (0 / no hazard is not drawn). */
export const HAZARD_CLASS_LABEL: Record<1 | 2 | 3, string> = {
  1: "Low",
  2: "Moderate",
  3: "High",
};

/**
 * Yellow / orange / red, the scheme Project NOAH's own maps use, so a planner
 * can hold the two side by side. Drawn semi-transparent under the site dots.
 */
export const HAZARD_HEX: Record<1 | 2 | 3, { light: string; dark: string }> = {
  1: { light: "#facc15", dark: "#fde047" },
  2: { light: "#f97316", dark: "#fb923c" },
  3: { light: "#dc2626", dark: "#f87171" },
};

export const HAZARD_NOTE =
  "Hazard areas come from Project NOAH maps. Turn one on to see why a site is marked unsafe.";

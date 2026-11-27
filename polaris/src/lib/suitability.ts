import type {
  DatasetMetadata,
  HazardKey,
  HazardLevel,
  RankBand,
  ServiceFactorKey,
  Site,
  SuitabilityClass,
} from "@/types/polaris";

/* ------------------------------------------------------------------ */
/*  Classification                                                     */
/* ------------------------------------------------------------------ */

export interface Thresholds {
  tau1: number;
  tau2: number;
  tau3: number;
}

/** Default thresholds; the dataset's own `metadata.thresholds` wins at runtime. */
export const DEFAULT_THRESHOLDS: Thresholds = { tau1: 0.25, tau2: 0.4, tau3: 0.6 };

/** Panel revision #2. Used only when the dataset does not declare its own. */
export const DEFAULT_SHORELINE_BUFFER_M = 50;

/**
 * The pipeline's building-count radius (`weights_manifest.json`). Used only
 * when the dataset does not declare `building_density_radius_m` itself.
 */
export const DEFAULT_BUILDING_DENSITY_RADIUS_M = 300;

/**
 * The metadata fallbacks, in one place.
 *
 * Every view that renders a score needs both, and `metadata` is null until the
 * dataset lands — so before these existed the same `?? DEFAULT_THRESHOLDS` and
 * `?? 50` were spelled out in five components, which is five chances for one of
 * them to drift to a different default.
 */
export function thresholdsOf(metadata: DatasetMetadata | null): Thresholds {
  return metadata?.thresholds ?? DEFAULT_THRESHOLDS;
}

export function shorelineBufferOf(metadata: DatasetMetadata | null): number {
  return metadata?.shoreline_buffer_m ?? DEFAULT_SHORELINE_BUFFER_M;
}

export function buildingRadiusOf(metadata: DatasetMetadata | null): number {
  return metadata?.building_density_radius_m ?? DEFAULT_BUILDING_DENSITY_RADIUS_M;
}

export const SUITABILITY_CLASSES: SuitabilityClass[] = [
  "Highly Suitable",
  "Suitable",
  "Low Suitability",
  "Not Suitable",
];

/**
 * The label the second class carried before the post-defense revision. Kept
 * only so an older export can be mapped on load; never displayed.
 */
export const RETIRED_CLASS_LABELS: Record<string, SuitabilityClass> = {
  "Moderately Suitable": "Suitable",
};

/** CSS custom property per class — shared by badges, the legend and the map. */
export const CLASS_COLOR_VAR: Record<SuitabilityClass, string> = {
  "Highly Suitable": "--suit-high",
  // The token keeps its old name; only the label changed.
  Suitable: "--suit-moderate",
  "Low Suitability": "--suit-low",
  "Not Suitable": "--suit-none",
};

/**
 * Static hex fallbacks. MapLibre paint expressions are evaluated inside a
 * WebGL shader and cannot read CSS custom properties, so the map layers need
 * literal colours. These track the oklch tokens in `index.css`.
 */
export const CLASS_HEX: Record<
  SuitabilityClass,
  { light: string; dark: string }
> = {
  "Highly Suitable": { light: "#1f9d55", dark: "#34d17f" },
  Suitable: { light: "#2f86d4", dark: "#4fa8e8" },
  "Low Suitability": { light: "#d99413", dark: "#f0b429" },
  "Not Suitable": { light: "#d64545", dark: "#f06a6a" },
};

export const EXCLUDED_HEX = { light: "#94a3b8", dark: "#64748b" };

/**
 * Existing health facilities. Violet is the one hue the score ramp does not
 * use, so a facility can never be misread as a scored site — and the layer is
 * drawn as a ring rather than a filled dot to keep the two visually distinct
 * even for a colour-blind reader.
 */
export const FACILITY_HEX = { light: "#7c3aed", dark: "#a78bfa" };

/**
 * The score range of a class, in words. Each class starts AT its threshold and
 * stops just below the next one, so the wording says "to below" rather than
 * using a dash that reads as if both ends were included.
 */
export function classRange(
  cls: SuitabilityClass,
  t = DEFAULT_THRESHOLDS,
): string {
  switch (cls) {
    case "Highly Suitable":
      return `${t.tau3.toFixed(2)} and above`;
    case "Suitable":
      return `${t.tau2.toFixed(2)} to below ${t.tau3.toFixed(2)}`;
    case "Low Suitability":
      return `${t.tau1.toFixed(2)} to below ${t.tau2.toFixed(2)}`;
    case "Not Suitable":
      return `below ${t.tau1.toFixed(2)}`;
  }
}

/**
 * The class a score falls in. Mirrors the pipeline's `f14_classify` exactly:
 * strict `<` against each threshold, so a score of exactly 0.25, 0.40 or 0.60
 * belongs to the class above it (τ ≤ ŷ < next τ).
 *
 * The app does not reclassify sites — every site carries the class the
 * pipeline gave it. This exists so the boundary rule the ranges above describe
 * is pinned down by a test against the same thresholds.
 */
export function classifyScore(
  score: number,
  t = DEFAULT_THRESHOLDS,
): SuitabilityClass {
  if (score < t.tau1) return "Not Suitable";
  if (score < t.tau2) return "Low Suitability";
  if (score < t.tau3) return "Suitable";
  return "Highly Suitable";
}

/** Building density counts buildings, not people (panel, post-defense). */
export const BUILDING_DENSITY_NOTE =
  "Building density counts buildings, not people. A tall condominium counts as one building, the same as a house.";

/** One-line note under the map key's tile swatches (panel, post-defense). */
export const TILE_NOTE =
  "Each tile is the area a site stands for. A facility can be placed anywhere suitable inside it, after checking the actual site.";

/* ------------------------------------------------------------------ */
/*  Eligibility                                                        */
/* ------------------------------------------------------------------ */

/**
 * Whether a site sits inside the shoreline setback. Derived rather than
 * stored, so datasets produced by the training pipeline (which drops these
 * sites before scoring) and the migrated dataset (which keeps them so the
 * buffer can be drawn) both behave correctly.
 */
export function isShorelineExcluded(site: Site, bufferM: number): boolean {
  const d = site.factors.shoreline_distance_m;
  return d !== null && d < bufferM;
}

/** The single human-readable reason a site cannot be recommended, if any. */
export function ineligibilityReason(
  site: Site,
  bufferM: number,
): string | null {
  if (isShorelineExcluded(site, bufferM)) {
    const d = site.factors.shoreline_distance_m ?? 0;
    return `Too close to the shoreline — ${d.toFixed(0)} m, where the minimum is ${bufferM} m`;
  }
  const high = HAZARD_KEYS.filter((k) => site.hazards[k] === 3);
  if (high.length > 0) {
    return `High ${high.map(hazardShortLabel).join(" and ")} risk`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Factor + hazard vocabulary                                         */
/* ------------------------------------------------------------------ */

export const SERVICE_FACTOR_LABEL: Record<ServiceFactorKey, string> = {
  building_density: "Buildings nearby",
  road_accessibility: "Road accessibility",
  facility_distance: "Distance from existing facilities",
};

/**
 * Factor hints. A function of the building-count radius rather than a
 * constant, so the hint can never state a different radius from the one the
 * pipeline actually counted within (and that the interpretation text quotes).
 */
export const serviceFactorHints = (
  buildingRadiusM: number,
): Record<ServiceFactorKey, string> => ({
  building_density: `How many buildings there are within ${buildingRadiusM} m of the site. More buildings usually means more people living nearby, so a facility here would serve more residents.`,
  road_accessibility:
    "How close the site is to a road. A value near 1 means it sits right beside a road and is easy to reach. The number falls quickly with distance, so the sentence under it says how the site compares with the rest of the district.",
  facility_distance:
    "How far the site is from the nearest health facility that already exists. The farther away, the less served that area is today — so a new facility there would help more people.",
});

export const HAZARD_LABEL: Record<HazardKey, string> = {
  flood_susceptibility: "Flood risk",
  landslide_susceptibility: "Landslide risk",
  storm_surge_susceptibility: "Storm surge risk",
};

/**
 * The hazard keys in display order. Derived from `HAZARD_LABEL` rather than
 * written out again, so the details dialog, the eligibility check and the
 * labels can never fall out of step with each other.
 */
export const HAZARD_KEYS = Object.keys(HAZARD_LABEL) as HazardKey[];

function hazardShortLabel(key: HazardKey): string {
  return key.replace("_susceptibility", "").replace(/_/g, " ");
}

export const HAZARD_LEVEL_LABEL: Record<HazardLevel, string> = {
  0: "None",
  1: "Low",
  2: "Moderate",
  3: "High",
};

export const HAZARD_LEVEL_TONE: Record<HazardLevel, string> = {
  0: "text-suit-high",
  1: "text-suit-moderate",
  2: "text-suit-low",
  3: "text-suit-none",
};

/* ------------------------------------------------------------------ */
/*  Panel revision #7 — reading a near-zero road-accessibility value   */
/* ------------------------------------------------------------------ */

/** Matches the four road sentences the pipeline writes from the same bands. */
const ROAD_BAND_READING: Record<RankBand, string> = {
  top_quartile:
    "The site is closer to a road than most of the district, so it would be EASY to reach.",
  upper_middle:
    "The site is reasonably close to a road, so it is fairly easy to reach.",
  lower_middle:
    "The site is farther from a road than most of the district, so road access is weak.",
  bottom_quartile:
    "This is one of the FARTHEST sites from any road in the district, so it would be HARD to reach.",
};

/**
 * Turns a road-accessibility value into a sentence a non-technical reader can
 * act on. The panel specifically asked that a value such as 0.007 never be left
 * to interpretation.
 *
 * `band` is the site's rank in the district, which is what the interpretation
 * text is written from. Without one (the migrated dataset carries none) the
 * sentence falls back to the size of the number alone.
 */
export function describeRoadAccessibility(
  normalized: number,
  roadDistanceM?: number,
  band?: RankBand,
): string {
  const distance =
    roadDistanceM === undefined
      ? ""
      : ` The nearest road is about ${formatMetres(roadDistanceM)} away.`;

  if (band) {
    return `Rated ${normalized.toFixed(3)}. ${ROAD_BAND_READING[band]}${distance}`;
  }

  if (normalized <= 0.05) {
    return (
      `${normalized.toFixed(3)} is almost 0, so this is one of the FARTHEST sites ` +
      `from any road — it would be HARD to reach.${distance}`
    );
  }
  if (normalized < 0.33) {
    return (
      `${normalized.toFixed(3)} is a low number, so the site is quite far from the ` +
      `nearest road and would be difficult to reach.${distance}`
    );
  }
  if (normalized < 0.66) {
    return (
      `${normalized.toFixed(3)} is in the middle, so the site is reasonably easy to ` +
      `reach by road.${distance}`
    );
  }
  return (
    `${normalized.toFixed(3)} is close to 1, so the site sits right on or beside a ` +
    `road — it would be EASY to reach.${distance}`
  );
}

/* ------------------------------------------------------------------ */
/*  Formatting                                                         */
/* ------------------------------------------------------------------ */

export function formatMetres(m: number): string {
  if (!Number.isFinite(m)) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/**
 * A score for display: 3 decimals, unless rounding to 3 would put the shown
 * number in a different class from the score itself (0.2497 shown as "0.250"
 * while the site is Not Suitable). Then it shows 4 decimals ("0.2497"), or
 * more in the rare case 4 would still cross. The stored score is never changed.
 */
export function formatScore(score: number, t = DEFAULT_THRESHOLDS): string {
  if (!Number.isFinite(score)) return "—";
  const cls = classifyScore(score, t);
  for (let digits = 3; digits <= 6; digits++) {
    const text = score.toFixed(digits);
    if (classifyScore(Number(text), t) === cls) return text;
  }
  return String(score);
}

/** True when `formatScore` needs more than 3 decimals to keep the class honest. */
export function needsExtraDecimals(score: number, t = DEFAULT_THRESHOLDS): boolean {
  return formatScore(score, t).length > score.toFixed(3).length;
}

/* ------------------------------------------------------------------ */
/*  Score guide (panel revision #5)                                    */
/* ------------------------------------------------------------------ */

/**
 * The short, scannable version shown on the welcome screen and in the guide
 * dialog. It is a function of the shortlist bounds rather than a constant: the
 * user picks how many sites to see, so the copy must never claim a fixed
 * "best three".
 */
export function scoreGuidePoints(
  minTopN: number,
  maxTopN: number,
): { title: string; body: string }[] {
  return [
    {
      title: "Every site gets one score, from 0 to 1",
      body:
        "You do not need to weigh anything yourself. The score already takes into account " +
        "how built-up the area is, how easy the site is to reach by road, how far the " +
        "nearest health facility is, and how exposed the site is to flood, landslide and " +
        "storm surge.",
    },
    {
      title: "The closer to 1, the better the site",
      body:
        "0.82 is a strong site. 0.11 is a weak one. The smaller values shown underneath " +
        "work the same way — including road accessibility, where 0.007 means the site is " +
        "FAR from any road and would be HARD to reach.",
    },
    {
      title: "Hazard risk is already counted in the score",
      body:
        "There is no separate hazard-free version of the score to compare against. Flood, " +
        "landslide and storm surge risk are already subtracted, and any site rated High on " +
        "a hazard is never recommended — no matter how good the rest of its score looks.",
    },
    {
      title: "You choose how many sites you see",
      body:
        `The map scores the whole district, but the recommendation list only shows the ` +
        `number you ask for — anywhere from ${minTopN} to ${maxTopN} sites, set in the ` +
        `search panel. Keeping it short makes the list easier to review; raise it when you ` +
        `want more options to compare.`,
    },
  ];
}

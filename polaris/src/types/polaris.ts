/**
 * Schema of `public/data/candidate_sites.json`.
 *
 * This mirrors the export written by Section 13 of the revised POLARIS
 * training pipeline. There is exactly ONE model configuration and exactly ONE
 * composite score per site — the pre-defense "with hazard / without hazard"
 * model pair was removed under panel revision #8, because a hazardous site
 * should not be recommended at all.
 */

export type SuitabilityClass =
  | "Highly Suitable"
  | "Moderately Suitable"
  | "Low Suitability"
  | "Not Suitable";

export type HazardKey =
  | "flood_susceptibility"
  | "landslide_susceptibility"
  | "storm_surge_susceptibility";

export type ServiceFactorKey =
  | "building_density"
  | "road_accessibility"
  | "facility_distance";

/** Hazard severity class as published by Project NOAH / the flood SHP. */
export type HazardLevel = 0 | 1 | 2 | 3;

export interface SiteFactors {
  /**
   * OSM building footprint count within `metadata.building_density_radius_m`
   * of the site — the population proxy.
   */
  building_density: number;
  /** Metres to the nearest OSM road-network node. */
  road_distance_m: number;
  /** Metres to the nearest existing healthcare facility. */
  facility_distance_m: number;
  /** Metres to the OSM coastline. `null` when coastline data was unavailable. */
  shoreline_distance_m: number | null;
}

export type SiteFactorsNormalized = Record<ServiceFactorKey, number> &
  Record<HazardKey, number>;

/**
 * Where a site stands in the district on one service factor, by quartile of the
 * exported value. `top_quartile` is always the end that helps the score: most
 * buildings, closest to a road, farthest from an existing facility.
 */
export type RankBand =
  | "top_quartile"
  | "upper_middle"
  | "lower_middle"
  | "bottom_quartile";

export interface FactorRank {
  band: RankBand;
  /** Share of sites this one strictly beats on the factor, 0–100. */
  percentile: number;
}

/**
 * The pipeline writes the interpretation from these bands, so a reading built
 * from them cannot disagree with the text above it.
 */
export interface SiteRankBands {
  building_density: FactorRank;
  road_accessibility: FactorRank;
  facility_distance: FactorRank & {
    /** The same test that puts "underserved" in the interpretation. */
    underserved: boolean;
  };
}

export interface Site {
  site_id: string;
  latitude: number;
  longitude: number;
  /** Barangay name from OSM admin_level=10 polygons; `null` if unmatched. */
  barangay?: string | null;
  /**
   * True when the site's barangay has a below-district-median building
   * footprint density, so `factors.building_density` likely understates real
   * demand rather than reporting a genuinely empty area. The pipeline already
   * says this in `interpretation`; the flag is the machine-readable form.
   */
  barangay_undermapped?: boolean;
  /** The single composite suitability score, 0–1. Closer to 1 = more suitable. */
  score: number;
  suitability_class: SuitabilityClass;
  /** 0–4 hybrid level; 0 whenever the site is ineligible. */
  recommendation_level: number;
  /** The level in words. Absent only on the migrated bridge dataset. */
  recommendation_label?: string;
  /** False when a High hazard applies or the site sits inside the shoreline buffer. */
  recommendation_eligible: boolean;
  /** Plain-language narrative naming the concrete score drivers. */
  interpretation: string;
  factors: SiteFactors;
  factors_normalized: SiteFactorsNormalized;
  hazards: Record<HazardKey, HazardLevel>;
  /** Absent only on the migrated bridge dataset. */
  rank_bands?: SiteRankBands;
}

export interface TopRecommendation {
  recommendation_rank: number;
  site_id: string;
  score: number;
  suitability_class: SuitabilityClass;
  latitude: number;
  longitude: number;
  barangay?: string | null;
  interpretation: string;
}

export interface DatasetClarification {
  /** Total raw OSM elements pulled for feature engineering (~300,000). */
  raw_osm_records_extracted: number | null;
  /** Candidate grid points actually scored by the model (~3,000+). */
  training_candidate_sites: number;
  shoreline_excluded_sites: number;
  note: string;
}

export interface DatasetMetadata {
  project: string;
  study_area: string;
  model: string;
  /** Present only on the migrated bridge dataset. */
  model_status?: "provisional";
  model_note?: string;
  score_guide: string;
  thresholds: { tau1: number; tau2: number; tau3: number };
  weights: {
    service: Record<ServiceFactorKey, number>;
    hazard_penalty: Record<HazardKey, number>;
  };
  shoreline_buffer_m: number;
  /** Radius the pipeline counted buildings within for `building_density`. */
  building_density_radius_m?: number;
  top_n_recommendations: number;
  dataset_clarification: DatasetClarification;
  advisory_note: string;
  generated_by?: string;
  generated_at?: string;
}

export interface PolarisDataset {
  metadata: DatasetMetadata;
  top_recommendations: TopRecommendation[];
  sites: Site[];
}

/* ------------------------------------------------------------------ */
/*  Derived view models                                                */
/* ------------------------------------------------------------------ */

/** A site plus the search-local context computed at query time. */
export interface RankedSite extends Site {
  /** 1-based rank within the current search, before the top-N cut. */
  localRank: number;
  /** Metres from the search centre. */
  distanceFromCentreM: number;
}

/** Why sites inside the radius did or did not reach the shortlist. */
export interface RecommendationSummary {
  /** Sites inside the search radius, before any gate. */
  inRadius: number;
  /** Removed for sitting inside the shoreline setback. */
  shorelineExcluded: number;
  /** Removed for carrying a High hazard rating. */
  hazardExcluded: number;
}

export interface EvaluationResult {
  latitude: number;
  longitude: number;
  site: Site;
  /** Metres from the clicked point to the nearest scored candidate site. */
  distanceM: number;
  /** True when the nearest scored site is far enough to weaken the read. */
  outsideCoverage: boolean;
}

export type AppMode = "recommendation" | "evaluation";

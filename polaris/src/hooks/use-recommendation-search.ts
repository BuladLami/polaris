import { useCallback, useEffect, useMemo, useState } from "react";

import type { LngLatBounds } from "@/lib/geo";
import {
  DEFAULT_RADIUS_M,
  DEFAULT_TOP_N,
  MAX_TOP_N,
  MIN_TOP_N,
  parseCoordinates,
  parseShortlistSize,
  rankSitesInRadius,
  SHORTLIST_SIZE_ERROR,
  validateRadius,
  validateSearchPoint,
} from "@/lib/search";
import type {
  RankedSite,
  RecommendationSummary,
  Site,
} from "@/types/polaris";

export interface RecommendationSearchOptions {
  sites: readonly Site[];
  bounds: LngLatBounds | null;
  bufferM: number;
  /** `top_n_recommendations` from the dataset, used to seed the field. */
  datasetTopN: number | undefined;
  /** Brings a finished search into view. */
  showResults: (lat: number, lon: number, radiusM: number) => void;
}

/**
 * Recommendation mode: the search inputs, the shortlist they produce, and the
 * rules that keep the two consistent.
 *
 * The central invariant is that **a shortlist only ever describes the exact
 * query that produced it**. Every setter here discards the previous results,
 * which is also what flips the primary button between "Find" and "Clear".
 */
export function useRecommendationSearch({
  sites,
  bounds,
  bufferM,
  datasetTopN,
  showResults,
}: RecommendationSearchOptions) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusInput, setRadiusInput] = useState(DEFAULT_RADIUS_M);
  const [topNInput, setTopNInput] = useState(String(DEFAULT_TOP_N));
  const [results, setResults] = useState<RankedSite[]>([]);
  const [summary, setSummary] = useState<RecommendationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed the shortlist size from whatever the dataset declares, so a pipeline
  // export with a different `top_n_recommendations` is respected on load.
  useEffect(() => {
    if (
      typeof datasetTopN === "number" &&
      datasetTopN >= MIN_TOP_N &&
      datasetTopN <= MAX_TOP_N
    ) {
      setTopNInput(String(datasetTopN));
    }
  }, [datasetTopN]);

  const shortlist = useMemo(
    () => parseShortlistSize(topNInput),
    [topNInput],
  );
  const centre = useMemo(
    () => parseCoordinates(latitude, longitude),
    [latitude, longitude],
  );

  /** Discards a stale shortlist. Called by every input change. */
  const invalidate = useCallback(() => {
    setResults([]);
    setSummary(null);
    setError(null);
  }, []);

  const setLatitudeField = useCallback(
    (value: string) => {
      setLatitude(value);
      invalidate();
    },
    [invalidate],
  );

  const setLongitudeField = useCallback(
    (value: string) => {
      setLongitude(value);
      invalidate();
    },
    [invalidate],
  );

  const setRadiusField = useCallback(
    (value: string) => {
      setRadiusInput(value);
      invalidate();
    },
    [invalidate],
  );

  const setTopNField = useCallback(
    (value: string) => {
      setTopNInput(value);
      invalidate();
    },
    [invalidate],
  );

  /** Drops a new search centre from a map click. */
  const setCentre = useCallback(
    (lat: number, lon: number) => {
      setLatitude(lat.toFixed(6));
      setLongitude(lon.toFixed(6));
      invalidate();
    },
    [invalidate],
  );

  const clear = useCallback(() => {
    setLatitude("");
    setLongitude("");
    invalidate();
  }, [invalidate]);

  /** Validates, ranks, and settles the map. The only place ranking runs. */
  const run = useCallback(() => {
    const point = parseCoordinates(latitude, longitude);
    const lat = point?.lat ?? Number.NaN;
    const lon = point?.lon ?? Number.NaN;
    const radiusM = Number.parseFloat(radiusInput);

    const failure =
      validateSearchPoint(sites, bounds, lat, lon) ??
      validateRadius(radiusM) ??
      (shortlist.valid ? null : SHORTLIST_SIZE_ERROR);

    if (failure) {
      setError(failure);
      return;
    }

    const { ranked, summary: nextSummary } = rankSitesInRadius(
      sites,
      lat,
      lon,
      radiusM,
      shortlist.value,
      bufferM,
    );

    setError(null);
    setResults(ranked);
    setSummary(nextSummary);

    if (ranked.length > 0) showResults(lat, lon, radiusM);
  }, [
    latitude,
    longitude,
    radiusInput,
    shortlist,
    sites,
    bounds,
    bufferM,
    showResults,
  ]);

  /**
   * True when switching away would discard something the user placed or ran.
   * Radius and shortlist size are excluded: they are settings, not work, and
   * they survive a mode switch untouched.
   */
  const hasWork =
    latitude.trim() !== "" || longitude.trim() !== "" || results.length > 0;

  return {
    latitude,
    longitude,
    radiusInput,
    topNInput,
    topN: shortlist.value,
    centre,
    results,
    summary,
    error,
    hasWork,
    setLatitude: setLatitudeField,
    setLongitude: setLongitudeField,
    setRadius: setRadiusField,
    setTopN: setTopNField,
    setCentre,
    clear,
    run,
  };
}

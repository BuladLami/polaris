import { useCallback, useMemo, useState } from "react";

import { findNearestSite, type LngLatBounds } from "@/lib/geo";
import { parseCoordinates, validateSearchPoint } from "@/lib/search";
import type { EvaluationResult, Site } from "@/types/polaris";

/**
 * Beyond this distance the nearest scored site is a weak proxy for the exact
 * point the user clicked, so the panel says so rather than implying precision
 * the data does not have.
 */
const COVERAGE_WARNING_M = 250;

export interface SiteEvaluationOptions {
  sites: readonly Site[];
  bounds: LngLatBounds | null;
}

/**
 * Evaluation mode: reads the composite score for one arbitrary point by
 * looking up the nearest scored candidate site.
 *
 * Kept entirely separate from recommendation state so switching modes never
 * destroys either one — which is why the app needs no "are you sure?" prompt.
 */
export function useSiteEvaluation({ sites, bounds }: SiteEvaluationOptions) {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const point = useMemo(
    () => parseCoordinates(latitude, longitude),
    [latitude, longitude],
  );

  const evaluateAt = useCallback(
    (lat: number, lon: number) => {
      const failure = validateSearchPoint(sites, bounds, lat, lon);
      if (failure) {
        setError(failure);
        setResult(null);
        return;
      }

      const nearest = findNearestSite(sites, lat, lon);
      if (!nearest) {
        setError("No scored sites are loaded yet.");
        setResult(null);
        return;
      }

      setError(null);
      setResult({
        latitude: lat,
        longitude: lon,
        site: nearest.site,
        distanceM: nearest.distanceM,
        outsideCoverage: nearest.distanceM > COVERAGE_WARNING_M,
      });
    },
    [sites, bounds],
  );

  /** Map click: record the point and evaluate it immediately. */
  const evaluatePoint = useCallback(
    (lat: number, lon: number) => {
      setLatitude(lat.toFixed(6));
      setLongitude(lon.toFixed(6));
      evaluateAt(lat, lon);
    },
    [evaluateAt],
  );

  /** Re-runs against whatever is currently typed in the coordinate fields. */
  const run = useCallback(() => {
    const typed = parseCoordinates(latitude, longitude);
    evaluateAt(typed?.lat ?? Number.NaN, typed?.lon ?? Number.NaN);
  }, [evaluateAt, latitude, longitude]);

  const clear = useCallback(() => {
    setLatitude("");
    setLongitude("");
    setResult(null);
    setError(null);
  }, []);

  /** True when switching away would discard an evaluated point. */
  const hasWork =
    latitude.trim() !== "" || longitude.trim() !== "" || result !== null;

  return {
    latitude,
    longitude,
    point,
    result,
    error,
    hasWork,
    setLatitude,
    setLongitude,
    evaluatePoint,
    run,
    clear,
  };
}

import { useMemo } from "react";
import type { FeatureCollection } from "geojson";
import { Crosshair, MapPin } from "lucide-react";

import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
  type MapRef,
} from "@/components/ui/map";
import {
  BoundaryLayer,
  DistrictView,
  FacilitiesLayer,
  FacilityHover,
  MapInteractions,
  ResultDotsLayer,
  SearchRadiusLayer,
  ShorelineBufferLayer,
  SiteDotsLayer,
  SiteHover,
  sitesToFeatureCollection,
} from "@/components/map/layers";
import type { Theme } from "@/hooks/use-theme";
import type { FacilityCollection } from "@/lib/facilities";
import type { LngLatBounds } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { formatScore } from "@/lib/suitability";
import type { AppMode, RankedSite, Site, TopRecommendation } from "@/types/polaris";

/** Where the map starts before it frames the district on load. */
export const TALOMO_CENTRE: [number, number] = [125.5439, 7.0511];
export const DEFAULT_ZOOM = 12.2;

export interface SuitabilityMapProps {
  mapRef: React.Ref<MapRef>;
  theme: Theme;
  mode: AppMode;
  sites: readonly Site[];
  resultSites: readonly RankedSite[];
  topRecommendations: readonly TopRecommendation[];
  districtBounds: LngLatBounds | null;
  boundary: FeatureCollection | null;
  coastline: FeatureCollection | null;
  facilities: FacilityCollection | null;
  shorelineBufferM: number;
  showShorelineBuffer: boolean;
  showAllSites: boolean;
  showFacilities: boolean;
  searchCentre: { lat: number; lon: number } | null;
  searchRadiusM: number;
  evalPoint: { lat: number; lon: number } | null;
  onSelectSite: (siteId: string) => void;
  /** Opens a facility's details; only facilities that have any call it. */
  onSelectFacility: (fid: number) => void;
  /** Site picked in "Find a site", pinned until the search is cleared. */
  foundSite?: Site | null;
  onPickLocation: (lat: number, lon: number) => void;
  className?: string;
}

export function SuitabilityMap({
  mapRef,
  theme,
  mode,
  sites,
  resultSites,
  topRecommendations,
  districtBounds,
  boundary,
  coastline,
  facilities,
  shorelineBufferM,
  showShorelineBuffer,
  showAllSites,
  showFacilities,
  searchCentre,
  searchRadiusM,
  evalPoint,
  onSelectSite,
  onSelectFacility,
  foundSite = null,
  onPickLocation,
  className,
}: SuitabilityMapProps) {
  const allSitesGeoJson = useMemo(
    () => (showAllSites ? sitesToFeatureCollection(sites, shorelineBufferM) : null),
    [sites, shorelineBufferM, showAllSites],
  );

  const resultGeoJson = useMemo(
    () =>
      resultSites.length
        ? sitesToFeatureCollection(resultSites, shorelineBufferM)
        : null,
    [resultSites, shorelineBufferM],
  );

  /**
   * Which dots open the details dialog on click.
   *
   * The emphasised result dots always do. The district-wide layer joins them
   * only while its legend toggle is on — that toggle is therefore also the
   * escape hatch, because a pickable dot cannot double as open map: with the
   * layer showing, a click that lands on a dot opens that site instead of
   * placing the search centre. (Coordinates can still be typed into the search
   * panel, which is the precise path regardless.)
   *
   * Evaluation mode opts out entirely — clicking *is* the mode's verb there,
   * and a click on a dot already evaluates that same site, so the breakdown
   * arrives in the panel without a dialog intercepting the gesture.
   */
  const pickLayers = useMemo(() => {
    if (mode !== "recommendation") return [];
    return showAllSites ? ["result-dots", "site-dots"] : ["result-dots"];
  }, [mode, showAllSites]);

  return (
    <Map
      ref={mapRef}
      theme={theme}
      className={cn("size-full", className)}
      center={TALOMO_CENTRE}
      zoom={DEFAULT_ZOOM}
      minZoom={9}
      maxZoom={18}
      attributionControl={{ compact: true }}
    >
      <DistrictView bounds={districtBounds} />
      <MapInteractions
        pickLayers={pickLayers}
        onSelectSite={onSelectSite}
        onSelectFacility={onSelectFacility}
        onPickLocation={onPickLocation}
      />

      {/* Draw order is mount order: context first, then the data on top. */}
      <BoundaryLayer data={boundary} theme={theme} />
      <SearchRadiusLayer
        centre={mode === "recommendation" ? searchCentre : null}
        radiusM={searchRadiusM}
        theme={theme}
      />
      <ShorelineBufferLayer
        data={coastline}
        bufferM={shorelineBufferM}
        theme={theme}
        visible={showShorelineBuffer}
      />
      <SiteDotsLayer
        data={allSitesGeoJson}
        theme={theme}
        dimmed={resultSites.length > 0}
      />
      {/* Above the district-wide dot cloud so it stays readable over it, but
          below the numbered recommendations, which must never be obscured. */}
      <FacilitiesLayer
        data={facilities}
        theme={theme}
        visible={showFacilities}
      />
      <FacilityHover facilities={facilities} enabled={showFacilities} />
      <ResultDotsLayer data={resultGeoJson} theme={theme} />
      {/* Mounted after the dot layers so both are present to hit-test. */}
      <SiteHover
        sites={sites}
        bufferM={shorelineBufferM}
        theme={theme}
        pickLayers={pickLayers}
        mode={mode}
      />

      {/* Search centre */}
      {mode === "recommendation" && searchCentre && (
        <MapMarker longitude={searchCentre.lon} latitude={searchCentre.lat}>
          <MarkerContent>
            <div className="relative grid place-items-center">
              <span className="bg-primary/40 absolute size-6 rounded-full animate-pulse-ring" />
              <span className="border-background bg-primary grid size-6 place-items-center rounded-full border-2 shadow-lg">
                <Crosshair className="text-primary-foreground size-3.5" />
              </span>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="bg-popover text-popover-foreground rounded-lg border px-2.5 py-1.5 text-xs shadow-lg">
              <p className="font-semibold">Search centre</p>
              <p className="text-muted-foreground tabular">
                {searchCentre.lat.toFixed(5)}, {searchCentre.lon.toFixed(5)}
              </p>
            </div>
          </MarkerTooltip>
        </MapMarker>
      )}

      {/* Evaluation point */}
      {mode === "evaluation" && evalPoint && (
        <MapMarker longitude={evalPoint.lon} latitude={evalPoint.lat}>
          <MarkerContent>
            <div className="relative grid place-items-center">
              <span className="bg-primary/40 absolute size-7 rounded-full animate-pulse-ring" />
              <MapPin className="fill-primary text-primary-foreground size-7 drop-shadow-lg" />
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="bg-popover text-popover-foreground rounded-lg border px-2.5 py-1.5 text-xs shadow-lg">
              <p className="font-semibold">Evaluated location</p>
              <p className="text-muted-foreground tabular">
                {evalPoint.lat.toFixed(5)}, {evalPoint.lon.toFixed(5)}
              </p>
            </div>
          </MarkerTooltip>
        </MapMarker>
      )}

      {/* Site found by id. Skipped when it is already a numbered marker. */}
      {foundSite &&
        !topRecommendations.some((r) => r.site_id === foundSite.site_id) && (
          <MapMarker
            longitude={foundSite.longitude}
            latitude={foundSite.latitude}
            onClick={() => onSelectSite(foundSite.site_id)}
          >
            <MarkerContent>
              <div className="relative grid cursor-pointer place-items-center">
                <span className="bg-primary/35 pointer-events-none absolute size-7 rounded-full animate-pulse-ring" />
                <MapPin className="fill-primary text-primary-foreground size-7 drop-shadow-lg" />
              </div>
            </MarkerContent>
            <MarkerTooltip>
              <div className="bg-popover text-popover-foreground max-w-56 rounded-lg border px-3 py-2 shadow-xl">
                <p className="text-sm font-semibold">{foundSite.site_id}</p>
                {foundSite.barangay && (
                  <p className="text-muted-foreground text-xs">{foundSite.barangay}</p>
                )}
                <p className="mt-1 text-xs">
                  Score{" "}
                  <span className="tabular font-semibold">
                    {formatScore(foundSite.score)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({foundSite.suitability_class})
                  </span>
                </p>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Click for the full breakdown
                </p>
              </div>
            </MarkerTooltip>
          </MapMarker>
        )}

      {/* Top-N recommended sites (panel revision #4). Added lowest rank first, so
          where neighbouring sites overlap the better one stays on top. */}
      {[...topRecommendations].reverse().map((rec) => (
        <MapMarker
          key={rec.site_id}
          longitude={rec.longitude}
          latitude={rec.latitude}
          onClick={() => onSelectSite(rec.site_id)}
        >
          <MarkerContent>
            <div className="group relative grid place-items-center">
              <span className="bg-suit-high/35 pointer-events-none absolute size-6 rounded-full animate-pulse-ring" />
              <span
                data-rank-marker
                className="border-background bg-suit-high grid size-6 cursor-pointer place-items-center rounded-full border-2 text-xs font-bold text-white shadow-xl transition-transform duration-200 group-hover:scale-110"
              >
                {rec.recommendation_rank}
              </span>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="bg-popover text-popover-foreground max-w-56 rounded-lg border px-3 py-2 shadow-xl">
              <p className="text-suit-high text-[10px] font-bold tracking-widest uppercase">
                Recommendation #{rec.recommendation_rank}
              </p>
              <p className="mt-0.5 text-sm font-semibold">{rec.site_id}</p>
              {rec.barangay && (
                <p className="text-muted-foreground text-xs">{rec.barangay}</p>
              )}
              <p className="mt-1 text-xs">
                Score{" "}
                <span className="tabular font-semibold">
                  {formatScore(rec.score)}
                </span>{" "}
                <span className="text-muted-foreground">
                  ({rec.suitability_class})
                </span>
              </p>
            </div>
          </MarkerTooltip>
        </MapMarker>
      ))}

      <MapControls position="top-right" showZoom showCompass showFullscreen />
    </Map>
  );
}

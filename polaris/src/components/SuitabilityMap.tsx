import { useMemo, useState } from "react";
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
  HazardLayer,
  HighlightTileLayer,
  MapInteractions,
  ResultDotsLayer,
  SearchRadiusLayer,
  ShorelineBufferLayer,
  SiteDotsLayer,
  SiteHover,
  sitesToFeatureCollection,
  tilesToFeatureCollection,
} from "@/components/map/layers";
import type { Theme } from "@/hooks/use-theme";
import type { HazardData } from "@/hooks/use-hazard-layers";
import { HAZARD_LAYERS, HAZARD_TOGGLES_OFF, type HazardToggles } from "@/lib/hazards";
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
  /** The 250 m cell of every site, shown for the hovered and selected site. */
  tiles: FeatureCollection | null;
  /** The clicked site (details dialog or evaluation); its tile stays shown. */
  highlightSiteId?: string | null;
  shorelineBufferM: number;
  showShorelineBuffer: boolean;
  showAllSites: boolean;
  showFacilities: boolean;
  /** Which Project NOAH overlays are switched on (all off by default). */
  hazards?: HazardToggles;
  /** Overlay data fetched so far; a layer draws only when on and loaded. */
  hazardData?: HazardData;
  searchCentre: { lat: number; lon: number } | null;
  searchRadiusM: number;
  evalPoint: { lat: number; lon: number } | null;
  onSelectSite: (siteId: string) => void;
  /** Opens a facility's details; only facilities that have any call it. */
  onSelectFacility: (fid: number) => void;
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
  tiles,
  highlightSiteId = null,
  shorelineBufferM,
  showShorelineBuffer,
  showAllSites,
  showFacilities,
  hazards = HAZARD_TOGGLES_OFF,
  hazardData = {},
  searchCentre,
  searchRadiusM,
  evalPoint,
  onSelectSite,
  onSelectFacility,
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

  // Sites are drawn as dots. The 250 m tile a dot stands for is shown only for
  // the site under the pointer and the site that was clicked.
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const highlightTiles = useMemo(() => {
    if (!tiles) return null;
    const ids = new Set([hoveredSiteId, highlightSiteId].filter(Boolean));
    if (ids.size === 0) return null;
    const picked = sites.filter((s) => ids.has(s.site_id));
    return picked.length
      ? tilesToFeatureCollection(tiles, picked, shorelineBufferM)
      : null;
  }, [tiles, sites, hoveredSiteId, highlightSiteId, shorelineBufferM]);

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
        mode={mode}
        onSelectFacility={onSelectFacility}
        onPickLocation={onPickLocation}
      />

      {/* Stacking is fixed by LAYER_ORDER in layer-order.ts, not by mount
          order, so it holds whichever layer appears first. */}
      <BoundaryLayer data={boundary} theme={theme} />
      <SearchRadiusLayer
        centre={mode === "recommendation" ? searchCentre : null}
        radiusM={searchRadiusM}
        theme={theme}
      />
      {HAZARD_LAYERS.map((layer) => (
        <HazardLayer
          key={layer.key}
          layerKey={layer.key}
          data={hazards[layer.key] ? (hazardData[layer.key] ?? null) : null}
          theme={theme}
        />
      ))}
      <HighlightTileLayer data={highlightTiles} theme={theme} />
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
      {/* Above the site layers so existing facilities stay readable over them,
          but below the numbered recommendations, which must never be obscured. */}
      <FacilitiesLayer
        data={facilities}
        theme={theme}
        visible={showFacilities}
      />
      <FacilityHover
        facilities={facilities}
        enabled={showFacilities}
        clickable={mode === "recommendation"}
      />
      <ResultDotsLayer data={resultGeoJson} theme={theme} />
      {/* Mounted after the dot layers so both are present to hit-test. */}
      <SiteHover
        sites={sites}
        bufferM={shorelineBufferM}
        theme={theme}
        mode={mode}
        onHoverSite={setHoveredSiteId}
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

import { useCallback, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DatasetInfoDialog } from "@/components/DatasetInfoDialog";
import { EvaluationPanel } from "@/components/EvaluationPanel";
import { MapLegend } from "@/components/MapLegend";
import { RecommendationsPanel } from "@/components/RecommendationsPanel";
import { ScoreGuideDialog } from "@/components/ScoreGuideDialog";
import { SearchPanel } from "@/components/SearchPanel";
import { SiteDetailsDialog } from "@/components/SiteDetailsDialog";
import { FatalError, Splash } from "@/components/StatusScreens";
import { SuitabilityMap } from "@/components/SuitabilityMap";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { MapRef } from "@/components/ui/map";
import { usePolarisData } from "@/hooks/use-polaris-data";
import { useRecommendationSearch } from "@/hooks/use-recommendation-search";
import { useSiteEvaluation } from "@/hooks/use-site-evaluation";
import { useTheme } from "@/hooks/use-theme";
import { boundsOfFeatures, boundsOfSites } from "@/lib/geo";
import { districtPadding } from "@/lib/map-view";
import {
  MAX_RADIUS_M,
  MAX_TOP_N,
  MIN_RADIUS_M,
  MIN_TOP_N,
} from "@/lib/search";
import { isShorelineExcluded, shorelineBufferOf } from "@/lib/suitability";
import type { AppMode, Site, TopRecommendation } from "@/types/polaris";

/**
 * Composition root.
 *
 * All behaviour lives elsewhere — `lib/search.ts` holds the rules, the hooks in
 * `hooks/` hold the state, and `components/` hold the views. This file only
 * wires them together and lays them out, so a change to how ranking works is
 * never a change to this file.
 */
export default function App() {
  const { theme, toggleTheme } = useTheme();
  const mapRef = useRef<MapRef | null>(null);

  const { bundle, loadError, refreshing, refresh } = usePolarisData();

  /* ---- Shell state --------------------------------------------------- */
  const [showWelcome, setShowWelcome] = useState(true);
  const [mode, setMode] = useState<AppMode>("recommendation");
  const [scoreGuideOpen, setScoreGuideOpen] = useState(false);
  const [datasetInfoOpen, setDatasetInfoOpen] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  /** Mode the user asked for, held until they confirm discarding the current one. */
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  // The scored-sites layer and the shoreline band stay off at first paint, so
  // the map opens on the basemap and the district outline rather than a wall of
  // colour; both are opt-in from the legend.
  const [showShorelineBuffer, setShowShorelineBuffer] = useState(false);
  const [showAllSites, setShowAllSites] = useState(false);
  // Facilities are the exception and start ON, per the panel: a reader judging
  // a recommendation needs to see what already exists without discovering a
  // toggle first, since "far from an existing facility" is a scoring factor.
  // Still freely toggleable — this only changes the default.
  const [showFacilities, setShowFacilities] = useState(true);

  /* ---- Dataset-derived ----------------------------------------------- */
  const metadata = bundle?.dataset.metadata ?? null;
  const sites = useMemo(() => bundle?.dataset.sites ?? [], [bundle]);
  const bufferM = shorelineBufferOf(metadata);
  const bounds = useMemo(() => boundsOfSites(sites), [sites]);
  /** The boundary reaches past the outermost scored sites, so it frames the view. */
  const districtBounds = useMemo(
    () => boundsOfFeatures(bundle?.boundary) ?? bounds,
    [bundle, bounds],
  );

  const siteIndex = useMemo(
    () => new Map(sites.map((s) => [s.site_id, s])),
    [sites],
  );

  const excludedCount = useMemo(
    () => sites.filter((s) => isShorelineExcluded(s, bufferM)).length,
    [sites, bufferM],
  );

  /** Null when the file is missing, which hides the toggle rather than
      offering an empty layer. */
  const facilityCount = bundle?.facilities?.features.length ?? null;

  /* ---- Map navigation ------------------------------------------------ */
  const flyTo = useCallback((lat: number, lon: number, zoom = 15) => {
    mapRef.current?.flyTo({
      center: [lon, lat],
      zoom,
      duration: 900,
      essential: true,
    });
  }, []);

  const showDistrict = useCallback(() => {
    const map = mapRef.current;
    if (!map || !districtBounds) return;
    map.fitBounds(
      [
        [districtBounds.west, districtBounds.south],
        [districtBounds.east, districtBounds.north],
      ],
      {
        padding: districtPadding(map.getContainer().clientWidth),
        duration: 900,
        essential: true,
      },
    );
  }, [districtBounds]);

  /* ---- Mode state (independent, so switching loses nothing) ---------- */
  const search = useRecommendationSearch({
    sites,
    bounds,
    bufferM,
    datasetTopN: metadata?.top_n_recommendations,
    flyTo,
  });
  const evaluation = useSiteEvaluation({ sites, bounds });

  const isRecommendation = mode === "recommendation";

  /* ---- View models --------------------------------------------------- */

  /**
   * Numbered markers on the map — only ever the result of an explicit search.
   * There is deliberately no district-wide default list: a shortlist the user
   * did not ask for reads as a recommendation the tool is making on its own.
   */
  const mapRecommendations = useMemo<TopRecommendation[]>(() => {
    if (!isRecommendation || search.results.length === 0) return [];

    return search.results.slice(0, search.topN).map((site, i) => ({
      recommendation_rank: i + 1,
      site_id: site.site_id,
      score: site.score,
      suitability_class: site.suitability_class,
      latitude: site.latitude,
      longitude: site.longitude,
      barangay: site.barangay,
      interpretation: site.interpretation,
    }));
  }, [isRecommendation, search.results, search.topN]);

  const selectedSite: Site | null = selectedSiteId
    ? (siteIndex.get(selectedSiteId) ?? null)
    : null;

  const selectedRank = useMemo(
    () =>
      mapRecommendations.find((r) => r.site_id === selectedSiteId)
        ?.recommendation_rank,
    [selectedSiteId, mapRecommendations],
  );

  /* ---- Interaction routing ------------------------------------------- */
  const { setCentre } = search;
  const { evaluatePoint } = evaluation;

  const handlePickLocation = useCallback(
    (lat: number, lon: number) => {
      if (isRecommendation) setCentre(lat, lon);
      else evaluatePoint(lat, lon);
    },
    [isRecommendation, setCentre, evaluatePoint],
  );

  const clearActiveMode = isRecommendation ? search.clear : evaluation.clear;

  /**
   * Clears the current query and returns the map to its opening view. In
   * recommendation mode this removes the search centre, the radius ring and
   * the shortlist together — they only ever make sense as a set.
   */
  const handleClear = useCallback(() => {
    clearActiveMode();
    setSelectedSiteId(null);
    showDistrict();
  }, [clearActiveMode, showDistrict]);

  /**
   * The header brand acts as a home link, so it returns a genuinely clean slate
   * rather than the welcome screen with yesterday's search still behind it:
   * both modes are cleared, not just the active one.
   */
  const { clear: clearSearch } = search;
  const { clear: clearEvaluation } = evaluation;

  const handleGoHome = useCallback(() => {
    clearSearch();
    clearEvaluation();
    setSelectedSiteId(null);
    setShowWelcome(true);
    showDistrict();
  }, [clearSearch, clearEvaluation, showDistrict]);

  /* ---- Mode switching ------------------------------------------------ */

  /**
   * Switching modes resets whatever the mode being left had going, so it is
   * gated behind a confirmation — but only when there is actually something to
   * lose. Prompting over an untouched panel trains people to dismiss dialogs
   * without reading them.
   */
  const activeHasWork = isRecommendation ? search.hasWork : evaluation.hasWork;

  const requestModeChange = useCallback(
    (next: AppMode) => {
      if (next === mode) return;
      if (activeHasWork) setPendingMode(next);
      else setMode(next);
    },
    [mode, activeHasWork],
  );

  const confirmModeChange = useCallback(() => {
    if (!pendingMode) return;
    clearActiveMode();
    setSelectedSiteId(null);
    setMode(pendingMode);
    setPendingMode(null);
    showDistrict();
  }, [pendingMode, clearActiveMode, showDistrict]);

  const modeChangeConsequences = isRecommendation
    ? [
        "The search centre and its radius circle are removed from the map.",
        "The current list of recommended sites is cleared.",
      ]
    : [
        "The evaluated point is removed from the map.",
        "Its score and explanation are cleared.",
      ];

  /* ---- Render -------------------------------------------------------- */

  if (loadError && !bundle) {
    return <FatalError message={loadError} onRetry={refresh} />;
  }

  if (!bundle) return <Splash />;

  if (showWelcome) {
    return (
      <TooltipProvider>
        <div className="h-full">
          <WelcomeScreen
            metadata={metadata}
            siteCount={sites.length}
            onEnter={(m) => {
              setMode(m);
              setShowWelcome(false);
            }}
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      {/* Rows: header then content. The content row is the only scroll owner,
          so the map can never be pushed off-screen or overlap the header. */}
      <div className="grid h-full grid-rows-[auto_1fr] overflow-hidden">
        <AppHeader
          mode={mode}
          onModeChange={requestModeChange}
          onOpenScoreGuide={() => setScoreGuideOpen(true)}
          onOpenDatasetInfo={() => setDatasetInfoOpen(true)}
          onRefresh={refresh}
          onGoHome={handleGoHome}
          refreshing={refreshing}
          loadedAt={bundle.loadedAt}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="grid min-h-0 grid-rows-[minmax(16rem,45vh)_1fr] lg:grid-cols-[1fr_23rem] lg:grid-rows-1">
          {/* Map */}
          <div className="relative min-h-0 overflow-hidden border-b lg:order-1 lg:border-r lg:border-b-0">
            <SuitabilityMap
              mapRef={mapRef}
              theme={theme}
              mode={mode}
              sites={sites}
              resultSites={search.results}
              topRecommendations={mapRecommendations}
              districtBounds={districtBounds}
              boundary={bundle.boundary}
              coastline={bundle.coastline}
              facilities={bundle.facilities}
              shorelineBufferM={bufferM}
              showShorelineBuffer={showShorelineBuffer}
              showAllSites={showAllSites}
              showFacilities={showFacilities}
              searchCentre={search.centre}
              searchRadiusM={Number.parseFloat(search.radiusInput) || 0}
              evalPoint={evaluation.point}
              onSelectSite={setSelectedSiteId}
              onPickLocation={handlePickLocation}
            />

            <MapLegend
              thresholds={metadata?.thresholds}
              shorelineBufferM={bufferM}
              showShorelineBuffer={showShorelineBuffer}
              onToggleShorelineBuffer={() => setShowShorelineBuffer((v) => !v)}
              showAllSites={showAllSites}
              onToggleAllSites={() => setShowAllSites((v) => !v)}
              showFacilities={showFacilities}
              onToggleFacilities={() => setShowFacilities((v) => !v)}
              facilityCount={facilityCount}
              siteCount={sites.length}
              excludedCount={excludedCount}
            />
          </div>

          {/* Sidebar — its own scroll container, so panels never overlap the map */}
          <aside className="bg-card/40 flex min-h-0 flex-col lg:order-2">
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-5 p-4">
                <SearchPanel
                  mode={mode}
                  barangays={bundle.barangays}
                  latitude={isRecommendation ? search.latitude : evaluation.latitude}
                  longitude={
                    isRecommendation ? search.longitude : evaluation.longitude
                  }
                  radiusM={search.radiusInput}
                  minRadiusM={MIN_RADIUS_M}
                  maxRadiusM={MAX_RADIUS_M}
                  topN={search.topNInput}
                  minTopN={MIN_TOP_N}
                  maxTopN={MAX_TOP_N}
                  error={isRecommendation ? search.error : evaluation.error}
                  hasResults={search.results.length > 0}
                  onLatitudeChange={
                    isRecommendation ? search.setLatitude : evaluation.setLatitude
                  }
                  onLongitudeChange={
                    isRecommendation
                      ? search.setLongitude
                      : evaluation.setLongitude
                  }
                  onRadiusChange={search.setRadius}
                  onTopNChange={search.setTopN}
                  onRun={isRecommendation ? search.run : evaluation.run}
                  onClear={handleClear}
                  onFlyTo={flyTo}
                />

                <div className="border-t pt-4">
                  {isRecommendation ? (
                    <RecommendationsPanel
                      results={search.results}
                      summary={search.summary}
                      topN={search.topN}
                      radiusM={Number.parseFloat(search.radiusInput) || 0}
                      onSelectSite={setSelectedSiteId}
                      onFocusSite={(site) =>
                        flyTo(site.latitude, site.longitude, 16.5)
                      }
                    />
                  ) : (
                    <EvaluationPanel
                      result={evaluation.result}
                      metadata={metadata}
                      onOpenDetails={setSelectedSiteId}
                    />
                  )}
                </div>
              </div>
            </ScrollArea>
          </aside>
        </main>
      </div>

      <ScoreGuideDialog
        open={scoreGuideOpen}
        onOpenChange={setScoreGuideOpen}
        metadata={metadata}
      />
      <DatasetInfoDialog
        open={datasetInfoOpen}
        onOpenChange={setDatasetInfoOpen}
        metadata={metadata}
        siteCount={sites.length}
      />
      <SiteDetailsDialog
        site={selectedSite}
        metadata={metadata}
        recommendationRank={selectedRank}
        onOpenChange={(open) => !open && setSelectedSiteId(null)}
      />
      <ConfirmDialog
        open={pendingMode !== null}
        onOpenChange={(open) => !open && setPendingMode(null)}
        title={
          pendingMode === "evaluation"
            ? "Switch to Evaluate?"
            : "Switch to Recommend?"
        }
        description={`This clears what you have done in ${
          isRecommendation ? "Recommend" : "Evaluate"
        } mode.`}
        consequences={modeChangeConsequences}
        confirmLabel="Clear and switch"
        cancelLabel="Stay here"
        onConfirm={confirmModeChange}
      />
    </TooltipProvider>
  );
}

import { useEffect, useMemo, useRef } from "react";
import type MapLibreGL from "maplibre-gl";
import { Popup } from "maplibre-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";

import { useMap } from "@/components/ui/map";
import {
  metresToPixelsExpression,
  useMapSource,
} from "@/components/map/use-map-source";
import type { Theme } from "@/hooks/use-theme";
import type { LngLatBounds } from "@/lib/geo";
import { framePadding } from "@/lib/map-view";
import {
  facilityKindLabel,
  facilityName,
  facilityTitle,
  type FacilityCollection,
} from "@/lib/facilities";
import type { AppMode, Site, SuitabilityClass } from "@/types/polaris";
import {
  CLASS_HEX,
  EXCLUDED_HEX,
  FACILITY_HEX,
  formatScore,
  ineligibilityReason,
  isShorelineExcluded,
} from "@/lib/suitability";

/** Reference latitude for ground-distance-to-pixel conversions in Talomo. */
const REF_LAT = 7.05;

const CLASS_INDEX: Record<SuitabilityClass, number> = {
  "Not Suitable": 0,
  "Low Suitability": 1,
  "Moderately Suitable": 2,
  "Highly Suitable": 3,
};

/* ================================================================== */
/*  District boundary                                                  */
/* ================================================================== */

/** Frames the whole district once, as soon as the map can be moved. */
export function DistrictView({ bounds }: { bounds: LngLatBounds | null }) {
  const { map, isLoaded } = useMap();
  const framed = useRef(false);

  useEffect(() => {
    if (!map || !isLoaded || !bounds || framed.current) return;
    framed.current = true;
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: framePadding(map.getContainer().clientWidth), duration: 0 },
    );
  }, [map, isLoaded, bounds]);

  return null;
}

export function BoundaryLayer({
  data,
  theme,
}: {
  data: FeatureCollection | null;
  theme: Theme;
}) {
  const layers = useMemo(
    () => [
      {
        id: "talomo-boundary-line",
        type: "line" as const,
        paint: {
          "line-color": theme === "dark" ? "#8b9bd4" : "#4c5fa8",
          "line-width": 1.6,
          "line-opacity": 0.9,
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "talomo-boundary-fill",
        type: "fill" as const,
        paint: {
          "fill-color": theme === "dark" ? "#8b9bd4" : "#4c5fa8",
          "fill-opacity": 0.05,
        },
      },
    ],
    [theme],
  );

  useMapSource("talomo-boundary", data, layers);
  return null;
}

/* ================================================================== */
/*  50 m shoreline exclusion buffer (panel revision #2)                */
/* ================================================================== */

/** Minimum on-screen width of the band, so it stays legible at district zoom. */
const SHORELINE_BAND_MIN_PX = 9;

/**
 * Draws the shoreline setback as a band `bufferM` metres to each side of the OSM
 * coastline, so the constraint is visible rather than merely asserted. The width
 * is true to scale from about zoom 12.8 and held at the floor below that. The
 * exclusion itself is always exact: it comes from the site's measured distance,
 * never from what is drawn.
 */
export function ShorelineBufferLayer({
  data,
  bufferM,
  theme,
  visible,
}: {
  data: FeatureCollection | null;
  bufferM: number;
  theme: Theme;
  visible: boolean;
}) {
  const layers = useMemo(() => {
    const bandColor = theme === "dark" ? "#f0776a" : "#d64545";
    return [
      {
        id: "shoreline-buffer-band",
        type: "line" as const,
        layout: {
          "line-cap": "round" as const,
          "line-join": "round" as const,
          visibility: (visible ? "visible" : "none") as "visible" | "none",
        },
        paint: {
          "line-color": bandColor,
          // Doubled: the setback extends bufferM to *each* side of the line.
          "line-width": metresToPixelsExpression(
            bufferM * 2,
            REF_LAT,
            SHORELINE_BAND_MIN_PX,
          ),
          "line-opacity": 0.22,
        },
      },
      {
        id: "shoreline-coastline",
        type: "line" as const,
        layout: {
          "line-cap": "round" as const,
          "line-join": "round" as const,
          visibility: (visible ? "visible" : "none") as "visible" | "none",
        },
        paint: {
          "line-color": bandColor,
          "line-width": 1.2,
          "line-opacity": 0.75,
        },
      },
    ];
  }, [bufferM, theme, visible]);

  useMapSource("shoreline", data, layers);
  return null;
}

/* ================================================================== */
/*  Existing health facilities                                         */
/* ================================================================== */

/**
 * The facilities every site's `facility_distance_m` is measured against.
 *
 * Drawn as hollow rings rather than filled dots: the filled-circle vocabulary
 * belongs to scored sites, and a facility is not a candidate location. Keeping
 * the two shapes apart means the layer can be switched on over the site dots
 * without either becoming ambiguous.
 */
export function FacilitiesLayer({
  data,
  theme,
  visible,
}: {
  data: FeatureCollection | null;
  theme: Theme;
  visible: boolean;
}) {
  const layers = useMemo(() => {
    const ring = FACILITY_HEX[theme];
    const core = theme === "dark" ? "#0b1120" : "#ffffff";
    const visibility = (visible ? "visible" : "none") as "visible" | "none";

    return [
      {
        id: "facility-points",
        type: "circle" as const,
        layout: { visibility },
        paint: {
          "circle-color": core,
          "circle-opacity": 0.95,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            2.6,
            12,
            3.6,
            14,
            5,
            16,
            7,
            18,
            9.5,
          ] as MapLibreGL.ExpressionSpecification,
          "circle-stroke-color": ring,
          "circle-stroke-opacity": 0.95,
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            1.4,
            14,
            2,
            18,
            2.8,
          ] as MapLibreGL.ExpressionSpecification,
        },
      },
    ];
  }, [theme, visible]);

  useMapSource("facilities", data, layers);
  return null;
}

/** Half-width of the facility ring hit box, in pixels. */
const FACILITY_SLOP_PX = 4;

/**
 * The facility ring under `point`, or `undefined`. A ring is only a few pixels
 * across at district zoom, so this tests a small box and takes the ring nearest
 * the cursor. Hover, click and the site card's deferral all route through here,
 * so whichever card is showing is the thing a click acts on.
 */
export function pickFacility(
  map: MapLibreGL.Map,
  point: MapLibreGL.Point,
): MapLibreGL.MapGeoJSONFeature | undefined {
  if (!map.getLayer("facility-points")) return undefined;
  if (map.getLayoutProperty("facility-points", "visibility") === "none") {
    return undefined;
  }

  const box = [
    [point.x - FACILITY_SLOP_PX, point.y - FACILITY_SLOP_PX],
    [point.x + FACILITY_SLOP_PX, point.y + FACILITY_SLOP_PX],
  ] as [MapLibreGL.PointLike, MapLibreGL.PointLike];

  let best: MapLibreGL.MapGeoJSONFeature | undefined;
  let bestDistance = Infinity;
  for (const feature of map.queryRenderedFeatures(box, {
    layers: ["facility-points"],
  })) {
    if (feature.geometry.type !== "Point") continue;
    const screen = map.project(feature.geometry.coordinates as [number, number]);
    const d = (screen.x - point.x) ** 2 + (screen.y - point.y) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = feature;
    }
  }
  return best;
}

/** The `fid` of a facility that opens a details dialog, else null. */
export function clickableFacilityId(
  feature: MapLibreGL.MapGeoJSONFeature | undefined,
): number | null {
  const props = feature?.properties;
  return props?.has_details === 1 && typeof props.fid === "number"
    ? props.fid
    : null;
}

/**
 * Hover readout for the facility rings.
 *
 * Every facility gets this card. Only those with recorded details beyond the
 * name and type are clickable, and the card says so: a click on the rest falls
 * through to the map as before, so they never get in the way of placing a
 * search centre.
 */
export function FacilityHover({
  facilities,
  enabled,
}: {
  facilities: FacilityCollection | null;
  enabled: boolean;
}) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded || !enabled || !facilities) return;

    let popup: MapLibreGL.Popup | null = null;
    let shown: number | null = null;

    const clear = () => {
      popup?.remove();
      popup = null;
      shown = null;
    };

    const handleMove = (e: MapLibreGL.MapMouseEvent) => {
      const hit = pickFacility(map, e.point);
      const fid = hit?.properties?.fid;
      const feature =
        typeof fid === "number" ? facilities.features[fid] : undefined;
      if (!feature) return clear();
      if (popup && shown === fid) return;

      const props = feature.properties;
      const title = facilityTitle(props);
      const kind = facilityKindLabel(props);
      const hint = props.has_details
        ? "Click for details"
        : "No further details recorded";

      // Anchored to the ring, not the cursor, so the card holds still.
      const at = feature.geometry.coordinates as [number, number];
      // `.maplibregl-popup-content` is stripped to transparent globally, so
      // the card styling lives here — same vocabulary as <MarkerTooltip>.
      const html =
        `<div class="bg-popover text-popover-foreground max-w-56 rounded-lg border px-2.5 py-1.5 shadow-lg">` +
        `<p class="text-sm font-semibold">${escapeHtml(title)}</p>` +
        (facilityName(props)
          ? `<p class="text-muted-foreground text-xs">${escapeHtml(kind)}</p>`
          : "") +
        `<p class="text-muted-foreground mt-1 text-[11px]">Existing facility — not a candidate site</p>` +
        `<p class="text-muted-foreground mt-0.5 text-[11px]">${hint}</p>` +
        `</div>`;

      if (popup) {
        popup.setLngLat(at).setHTML(html);
      } else {
        popup = new Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "polaris-facility-popup",
        })
          .setLngLat(at)
          .setHTML(html)
          .addTo(map);
      }
      shown = fid as number;
    };

    map.on("mousemove", handleMove);
    map.on("mouseout", clear);
    // A click may open the details dialog; the card would sit behind it.
    map.on("click", clear);
    return () => {
      map.off("mousemove", handleMove);
      map.off("mouseout", clear);
      map.off("click", clear);
      clear();
    };
  }, [map, isLoaded, enabled, facilities]);

  return null;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );
}

/* ================================================================== */
/*  Candidate site dots                                                */
/* ================================================================== */

/**
 * Exactly what the dot layers need and nothing more: `cls` and `excluded` are
 * read by the paint expression, `site_id` by the hit test. Everything else a
 * card wants is looked up from the `Site` record by id, so ~3,000 features do
 * not each carry a copy of it.
 */
export interface SitePointProperties {
  site_id: string;
  cls: number;
  excluded: number;
}

export function sitesToFeatureCollection(
  sites: readonly Site[],
  bufferM: number,
): FeatureCollection<Point, SitePointProperties> {
  return {
    type: "FeatureCollection",
    features: sites.map((site) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [site.longitude, site.latitude] },
      properties: {
        site_id: site.site_id,
        cls: CLASS_INDEX[site.suitability_class],
        excluded: isShorelineExcluded(site, bufferM) ? 1 : 0,
      },
    })),
  };
}

function classColorExpression(theme: Theme): MapLibreGL.ExpressionSpecification {
  const tone = (c: SuitabilityClass) => CLASS_HEX[c][theme];
  return [
    "case",
    ["==", ["get", "excluded"], 1],
    EXCLUDED_HEX[theme],
    [
      "match",
      ["get", "cls"],
      3,
      tone("Highly Suitable"),
      2,
      tone("Moderately Suitable"),
      1,
      tone("Low Suitability"),
      tone("Not Suitable"),
    ],
  ] as MapLibreGL.ExpressionSpecification;
}

/**
 * All ~3,000 scored candidate sites as a single GPU-rendered circle layer.
 * One layer keeps panning smooth — the equivalent count of DOM markers would
 * stutter badly on a laptop.
 */
export function SiteDotsLayer({
  data,
  theme,
  dimmed,
}: {
  data: FeatureCollection<Point, SitePointProperties> | null;
  theme: Theme;
  dimmed: boolean;
}) {
  const layers = useMemo(
    () => [
      {
        id: "site-dots",
        type: "circle" as const,
        paint: {
          "circle-color": classColorExpression(theme),
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            1.4,
            12,
            2.4,
            14,
            3.8,
            16,
            6.5,
            18,
            10,
          ] as MapLibreGL.ExpressionSpecification,
          "circle-opacity": dimmed ? 0.28 : 0.78,
          "circle-stroke-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0,
            15,
            0.8,
          ] as MapLibreGL.ExpressionSpecification,
          "circle-stroke-color": theme === "dark" ? "#0b1120" : "#ffffff",
          "circle-stroke-opacity": dimmed ? 0.2 : 0.6,
        },
      },
    ],
    [theme, dimmed],
  );

  useMapSource("site-dots-source", data, layers);
  return null;
}

/* ================================================================== */
/*  Site dot hover readout                                             */
/* ================================================================== */

/** Hover-testable dot layers, topmost first — that is also the hit priority. */
const HOVER_LAYERS = ["result-dots", "site-dots"] as const;

/** Half-width of the dot hit box, in pixels. */
const HIT_SLOP_PX = 6;

/**
 * The site dot under `point`, or `undefined` for open map.
 *
 * A background dot is barely 2 px across at district zoom, so an exact point
 * query would demand pixel-perfect aim. This queries a small box instead and
 * resolves it to the dot actually nearest the cursor. `layers` is consulted in
 * order, so an emphasised result dot always wins over the dimmed district dot
 * sitting underneath it.
 *
 * Hover and click both route through here, which is what lets the hover card
 * act as the click affordance: if you can see the card, clicking opens it.
 */
export function pickSiteDot(
  map: MapLibreGL.Map,
  point: MapLibreGL.Point,
  layers: readonly string[],
): MapLibreGL.MapGeoJSONFeature | undefined {
  const box = [
    [point.x - HIT_SLOP_PX, point.y - HIT_SLOP_PX],
    [point.x + HIT_SLOP_PX, point.y + HIT_SLOP_PX],
  ] as [MapLibreGL.PointLike, MapLibreGL.PointLike];

  for (const id of layers) {
    if (!map.getLayer(id)) continue;

    let best: MapLibreGL.MapGeoJSONFeature | undefined;
    let bestDistance = Infinity;

    for (const feature of map.queryRenderedFeatures(box, { layers: [id] })) {
      if (feature.geometry.type !== "Point") continue;
      const [lon, lat] = feature.geometry.coordinates;
      const screen = map.project([lon, lat]);
      const d = (screen.x - point.x) ** 2 + (screen.y - point.y) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = feature;
      }
    }
    if (best) return best;
  }
  return undefined;
}

/**
 * Score readout for the district-wide dot cloud.
 *
 * The top-3 recommendation markers are real DOM markers and carry their own
 * <MarkerTooltip>; the ~3,000 background sites are a single GPU circle layer
 * with no DOM to attach to, so the same information is delivered here as a
 * transient MapLibre popup driven by `queryRenderedFeatures`.
 *
 * Hover only — the background dots stay click-through so placing a search
 * centre (and clicking anywhere in evaluation mode) keeps working.
 */
export function SiteHover({
  sites,
  bufferM,
  theme,
  pickLayers,
  mode,
}: {
  sites: readonly Site[];
  bufferM: number;
  theme: Theme;
  /** Layers whose dots open the details dialog — drives the card's hint line. */
  pickLayers: readonly string[];
  mode: AppMode;
}) {
  const { map, isLoaded } = useMap();

  /** The dot features carry only what paint needs; hover wants the record. */
  const byId = useMemo(
    () => new Map(sites.map((site) => [site.site_id, site])),
    [sites],
  );

  useEffect(() => {
    if (!map || !isLoaded) return;

    let popup: MapLibreGL.Popup | null = null;
    /** `${site_id}|${layer}` of what the popup currently shows, if anything. */
    let shown: string | null = null;

    const clear = () => {
      popup?.remove();
      popup = null;
      shown = null;
    };

    const handleMove = (e: MapLibreGL.MapMouseEvent) => {
      // Facilities are drawn over the dot cloud and own their own popup, so
      // whatever is visually on top wins rather than both firing at once.
      if (pickFacility(map, e.point)) return clear();

      const hit = pickSiteDot(map, e.point, HOVER_LAYERS);
      if (!hit) return clear();

      const siteId = hit.properties?.site_id;
      const site = typeof siteId === "string" ? byId.get(siteId) : undefined;
      if (!site) return clear();

      const key = `${site.site_id}|${hit.layer.id}`;
      if (popup && key === shown) return;

      // Anchored to the site, not the cursor: the card then sits still while
      // the pointer moves within a dot instead of jittering along with it.
      const at: [number, number] = [site.longitude, site.latitude];
      const html = siteCardHtml(
        site,
        bufferM,
        theme,
        clickHint(hit.layer.id, pickLayers, mode),
      );

      if (popup) {
        popup.setLngLat(at).setHTML(html);
      } else {
        popup = new Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "polaris-site-popup",
        })
          .setLngLat(at)
          .setHTML(html)
          .addTo(map);
      }
      shown = key;
    };

    map.on("mousemove", handleMove);
    map.on("mouseout", clear);
    // A click hands over to the details dialog or the evaluation panel; the
    // card would otherwise sit behind the modal and reappear on close.
    map.on("click", clear);

    return () => {
      map.off("mousemove", handleMove);
      map.off("mouseout", clear);
      map.off("click", clear);
      clear();
    };
  }, [map, isLoaded, byId, bufferM, theme, pickLayers, mode]);

  return null;
}

/**
 * What the card promises a click will do — never a guess: it is derived from
 * the very `pickLayers` the click handler consults.
 */
function clickHint(
  layerId: string,
  pickLayers: readonly string[],
  mode: AppMode,
): string | null {
  if (pickLayers.includes(layerId)) return "Click for the full breakdown";
  // Evaluation mode keeps every click as a pick, and a click on a dot resolves
  // to that same site — the breakdown lands in the panel instead of a dialog.
  if (mode === "evaluation") return "Click to evaluate this site";
  return null;
}

/** Same card vocabulary as <MarkerTooltip>, built as a string for MapLibre. */
function siteCardHtml(
  site: Site,
  bufferM: number,
  theme: Theme,
  hint: string | null,
): string {
  const excluded = isShorelineExcluded(site, bufferM);
  const swatch = excluded
    ? EXCLUDED_HEX[theme]
    : CLASS_HEX[site.suitability_class][theme];
  const reason = ineligibilityReason(site, bufferM);

  return (
    `<div class="bg-popover text-popover-foreground max-w-60 rounded-lg border px-3 py-2 shadow-xl">` +
      `<div class="flex items-center gap-1.5">` +
        `<span class="size-2 shrink-0 rounded-full" style="background:${swatch}"></span>` +
        `<p class="text-sm font-semibold">${escapeHtml(site.site_id)}</p>` +
      `</div>` +
      (site.barangay
        ? `<p class="text-muted-foreground text-xs">${escapeHtml(site.barangay)}</p>`
        : "") +
      `<p class="mt-1 text-xs">Score ` +
        `<span class="tabular font-semibold">${formatScore(site.score)}</span> ` +
        `<span class="text-muted-foreground">(${escapeHtml(site.suitability_class)})</span>` +
      `</p>` +
      (reason
        ? `<p class="text-suit-none mt-1 text-[11px]">Not eligible — ${escapeHtml(reason)}</p>`
        : "") +
      (hint
        ? `<p class="text-muted-foreground mt-1 text-[11px]">${hint}</p>`
        : "") +
    `</div>`
  );
}

/**
 * Central click/hover routing. A single map-level handler decides whether a
 * click landed on a selectable site dot or on open map, rather than relying on
 * the relative ordering of MapLibre's layer-filtered and map-level listeners.
 *
 * `pickLayers` is deliberately narrow. The background dot layer covers most of
 * the district, so if it intercepted clicks the user could never place a search
 * centre or evaluate a point — only the emphasised result dots opt in.
 */
export function MapInteractions({
  pickLayers,
  onSelectSite,
  onSelectFacility,
  onPickLocation,
}: {
  pickLayers: readonly string[];
  onSelectSite: (siteId: string) => void;
  onSelectFacility: (fid: number) => void;
  onPickLocation: (lat: number, lon: number) => void;
}) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;

    /**
     * Facility first: when a ring is under the cursor its card is the one
     * showing (the site card defers to it), so the click goes where the card
     * says. Rings without details fall through, exactly as before.
     */
    const facilityAt = (point: MapLibreGL.Point) =>
      clickableFacilityId(pickFacility(map, point));

    const handleClick = (e: MapLibreGL.MapMouseEvent) => {
      const fid = facilityAt(e.point);
      if (fid !== null) {
        onSelectFacility(fid);
        return;
      }

      const siteId = pickSiteDot(map, e.point, pickLayers)?.properties?.site_id;

      if (typeof siteId === "string") {
        onSelectSite(siteId);
      } else {
        onPickLocation(e.lngLat.lat, e.lngLat.lng);
      }
    };

    const handleMove = (e: MapLibreGL.MapMouseEvent) => {
      map.getCanvas().style.cursor =
        facilityAt(e.point) !== null || pickSiteDot(map, e.point, pickLayers)
          ? "pointer"
          : "crosshair";
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMove);
    map.getCanvas().style.cursor = "crosshair";

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMove);
      if (map.getCanvas()) map.getCanvas().style.cursor = "";
    };
  }, [map, isLoaded, pickLayers, onSelectSite, onSelectFacility, onPickLocation]);

  return null;
}

/** Emphasised dots for the sites inside the current search radius. */
export function ResultDotsLayer({
  data,
  theme,
}: {
  data: FeatureCollection<Point, SitePointProperties> | null;
  theme: Theme;
}) {
  const layers = useMemo(
    () => [
      {
        id: "result-dots",
        type: "circle" as const,
        paint: {
          "circle-color": classColorExpression(theme),
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            3,
            14,
            5.5,
            16,
            8.5,
            18,
            12,
          ] as MapLibreGL.ExpressionSpecification,
          "circle-opacity": 0.92,
          "circle-stroke-width": 1.4,
          "circle-stroke-color": theme === "dark" ? "#0b1120" : "#ffffff",
        },
      },
    ],
    [theme],
  );

  useMapSource("result-dots-source", data, layers);
  return null;
}

/* ================================================================== */
/*  Search radius                                                      */
/* ================================================================== */

function geodesicCircle(
  lat: number,
  lon: number,
  radiusM: number,
  steps = 96,
): Feature<Polygon> {
  const ring: [number, number][] = [];
  const dLat = radiusM / 110574;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function SearchRadiusLayer({
  centre,
  radiusM,
  theme,
}: {
  centre: { lat: number; lon: number } | null;
  radiusM: number;
  theme: Theme;
}) {
  const data = useMemo<FeatureCollection | null>(() => {
    if (!centre || !Number.isFinite(radiusM) || radiusM <= 0) return null;
    return {
      type: "FeatureCollection",
      features: [geodesicCircle(centre.lat, centre.lon, radiusM)],
    };
  }, [centre, radiusM]);

  const layers = useMemo(() => {
    const tint = theme === "dark" ? "#8b9cf5" : "#4c5fd7";
    return [
      {
        id: "search-radius-fill",
        type: "fill" as const,
        paint: { "fill-color": tint, "fill-opacity": 0.1 },
      },
      {
        id: "search-radius-line",
        type: "line" as const,
        paint: {
          "line-color": tint,
          "line-width": 1.8,
          "line-opacity": 0.85,
          "line-dasharray": [2, 1.5],
        },
      },
    ];
  }, [theme]);

  useMapSource("search-radius", data, layers);
  return null;
}

import type { Site } from "@/types/polaris";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearestSite {
  site: Site;
  distanceM: number;
}

/** Nearest scored candidate site to an arbitrary point. */
export function findNearestSite(
  sites: readonly Site[],
  lat: number,
  lon: number,
): NearestSite | null {
  let best: Site | null = null;
  let bestD = Infinity;

  for (const site of sites) {
    const d = haversineM(lat, lon, site.latitude, site.longitude);
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  return best ? { site: best, distanceM: bestD } : null;
}

/** Every site within `radiusM` of the centre, paired with its distance. */
export function sitesWithinRadius(
  sites: readonly Site[],
  lat: number,
  lon: number,
  radiusM: number,
): { site: Site; distanceM: number }[] {
  const out: { site: Site; distanceM: number }[] = [];
  for (const site of sites) {
    const d = haversineM(lat, lon, site.latitude, site.longitude);
    if (d <= radiusM) out.push({ site, distanceM: d });
  }
  return out;
}

export interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundsOfSites(sites: readonly Site[]): LngLatBounds | null {
  if (sites.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const s of sites) {
    if (s.longitude < west) west = s.longitude;
    if (s.longitude > east) east = s.longitude;
    if (s.latitude < south) south = s.latitude;
    if (s.latitude > north) north = s.latitude;
  }
  return { west, south, east, north };
}

/** Extent of every coordinate in a feature collection, or null if it has none. */
export function boundsOfFeatures(
  collection: GeoJSON.FeatureCollection | null | undefined,
): LngLatBounds | null {
  let bounds: LngLatBounds | null = null;

  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number") {
      const [lon, lat] = value as number[];
      bounds = bounds
        ? {
            west: Math.min(bounds.west, lon),
            south: Math.min(bounds.south, lat),
            east: Math.max(bounds.east, lon),
            north: Math.max(bounds.north, lat),
          }
        : { west: lon, south: lat, east: lon, north: lat };
      return;
    }
    value.forEach(visit);
  };

  const walk = (geometry: GeoJSON.Geometry | null): void => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") geometry.geometries.forEach(walk);
    else visit(geometry.coordinates);
  };

  collection?.features.forEach((feature) => walk(feature.geometry));
  return bounds;
}

export function isInsideBounds(
  lat: number,
  lon: number,
  b: LngLatBounds,
  padDeg = 0,
): boolean {
  return (
    lon >= b.west - padDeg &&
    lon <= b.east + padDeg &&
    lat >= b.south - padDeg &&
    lat <= b.north + padDeg
  );
}

/** A GeoJSON linear ring: [lon, lat] pairs, first point repeated last. */
type Ring = readonly (readonly number[])[];
/** Outer ring first, then any holes. */
type PolygonRings = readonly Ring[];

/**
 * Ray-casting test against a single ring, in raw lon/lat degrees.
 *
 * Talomo spans well under a degree and never crosses the antimeridian or a
 * pole, so treating degrees as planar costs nothing here and keeps this
 * dependency-free.
 */
function isInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
function isInPolygon(lon: number, lat: number, rings: PolygonRings): boolean {
  if (rings.length === 0 || !isInRing(lon, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (isInRing(lon, lat, rings[i])) return false;
  }
  return true;
}

/**
 * Point-in-polygon against a (Multi)Polygon GeoJSON geometry.
 *
 * Returns `false` for any other geometry type, so callers that cannot prove
 * containment should decide for themselves whether to keep or drop the point
 * rather than relying on this to fail open.
 */
export function isInsideGeometry(
  lon: number,
  lat: number,
  geometry: GeoJSON.Geometry | null | undefined,
): boolean {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return isInPolygon(lon, lat, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((rings) => isInPolygon(lon, lat, rings));
  }
  return false;
}

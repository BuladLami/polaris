#!/usr/bin/env python3
"""
Builds the Project NOAH hazard overlays the map can switch on.

    npm run data:hazards                    (looks in "<repo>/NOAH FILES")
    python scripts/build_hazard_layers.py --noah-dir <folder with the shapefiles>

Reads   the three Project NOAH shapefiles the pipeline uses (found by file name
        anywhere under --noah-dir):
          DavaoDelSur_Flood_5year.shp       class field Var
          DavaoDelSur_LandslideHazards.shp  class field LH
          DavaoDelSur_StormSurge_SSA4.shp   class field HAZ
        public/data/talomo_boundary.json    the district (union of the 14
                                            barangay polygons; the tiles use it too)
        public/data/candidate_sites.json    for the consistency check only
Writes  public/data/talomo_hazard_flood.json
        public/data/talomo_hazard_landslide.json
        public/data/talomo_hazard_storm_surge.json
        one feature per class present, properties {hazard_class: 1 | 2 | 3}

Steps, per layer
  1. Class values are coerced exactly as the notebook's load_noah_layer does:
     to_numeric -> round -> integer -> clip to 0..3. 1 = Low, 2 = Moderate,
     3 = High. 0 and missing values are not drawn.
  2. Clipped to the district and dissolved by class, in EPSG:32651 (metres).
  3. Where classes overlap, the higher class keeps the area. The notebook gives
     a site the HIGHEST class of any polygon it falls in, so this makes the
     colour on the map the class the site was scored with.
  4. Simplified with a tolerance of SIMPLIFY_M metres (Douglas-Peucker,
     topology-preserving), reprojected to EPSG:4326 and rounded to 6 decimals.

Self-checks (the script fails if any does not hold)
  - per-class area inside the district, after simplification and rounding,
    within 1 % of the unsimplified clip;
  - every output geometry is valid.
Consistency check (reported, never "fixed"): the class read from the published
overlay at each site's exact grid point (the point the notebook sampled; the
export rounds coordinates to 4 decimals, up to ~8 m away) against the site's
class in candidate_sites.json. The exported-point result is reported too. The
exact points are written to src/test/fixtures/site_grid_points.json so a test
can repeat the check. No site data is changed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely import clip_by_rect, make_valid, set_precision
from shapely.geometry import Point, mapping, shape
from pyproj import Transformer
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent          # polaris/ (the app)
DATA = ROOT / "public" / "data"
BOUNDARY = DATA / "talomo_boundary.json"
SITES = DATA / "candidate_sites.json"
DEFAULT_NOAH_DIR = ROOT.parent / "NOAH FILES"

GEOGRAPHIC_CRS = "EPSG:4326"
PROJECTED_CRS = "EPSG:32651"          # the pipeline's metric CRS
# At zoom 16 one screen pixel is about 1.19 m on the ground at Talomo's
# latitude (512 px tiles), so a 1 m tolerance moves no edge by a full pixel.
SIMPLIFY_M = 1.0
COORD_DECIMALS = 6                    # about 0.11 m
AREA_TOLERANCE = 0.01                 # 1 %
SIZE_WARN_BYTES = 2_000_000
GRID_SPACING_M = 250
SNAP_TOLERANCE_M = 10.0               # 4-decimal export rounding is at most ~8 m
FIXTURE = ROOT / "src" / "test" / "fixtures" / "site_grid_points.json"

LAYERS = [
    # key in candidate_sites.json, output name, shapefile, class field
    ("flood_susceptibility", "flood", "DavaoDelSur_Flood_5year.shp", "Var"),
    ("landslide_susceptibility", "landslide", "DavaoDelSur_LandslideHazards.shp", "LH"),
    ("storm_surge_susceptibility", "storm_surge", "DavaoDelSur_StormSurge_SSA4.shp", "HAZ"),
]
LABEL = {1: "Low", 2: "Moderate", 3: "High"}


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def find_shapefile(noah_dir: Path, name: str) -> Path:
    hits = sorted(noah_dir.rglob(name))
    if not hits:
        fail(f"{name} not found under {noah_dir}. Put the full shapefile set "
             f"(.shp .shx .dbf .prj) there, or pass --noah-dir.")
    if len(hits) > 1:
        fail(f"{name} found more than once under {noah_dir}: {[str(h) for h in hits]}")
    return hits[0]


def coerce_class(series: pd.Series) -> pd.Series:
    """The notebook's coercion, unchanged: round, integer, clip to 0..3."""
    return pd.to_numeric(series, errors="coerce").round().astype("Int64").clip(0, 3)


def class_of_point(pt: Point, classes: dict[int, object]) -> int:
    """Highest class whose polygon contains the point (the notebook's rule)."""
    hit = [c for c, g in classes.items() if g.contains(pt)]
    return max(hit) if hit else 0


def grid_points(sites: list[dict], district_m) -> list[tuple[float, float]]:
    """Each site's exact grid point, as the notebook built it (Cell 5):
    x = minx + 125 + 250 i, y = miny + 125 + 250 j in EPSG:32651, from the
    district's bounds. The exported coordinates are snapped back to it."""
    to_m = Transformer.from_crs(GEOGRAPHIC_CRS, PROJECTED_CRS, always_xy=True)
    to_g = Transformer.from_crs(PROJECTED_CRS, GEOGRAPHIC_CRS, always_xy=True)
    minx, miny, _, _ = district_m.bounds
    half = GRID_SPACING_M / 2
    out = []
    for s in sites:
        x, y = to_m.transform(s["longitude"], s["latitude"])
        gx = minx + half + GRID_SPACING_M * round((x - minx - half) / GRID_SPACING_M)
        gy = miny + half + GRID_SPACING_M * round((y - miny - half) / GRID_SPACING_M)
        if ((x - gx) ** 2 + (y - gy) ** 2) ** 0.5 > SNAP_TOLERANCE_M:
            fail(f"{s['site_id']} is not within {SNAP_TOLERANCE_M} m of a grid point")
        out.append(to_g.transform(gx, gy))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--noah-dir", type=Path, default=DEFAULT_NOAH_DIR)
    args = ap.parse_args()
    if not args.noah_dir.is_dir():
        fail(f"NOAH folder not found: {args.noah_dir}")

    boundary_fc = json.loads(BOUNDARY.read_text(encoding="utf-8"))
    district_geo = unary_union([shape(f["geometry"]) for f in boundary_fc["features"]])
    district = gpd.GeoSeries([district_geo], crs=GEOGRAPHIC_CRS)
    district_m = district.to_crs(PROJECTED_CRS).iloc[0]

    dataset = json.loads(SITES.read_text(encoding="utf-8"))
    sites = dataset["sites"]
    exact_points = grid_points(sites, district_m)

    report = {}
    for key, name, shp_name, field in LAYERS:
        shp = find_shapefile(args.noah_dir, shp_name)
        # Only what can touch the district is read; the bbox is reprojected to
        # the file's CRS by geopandas.
        g = gpd.read_file(shp, bbox=district)
        g = g.set_crs(GEOGRAPHIC_CRS) if g.crs is None else g.to_crs(GEOGRAPHIC_CRS)
        if field not in g.columns:
            fail(f"{shp_name} has no field {field}; fields are {list(g.columns)}")
        g["hazard_class"] = coerce_class(g[field])
        g = g.dropna(subset=["geometry"])
        # Each layer is a few province-wide multipolygons. Cut them to a box a
        # little larger than the district first, so the repair and dissolve
        # below work on the district's share only.
        minx, miny, maxx, maxy = district_geo.bounds
        pad = 0.01  # about 1.1 km
        g["geometry"] = g.geometry.apply(
            lambda geom: make_valid(clip_by_rect(geom, minx - pad, miny - pad, maxx + pad, maxy + pad)))
        g = g[~g.geometry.is_empty]

        # Unsimplified per-class geometry in degrees, for the consistency check
        # against the notebook's rule (its sjoin ran in EPSG:4326).
        raw_deg = {
            c: unary_union(list(g.loc[g.hazard_class == c, "geometry"]))
            for c in (1, 2, 3) if (g.hazard_class == c).any()
        }

        gm = g.to_crs(PROJECTED_CRS)
        dissolved = {}
        for c in (1, 2, 3):
            part = gm.loc[gm.hazard_class == c, "geometry"]
            if len(part):
                dissolved[c] = make_valid(unary_union(list(part))).intersection(district_m)

        # Higher class keeps any overlap (site class = max of containing polygons).
        overlap_m2 = 0.0
        resolved = {}
        for c in (3, 2, 1):
            if c not in dissolved:
                continue
            geom = dissolved[c]
            higher = [resolved[h] for h in resolved if h > c]
            if higher:
                over = unary_union(higher)
                overlap_m2 += geom.intersection(over).area
                geom = geom.difference(over)
            if not geom.is_empty:
                resolved[c] = make_valid(geom)

        out_features, areas = [], {}
        for c in sorted(resolved):
            exact = resolved[c]
            simple = make_valid(exact.simplify(SIMPLIFY_M, preserve_topology=True))
            deg = gpd.GeoSeries([simple], crs=PROJECTED_CRS).to_crs(GEOGRAPHIC_CRS).iloc[0]
            deg = make_valid(set_precision(deg, 10 ** -COORD_DECIMALS))
            # Keep polygon parts only (make_valid can leave stray lines/points).
            if deg.geom_type == "GeometryCollection":
                deg = unary_union([p for p in deg.geoms if p.geom_type in ("Polygon", "MultiPolygon")])
            if deg.is_empty:
                continue
            if not deg.is_valid:
                fail(f"{name} class {c}: invalid geometry after simplification")
            final_m2 = gpd.GeoSeries([deg], crs=GEOGRAPHIC_CRS).to_crs(PROJECTED_CRS).iloc[0].area
            exact_m2 = exact.area
            rel = abs(final_m2 - exact_m2) / exact_m2 if exact_m2 else 0.0
            areas[c] = {"exact_km2": exact_m2 / 1e6, "final_km2": final_m2 / 1e6, "rel_diff": rel}
            if rel > AREA_TOLERANCE:
                fail(f"{name} class {c}: area moved {rel:.2%} (> 1%) after simplification")
            out_features.append({
                "type": "Feature",
                "properties": {"hazard_class": c},
                "geometry": mapping(deg),
            })

        out = {
            "type": "FeatureCollection",
            "name": f"talomo_hazard_{name}",
            "metadata": {
                "source": f"Project NOAH, {shp_name} (class field {field})",
                "classes": {"1": "Low", "2": "Moderate", "3": "High"},
                "clip": "talomo_boundary.json (union of the 14 barangay polygons)",
                "simplify_tolerance_m": SIMPLIFY_M,
                "simplified_in": PROJECTED_CRS,
                "coordinate_decimals": COORD_DECIMALS,
                "overlaps": "higher class kept where classes overlapped",
            },
            "features": out_features,
        }
        path = DATA / f"talomo_hazard_{name}.json"
        text = json.dumps(out, separators=(",", ":"))
        path.write_text(text, encoding="utf-8")
        size = path.stat().st_size

        # Consistency check: the published overlay against the class each site
        # was scored with, read (a) at the exact grid point the notebook
        # sampled, and (b) at the 4-decimal point candidate_sites.json exports.
        # (a) is the real test; (b) is reported because the export's rounding
        # moves a point by up to ~8 m, which can cross a fragmented hazard edge.
        published = {f["properties"]["hazard_class"]: shape(f["geometry"]) for f in out_features}
        mismatches, exported_mismatches = [], []
        for s, (elon, elat) in zip(sites, exact_points):
            want = int(s["hazards"][key])
            got = class_of_point(Point(elon, elat), published)
            if got != want:
                mismatches.append({"site_id": s["site_id"], "site_class": want,
                                   "overlay_class": got,
                                   "source_at_point": class_of_point(Point(elon, elat), raw_deg)})
            got_exported = class_of_point(Point(s["longitude"], s["latitude"]), published)
            if got_exported != want:
                exported_mismatches.append(s["site_id"])

        report[name] = {"file": path.name, "bytes": size, "areas": areas,
                        "overlap_removed_km2": overlap_m2 / 1e6,
                        "mismatches_at_grid_point": mismatches,
                        "mismatches_at_exported_point": exported_mismatches}

        print(f"\n{name}: {path.name}  {size:,} bytes ({size / 1e6:.2f} MB)")
        if size > SIZE_WARN_BYTES:
            print(f"  NOTE: over {SIZE_WARN_BYTES / 1e6:.0f} MB. Consider PMTiles for this layer.")
        print(f"  overlap between classes resolved to the higher class: {overlap_m2 / 1e6:.6f} km²")
        for c, a in areas.items():
            print(f"  class {c} ({LABEL[c]:8s}) unsimplified {a['exact_km2']:.6f} km²   "
                  f"published {a['final_km2']:.6f} km²   diff {a['rel_diff']:.4%}")
        print(f"  site consistency at the exact grid point: "
              f"{len(sites) - len(mismatches)} / {len(sites)} sites match")
        for m in mismatches:
            print(f"    {m['site_id']}: site {m['site_class']}, overlay {m['overlay_class']}, "
                  f"unsimplified source at that point {m['source_at_point']}")
        print(f"  at the exported 4-decimal point: {len(sites) - len(exported_mismatches)} "
              f"/ {len(sites)} match ({len(exported_mismatches)} differ only because "
              f"the export rounds coordinates)")

    # The exact grid points, for the test that repeats the consistency check.
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps({
        "note": "Exact candidate-grid points (EPSG:4326) rebuilt from the 250 m "
                "lattice; candidate_sites.json rounds coordinates to 4 decimals. "
                "Written by scripts/build_hazard_layers.py.",
        "points": {s["site_id"]: [round(a, 7), round(b, 7)]
                   for s, (a, b) in zip(sites, exact_points)},
    }, separators=(",", ":")), encoding="utf-8")

    (ROOT.parent / "test_evidence").mkdir(exist_ok=True)
    (ROOT.parent / "test_evidence" / "hazard_build_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

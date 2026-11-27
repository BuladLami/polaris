"""Build one map tile per candidate site: the 250 m grid cell the site stands for.

    python scripts/build_site_tiles.py            # from polaris/
    (needs geopandas, shapely >= 2, pyproj)

Reads   public/data/candidate_sites.json   site ids and coordinates
        public/data/talomo_boundary.json   the district polygon the pipeline wrote
Writes  public/data/talomo_site_tiles.json one Polygon per site, properties {site_id}

No score, class or any other site value is written: the app joins each tile to
its site by `site_id` and colours it from the site record, so the tiles can never
disagree with the scores.

How the tiles are made
----------------------
The pipeline (POLARIS_model.ipynb, Cell 5) lays its grid in EPSG:32651
(WGS 84 / UTM 51N) as

    x = minx + 125 + 250 i,   y = miny + 125 + 250 j

where (minx, miny) is the lower-left corner of the district polygon's bounding
box in that CRS. This script rebuilds that lattice from the same polygon:

1. Each site's exported coordinate (rounded to 4 decimals, so up to ~8 m off) is
   projected to EPSG:32651 and snapped to its lattice index (i, j). The script
   stops if any site is more than 25 m from a lattice point or two sites snap to
   the same cell.
2. The cell is the square [minx + 250 i, minx + 250 (i+1)] x [miny + 250 j,
   miny + 250 (j+1)], i.e. +/-125 m around the grid point. Corners come from
   integer indices, so neighbouring cells share bit-identical corners: no gaps,
   no overlaps.
3. Cells are clipped to the district polygon, so tiles stop at the district
   boundary and the coast instead of spilling into the sea or the next district.
4. Vertices are reprojected to EPSG:4326 with one transformer and rounded to
   7 decimals (~1 cm). A shared corner therefore stays shared after
   reprojection and rounding.

The script then re-reads what it wrote and checks: one tile per site and one
site per tile, every site point inside its own tile, and no two tiles
overlapping by more than 1 m^2. It prints the areas so the edge treatment can be
reported.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import Point, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import transform, unary_union

GRID_SPACING_M = 250.0
HALF = GRID_SPACING_M / 2
METRIC_CRS = "EPSG:32651"
GEOGRAPHIC_CRS = "EPSG:4326"
SNAP_TOLERANCE_M = 25.0
DECIMALS = 7

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
SITES = DATA / "candidate_sites.json"
BOUNDARY = DATA / "talomo_boundary.json"
OUT = DATA / "talomo_site_tiles.json"

to_metric = Transformer.from_crs(GEOGRAPHIC_CRS, METRIC_CRS, always_xy=True)
to_geographic = Transformer.from_crs(METRIC_CRS, GEOGRAPHIC_CRS, always_xy=True)


def fail(msg: str) -> None:
    sys.exit(f"build_site_tiles: {msg}")


def round_coords(geom):
    """Round every vertex to DECIMALS places (a shared vertex rounds identically)."""
    return transform(lambda x, y, z=None: (np.round(x, DECIMALS), np.round(y, DECIMALS)), geom)


def main() -> None:
    dataset = json.loads(SITES.read_text(encoding="utf-8"))
    sites = dataset["sites"]
    spacing = dataset.get("metadata", {}).get("grid_spacing_m", GRID_SPACING_M)
    if spacing != GRID_SPACING_M:
        fail(f"dataset grid spacing is {spacing} m, this script builds {GRID_SPACING_M} m cells")

    boundary_fc = json.loads(BOUNDARY.read_text(encoding="utf-8"))
    district_geo = unary_union([shape(f["geometry"]) for f in boundary_fc["features"]])
    district = transform(to_metric.transform, district_geo)
    minx, miny, _, _ = district.bounds

    # 1. Snap every site to its lattice index.
    lon = np.array([s["longitude"] for s in sites], dtype=float)
    lat = np.array([s["latitude"] for s in sites], dtype=float)
    x, y = to_metric.transform(lon, lat)
    i = np.round((x - (minx + HALF)) / GRID_SPACING_M).astype(int)
    j = np.round((y - (miny + HALF)) / GRID_SPACING_M).astype(int)
    gx = minx + HALF + GRID_SPACING_M * i
    gy = miny + HALF + GRID_SPACING_M * j
    offset = np.hypot(x - gx, y - gy)
    if offset.max() > SNAP_TOLERANCE_M:
        worst = int(offset.argmax())
        fail(f"{sites[worst]['site_id']} is {offset.max():.1f} m from the nearest grid point")
    if len(set(zip(i.tolist(), j.tolist()))) != len(sites):
        fail("two sites snap to the same grid cell")

    # 2-4. Square cell, clipped to the district, reprojected, rounded.
    features = []
    clipped = 0
    cell_area = GRID_SPACING_M ** 2
    metric_tiles = []
    for s, ii, jj in zip(sites, i.tolist(), j.tolist()):
        x0 = minx + GRID_SPACING_M * ii
        y0 = miny + GRID_SPACING_M * jj
        cell = box(x0, y0, x0 + GRID_SPACING_M, y0 + GRID_SPACING_M)
        tile = cell.intersection(district)
        if tile.is_empty:
            fail(f"{s['site_id']}'s cell does not touch the district")
        if tile.geom_type not in ("Polygon", "MultiPolygon"):
            # A clip can leave stray line or point slivers; keep only the area.
            tile = unary_union([g for g in getattr(tile, "geoms", [tile])
                                if g.geom_type in ("Polygon", "MultiPolygon")])
        if abs(tile.area - cell_area) > 1e-6:
            clipped += 1
        metric_tiles.append(tile)
        geo = round_coords(transform(to_geographic.transform, tile))
        if geo.geom_type == "Polygon":
            geo = orient(geo, sign=1.0)  # RFC 7946: exterior ring counter-clockwise
        else:
            geo = type(geo)([orient(p, sign=1.0) for p in geo.geoms])
        features.append({"type": "Feature", "properties": {"site_id": s["site_id"]},
                         "geometry": mapping(geo)})

    out = {
        "type": "FeatureCollection",
        "polaris": {
            "description": "The 250 m grid cell each candidate site stands for. "
                           "Join to candidate_sites.json on site_id.",
            "cell_size_m": GRID_SPACING_M,
            "construction_crs": METRIC_CRS,
            "output_crs": GEOGRAPHIC_CRS,
            "edges": "cells clipped to the district boundary (talomo_boundary.json)",
            "coordinate_decimals": DECIMALS,
            "sites": len(features),
            "source_generated_at": dataset.get("metadata", {}).get("generated_at"),
            "generated_by": "scripts/build_site_tiles.py",
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        },
        "features": features,
    }
    text = json.dumps(out, separators=(",", ":"))
    # mapping() yields tuples; json writes them as arrays. Round-trip to be sure.
    OUT.write_text(text, encoding="utf-8")

    # ---- Verify what was written -------------------------------------------
    written = json.loads(OUT.read_text(encoding="utf-8"))["features"]
    ids = [f["properties"]["site_id"] for f in written]
    site_ids = [s["site_id"] for s in sites]
    if sorted(ids) != sorted(site_ids) or len(set(ids)) != len(ids):
        fail("written tiles do not map one-to-one onto the sites")

    back = [transform(to_metric.transform, shape(f["geometry"])) for f in written]
    by_id = dict(zip(ids, back))
    outside = [s["site_id"] for s in sites
               if not by_id[s["site_id"]].buffer(1e-6).contains(
                   Point(*to_metric.transform(s["longitude"], s["latitude"])))]
    tree = STRtree(back)
    worst_overlap = 0.0
    for k, g in enumerate(back):
        for n in tree.query(g):
            if n > k:
                worst_overlap = max(worst_overlap, g.intersection(back[n]).area)
    if worst_overlap > 1.0:
        fail(f"tiles overlap by up to {worst_overlap:.3f} m²")

    union = unary_union(back)
    # No gap between tiles: the union has no interior holes, and every piece of
    # the district left uncovered reaches the district's outer edge.
    parts = list(getattr(union, "geoms", [union]))
    holes = sum(len(p.interiors) for p in parts)
    rest = district.difference(union)
    rest_parts = [p for p in getattr(rest, "geoms", [rest]) if p.area > 1e-6]
    inland = [p for p in rest_parts if not p.intersects(district.exterior.buffer(0.01))]
    if holes or inland:
        fail(f"gap between tiles: {holes} hole(s) in the tile union, "
             f"{len(inland)} uncovered piece(s) away from the district edge")
    district_area = district.area
    cells_area = len(sites) * cell_area
    tiles_area = sum(g.area for g in back)
    uncovered = district.difference(union).area
    spill = cells_area - sum(t.area for t in metric_tiles)

    print(f"Wrote {OUT.relative_to(ROOT)} — {OUT.stat().st_size / 1024:.0f} KB, {len(written)} tiles")
    print(f"  lattice origin (EPSG:32651)     : x0 = {minx + HALF:.3f}, y0 = {miny + HALF:.3f}")
    print(f"  snap offset of exported points  : max {offset.max():.2f} m (4-decimal rounding)")
    print(f"  full squares                    : {len(sites) - clipped}")
    print(f"  clipped at the district edge    : {clipped}")
    print(f"  district area                   : {district_area / 1e6:.3f} km²")
    print(f"  area of all tiles               : {tiles_area / 1e6:.3f} km²")
    print(f"  square area cut off by the clip : {spill / 1e6:.3f} km²")
    print(f"  district not covered by a tile  : {uncovered / 1e6:.3f} km² "
          f"(edge strips whose nearest grid point lies outside the district)")
    print(f"  largest overlap between tiles   : {worst_overlap:.6f} m²")
    print(f"  holes in the tile union         : {holes}; tile union parts: {len(parts)}")
    print(f"  site points outside own tile    : {len(outside)} {outside[:5]}")
    if outside:
        fail("some site points fall outside their own tile")


if __name__ == "__main__":
    main()

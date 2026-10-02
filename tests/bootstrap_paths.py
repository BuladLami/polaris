"""Section 1 deliverable: resolve every artifact path and derive expected values.

Writes validation/paths.json and validation/expected_values.json.

Expected values are read from candidate_sites.json metadata and the weights
manifest ONLY. Nothing here is transcribed from the manuscript; manuscript
figures are loaded separately (manuscript_sync_report.txt) and compared, never
used as an expectation.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def sha256(p: Path) -> str | None:
    if not p.is_file():
        return None
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def entry(rel: str) -> dict:
    p = ROOT / rel
    exists = p.exists()
    return {
        "path": rel.replace("\\", "/"),
        "status": "PRESENT" if exists else "ABSENT",
        "bytes": p.stat().st_size if p.is_file() else None,
    }


CANDIDATES = {
    # deployed + pipeline copies of the dataset
    "dataset_deployed": "polaris/public/data/candidate_sites.json",
    "dataset_master": "outputs_district/candidate_sites.json",
    "dataset_webapp_staging": "outputs_district/webapp/candidate_sites.json",
    "dataset_build": "polaris/build/data/candidate_sites.json",
    "dataset_legacy": "polaris/data/legacy/candidate_sites.legacy.json",
    # model
    "model_hazard_integrated": "outputs_district/model/polaris_rf.joblib",
    "model_best_params": "outputs_district/model/best_params.json",
    "model_service_only_ablation": "outputs_district/model/polaris_rf_service_only.joblib",
    # training data
    "feature_matrix": "outputs_district/polaris_site_scores.csv",
    "normalization_params_legacy": "polaris/data/legacy/normalization_params.json",
    # pipeline source
    "pipeline_notebook": "POLARIS_model.ipynb",
    "pipeline_script": "polaris.py",
    # geo layers consumed by the app
    "geo_boundary": "polaris/public/data/talomo_boundary.json",
    "geo_barangays": "polaris/public/data/talomo_barangays.json",
    "geo_coastline": "polaris/public/data/talomo_coastline.json",
    "geo_facilities": "polaris/public/data/talomo_facilities.json",
    # raw spatial inputs
    "osm_extract_shp_dir": "updated osm/philippines-260729-free.shp",
    "osm_extract_pbf": "updated osm/philippines-260729.osm.pbf",
    "osm_extract_second_snapshot": "updated osm/SECOND_SNAPSHOT",
    "noah_flood": "data/noah/flood",
    "noah_landslide": "data/noah/landslide",
    "noah_storm_surge": "data/noah/storm_surge",
    "psa_popcen_raw": "data/psa/popcen.csv",
    # derived reference artifacts
    "weights_manifest": "outputs_district/weights_manifest.json",
    "formula_register": "outputs_district/formula_register.csv",
    "model_evaluation_metrics": "outputs_district/model_evaluation_metrics.csv",
    "objective_c_comparison": "outputs_district/objective_c_comparison.csv",
    "internal_sensitivity_summary": "outputs_district/internal_sensitivity_summary.json",
    "tier3_external_checks": "outputs_district/tier3_external_checks.json",
    "population_proxy_validation": "outputs_district/population_proxy_validation.csv",
    "barangay_resolution": "outputs_district/barangay_resolution.csv",
    "manuscript_sync_report": "outputs_district/manuscript_sync_report.txt",
    # app + build chain
    "frontend_src": "polaris/src",
    "package_json": "polaris/package.json",
    "script_migrate_sites": "polaris/scripts/migrate-sites.mjs",
    "script_fetch_geodata": "polaris/scripts/fetch-geodata.mjs",
}


def main() -> None:
    paths = {k: entry(v) for k, v in CANDIDATES.items()}

    ds = ROOT / CANDIDATES["dataset_deployed"]
    for key in ("dataset_deployed", "dataset_master", "dataset_webapp_staging",
                "dataset_build", "dataset_legacy"):
        paths[key]["sha256"] = sha256(ROOT / CANDIDATES[key])

    data = json.loads(ds.read_text(encoding="utf-8"))
    md = data["metadata"]

    out_dir = ROOT / "validation"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "paths.json").write_text(
        json.dumps({"root": str(ROOT), "artifacts": paths}, indent=2), encoding="utf-8"
    )

    # ---- expected values, derived from artifact metadata only ----------------
    wm = json.loads((ROOT / CANDIDATES["weights_manifest"]).read_text(encoding="utf-8"))
    dc = md["dataset_clarification"]

    expected = {
        "_source": "candidate_sites.json:metadata + weights_manifest.json",
        "_warning": "Do not populate from the manuscript. Manuscript figures are "
                    "compared against these, never substituted for them.",
        "dataset_sha256": paths["dataset_deployed"]["sha256"],
        "n_sites": dc["training_candidate_sites"],
        "n_sites_metadata_key": "dataset_clarification.training_candidate_sites",
        "n_sites_key_absent": "n_sites" not in md,
        "thresholds": md["thresholds"],
        "weights_service": md["weights"]["service"],
        "weights_hazard_penalty": md["weights"]["hazard_penalty"],
        "weights_manifest_service": wm["service_weights"],
        "weights_manifest_hazard": wm["hazard_penalty_weights"],
        "shoreline_buffer_m": md["shoreline_buffer_m"],
        "top_n_recommendations": md["top_n_recommendations"],
        "grid_spacing_m": md["grid_spacing_m"],
        "building_density_radius_m": md["building_density_radius_m"],
        "district_area_km2": md["district_area_km2"],
        "n_shoreline_excluded": dc["shoreline_excluded_sites"],
        "n_high_hazard_excluded": md["high_hazard_excluded_sites"],
        "n_eligible": md["eligible_sites"],
        "n_ineligible_union": dc["training_candidate_sites"] - md["eligible_sites"],
        "suitability_class_counts": md["suitability_class_counts"],
        "hazard_class_distributions": md["hazard_class_distributions"],
        "barangays": md["barangays"],
        "n_barangays": len(md["barangays"]),
        "barangay_site_counts": md["barangay_site_counts"],
        "osm_snapshot_date": md["osm_snapshot_date"],
        "osm_record_counts": md["osm_record_counts"],
        "raw_osm_records_extracted": dc["raw_osm_records_extracted"],
        "model_detail": md["model_detail"],
        "random_state": wm["random_state"],
        "validation_metrics": md["validation"],
        "feature_importances": md["feature_importances"],
        "permutation_importances": md["permutation_importances"],
        "feature_order": [
            "building_density", "road_accessibility", "facility_distance",
            "flood_susceptibility", "landslide_susceptibility",
            "storm_surge_susceptibility",
        ],
        "feature_order_evidence": "model.feature_importances_ matches "
                                  "metadata.feature_importances elementwise to 0.0",
    }
    (out_dir / "expected_values.json").write_text(
        json.dumps(expected, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"wrote {out_dir/'paths.json'}")
    print(f"wrote {out_dir/'expected_values.json'}")
    absent = [k for k, v in paths.items() if v["status"] == "ABSENT"]
    print(f"\nABSENT ({len(absent)}): " + ", ".join(absent))


if __name__ == "__main__":
    main()

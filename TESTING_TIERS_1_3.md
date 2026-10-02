# POLARIS — Tier 1–3 Validation Execution Guide

Instructions for Claude Code operating inside the POLARIS repository. This document
covers **Tier 1 (System Integrity)**, **Tier 2 (Model Accuracy and Ablation)**, and
**Tier 3 (External Validity)** only. Tiers 4 and 5 require human participants and are
out of scope for this file.

---

## 0. Operating rules

These are binding. Violating any of them invalidates the run.

1. **Never fabricate a result.** If a check cannot be executed — missing artifact,
   missing data source, unavailable dependency — write `PENDING` with the specific
   blocker. Do not substitute an estimate, an interpolation, or a plausible-looking
   number.
2. **Never modify the pipeline to make a test pass.** If a test fails, report the
   failure and the diagnosis. Correction is a separate, explicitly authorised task.
3. **Read values from artifacts, not from prose.** All expected counts, weights and
   thresholds must be read from `candidate_sites.json` metadata or the pipeline
   constants, never transcribed from the manuscript. Where an artifact and the
   manuscript disagree, record the discrepancy in the report under
   `MANUSCRIPT MISMATCH` and do not resolve it silently.
4. **Determinism.** Fix `random_state` / seeds wherever a test involves sampling,
   splitting, or permutation. Record the seed in the report.
5. **Every numeric result must be machine-written**, not hand-copied. Tests emit JSON;
   the report is generated from that JSON.
6. **Report units and precision consistently.** Scores on the normalized `[0, 1]`
   scale to 4 decimal places; percentages to 1 decimal place; correlation coefficients
   to 4 decimal places.

---

## 1. Repository reconnaissance (run first)

Do not assume paths. Establish the following and write them to
`validation/paths.json` before running any test.

```
- Deployed dataset:        candidate_sites.json (locate; note byte size and record count)
- Dataset metadata block:  weights w1..w6, thresholds tau1/tau2/tau3, provenance counts,
                           OSM snapshot date, model metrics
- Trained model artifact:  Random Forest .joblib / .pkl (hazard-integrated)
- Ablation model artifact: service-only variant, if exported
- Pipeline source:         polaris.py and/or POLARIS_model.ipynb
- Raw spatial inputs:      NOAH flood/landslide/storm-surge shapefiles, OSM extract,
                           district boundary, PSA POPCEN table
- Frontend source root:    React/Vite app directory
- Existing test setup:     package.json scripts, any vitest/playwright/pytest config
```

Report anything absent. **The Tier 1 model inference check and all of Tier 2 cannot
run without the trained model artifact and the training feature matrix** — if either is
missing, stop and say so rather than approximating from the exported scores.

---

## 2. Test harness

Recommended stack — install only what is missing:

| Layer | Tool | Scope |
|---|---|---|
| Python integrity / model / spatial | `pytest` + `numpy`, `pandas`, `scikit-learn`, `geopandas`, `shapely`, `scipy` | T1.1, T1.2, T1.5, all of T2, all of T3 |
| Frontend unit / component | `vitest` + `@testing-library/react` | T1.3 (pure logic: filtering, sorting, classification, interpretation text) |
| End-to-end | `playwright` | T1.3 (UI-bound cases), T1.4 |

Rationale: the substantive checks are numerical and belong in Python next to the
pipeline; only the state-propagation and input-validation cases genuinely need a
browser. Do not put arithmetic assertions in Playwright.

### Directory layout to create

```
tests/
  tier1/
    test_inference_parity.py
    test_eligibility_gates.py
    test_ranked_output.py
    test_interpretation_layer.py
    unit/            # vitest
    e2e/             # playwright
  tier2/
    test_intrinsic_performance.py
    test_equation_verification.py
    test_cross_validation.py
    test_reconstruction_fidelity.py
    test_hazard_ablation.py
  tier3/
    test_facility_concordance.py
    test_population_proxy_validation.py
    test_osm_completeness.py
    test_coverage_improvement.py
  fixtures/
  conftest.py
validation/
  paths.json
  expected_values.json      # derived from dataset metadata, NOT from the manuscript
  results/                  # one JSON per test
  reports/
    TIER1_REPORT.md
    TIER2_REPORT.md
    TIER3_REPORT.md
    VALIDATION_SUMMARY.md
```

Each test writes `validation/results/<test_id>.json` with at minimum:

```json
{
  "test_id": "T1.2",
  "name": "Eligibility gate verification",
  "status": "PASS | FAIL | PENDING",
  "seed": 42,
  "executed_at": "ISO-8601",
  "inputs": {"dataset_sha256": "...", "osm_snapshot": "..."},
  "metrics": {},
  "criterion": "stated acceptance criterion",
  "notes": []
}
```

---

## 3. Tier 1 — System Integrity Testing

Verifies that the deployed application computes what it claims to compute, independent
of whether the scoring framework is substantively correct.

### T1.1 — Model inference verification

**Procedure.** Draw a stratified sample of candidate sites spanning the full range of
attribute combinations: high-hazard, low-hazard, high building density, low building
density, and at least 5 sites from each of the four suitability classes. Re-run the
trained Random Forest against those sites' feature vectors in the Python environment.
Compare prediction against the value stored in `candidate_sites.json`.

**Acceptance.** Max absolute deviation ≤ **±0.001** on the normalized score. Any
exceedance is an export-pipeline defect, not a model defect — report it as such.

**Emit.** `n_sampled`, `max_abs_dev`, `mean_abs_dev`, `n_exceeding_tolerance`, and the
site IDs of any exceedances.

**Note for the report.** State explicitly that this stratification serves export
integrity only and is procedurally distinct from the Tier 2 stratified cross-validation.
The panel raised this; the distinction must appear in the report text.

### T1.2 — Eligibility gate verification

Two gates, verified independently of the scoring pipeline.

**Shoreline setback.** Re-execute the 50 m exclusion geometry against the raw candidate
grid using the OSM coastline. Compare the resulting site set against the dataset's
recorded shoreline-excluded set.

**High hazard.** Every site with ordinal class 3 on any of the three hazard layers must
carry `recommendation_eligible = false`.

**Shortlist integrity.** No ineligible site may appear in any top-N recommendation list.
Verify by set membership against the eligible population. Confirm specifically whether
the global highest-scoring site is ineligible and, if so, that it is absent from the
recommendation output.

**Acceptance.** Exact set equality on both gates; zero ineligible sites in any shortlist.
Counts must match dataset metadata exactly — report computed vs. recorded side by side.

**Emit.** `n_shoreline_excluded`, `n_high_hazard_excluded`, `n_ineligible_union`,
`set_equality_shoreline`, `set_equality_hazard`, `n_ineligible_in_shortlist`,
`global_top_site_eligible`.

### T1.3 — Functional testing

Each sub-case below is a distinct test with its own result record.

**T1.3a Recommendation Mode input handling.** Map point placement and manual coordinate
entry both retrieve the correct candidate subset. Validate Haversine filtering against
independently computed distances for ≥10 reference points. Boundary conditions: radius
yielding zero candidates; maximum 5,000 m radius; coordinates at study-area edges.
Field validation: radius constrained to 100–5,000 m, shortlist size to 1–10, each with
its own error message. Clear control returns scope to full district extent. Invariant:
any change to a search input discards the previous shortlist.

**T1.3b Withheld-sites summary.** Shoreline and hazard exclusion counts reported
separately, and summing correctly against the in-radius total.

**T1.3c Barangay finder.** Option list derived from scored sites (every offered barangay
must contain results). Selecting an entry recentres on that barangay's site centroid
without altering the search query. **Regression watch:** confirm barangay assignment is
varied — a prior run labelled all sites "Talomo Proper", indicating a point-in-polygon
regression. Assert `n_distinct_barangays == 14`.

**T1.3d Evaluation Mode location resolution.** Both input mechanisms resolve to the
nearest candidate site. Edge cases: coordinates outside the district; coordinates in
coastal/aquatic areas; coordinates near the boundary. Confirm the 1,000 m rejection
threshold and the 250 m coverage warning behave as specified.

**T1.3e Suitability Interpretation Layer output.** For a stratified sample spanning all
four suitability classes, both gate conditions, and all hazard exposure levels, assert:
the factors named as principal drivers correspond to that site's own normalized factor
values and raw distances; no interpretation asserts a contribution contradicted by the
underlying data; the text is internally consistent with the displayed score,
classification and recommendation level; every ineligible site states its exclusion
reason explicitly. Additionally assert the **terminology constraint** — user-facing
strings must not contain: *composite, normalized, proxy, inverse distance, penalty,
feature engineering, lattice*. Implement as a lexical scan over all generated
interpretation strings and static UI copy.

**T1.3f Ranked output consistency.** Regenerate reference rankings in Python for
identical candidate subsets and compare against the application's output. This covers
sorting logic, eligibility filtering, threshold application (τ₁=0.25, τ₂=0.40, τ₃=0.60 —
read from metadata, do not hardcode), intra-class percentile computation, and score
rendering.

**Acceptance.** All sub-cases pass. Report failures individually; do not aggregate into
a single pass/fail.

### T1.4 — Integration testing (Playwright)

Trace these end-to-end workflows and verify state propagates across component
boundaries, and that mode-independent state is genuinely independent:

1. Read score guide on welcome screen, then enter a mode.
2. Define geographic scope in Recommendation Mode → review ranked output and
   interpretations.
3. Open site detail dialog from the map, and separately from the result card.
4. Switch to Evaluation Mode — verify the discard dialog behaves correctly both when
   work exists and when it does not.
5. Resolve a location by map click, and separately by coordinate entry.
6. Examine site profile including individual spatial and hazard factor values.

### T1.5 — Dataset and build integrity

- `candidate_sites.json` record count matches metadata `n_sites`.
- No `NaN`, `null`, or out-of-range `[0,1]` values in any score field.
- Schema conformance: every record carries the full expected field set.
- **Build-chain guard:** assert that `npm run data:build` does not invoke any migration
  or transform script that rewrites the model export. Grep the build chain for
  `migrate-sites` and any script writing to the dataset path. This is a known failure
  mode — a migration script previously overwrote a genuine model export silently.
- Record the dataset SHA-256 in every Tier 1–3 result record so results are traceable
  to a specific dataset state.

---

## 4. Tier 2 — Model Accuracy and Ablation Validation

Quantifies how faithfully the Random Forest reproduces its training target. **State in
the report preamble:** because the training target is a deterministic function of the
same features supplied as inputs, high R² establishes fidelity to the specification, not
correctness of the specification. Do not let the report imply otherwise.

### T2.1 — Intrinsic model performance

Evaluate the hazard-integrated model on the held-out 20% test partition: MAE, RMSE, R²,
plus the out-of-bag R². Evaluate the service-only ablation variant identically, for
internal comparison only.

**Also compute and report the RMSE-to-MAE ratio.** A substantial divergence indicates
error concentrated in a minority of poorly approximated sites rather than distributed
evenly — expected at the extremes of the score range.

**Also report the held-out vs. OOB agreement** as an indication of whether performance
is an artifact of the particular split.

**Also run the OLS baseline** on the same partition and report its R² alongside. If OLS
outperforms the Random Forest, that is a genuine finding and must be reported as such —
do not omit it, reframe it, or bury it.

**Emit.** `mae`, `rmse`, `r2`, `oob_r2`, `rmse_mae_ratio`, `ols_r2`, `n_test`,
`test_split_seed`.

### T2.2 — Equation verification

Two equations stated in the Mathematical Formalization section are executed internally
by scikit-learn rather than written out in the pipeline: the **ensemble mean** and the
**variance-minimising split criterion**. Verify both against the fitted model rather
than assuming them:

- Ensemble mean: for a sample of sites, compute the mean of individual tree predictions
  via `estimators_` and assert equality with `model.predict()` to within floating-point
  tolerance.
- Split criterion: assert `model.criterion == 'squared_error'` and, for a sample of
  internal nodes, verify the recorded impurity decrease is consistent with the
  variance-reduction definition.

### T2.3 — Stratified cross-validation

Five-fold cross-validation stratified by suitability class. Stratification is required
because the Highly Suitable class is sparsely populated and an unstratified partition
risks under-representing it in individual folds — verify and report the per-fold class
composition to demonstrate this.

Report mean and standard deviation of MAE, RMSE, R² across folds. Low standard deviation
indicates stable generalization.

**Emit.** Per-fold metrics, mean, std, and per-fold class counts.

### T2.4 — Baseline score reconstruction fidelity

For every site in the full dataset, compute `|ŷᵢ − S'(i)|` between the model's predicted
score and the rescaled baseline composite score. Report the full distribution
(min, median, mean, p95, p99, max) and the **proportion of sites with deviation > 0.05**
on the normalized scale, which is the indicator of systematic prediction drift.

### T2.5 — Internal hazard sensitivity ablation

Apply all five measures to the full candidate set, comparing the hazard-integrated
configuration against the service-only ablation variant:

| Measure | Symbol | Notes |
|---|---|---|
| Mean suitability score deviation | Δ̄ | |
| Spearman rank correlation | ρ | |
| Top-N Jaccard similarity | J(N) | N ∈ {5, 10, 20, 50} |
| Classification change percentage | C | |
| Spatial difference mapping | Δᵢ | per-site; emit for Figure 9 |

Report the gate counts **separately** from these measures, not combined into a single
figure — the gates operate outside this comparison and are categorically more
consequential.

For J(N): note that the index over successively larger nested top-N sets is **not
required to increase**. A non-monotonic value is a compositional property, not an
inconsistency — flag it in the report so it is not misread as an error.

For Δᵢ: the diagnostic question is whether displacement is concentrated in contiguous
identifiable exposed zones (hazard acting locally) or distributed diffusely across the
district (a district-wide level shift). Emit per-site coordinates and Δᵢ so the spatial
difference map can be generated.

**This ablation is an internal research procedure only.** Assert that no ablation
output, and no two-configuration comparison, is reachable from the deployed UI.

---

## 5. Tier 3 — External Validity Verification

Four checks. Whether the scores correspond to independently observable spatial
conditions.

### T3.1 — Existing facility concordance

Match health facilities from the OSM extract (hospitals, clinics, barangay health
stations) to their nearest candidate site. Report: total facilities in extract, number
falling inside the district boundary, and the classification-tier distribution of their
matched sites.

**Interpretation is prescribed in advance and must be reproduced in the report.**
Existing facilities are **not** treated as validated ground truth; no claim is made that
their locations are optimal. Neither CHO nor CPDO has confirmed the existing
distribution as a normative benchmark. They are a *revealed planning preference*.

If concordance is low, state the two structural explanations before any interpretive
claim: (a) facility distance enters the composite as a positive suitability term, so an
existing facility's own location is by construction a zero-coverage-gap point and is
penalised on that term — the check cannot in principle reward the framework for rating
highly a location where a facility already stands; (b) any additional structural factor
identified during the run, stated explicitly.

**Emit.** `n_facilities_extract`, `n_facilities_in_district`, tier counts,
`pct_upper_two_tiers`, and the per-facility match table.

### T3.2 — Population proxy validation against PSA census

Aggregate building footprint counts by point-in-polygon test within each barangay
boundary, so no footprint is counted more than once. Join to PSA POPCEN figures using
**the same name normaliser used to resolve the barangay boundaries** — do not write a
second normaliser, or the two will diverge.

Report **four separate statistics**, not a single summary: Pearson r, Spearman ρ, mean
absolute proportional deviation, and signed bias. Document the direction and magnitude
of systematic bias — prior work using two-dimensional building measures reports
underestimation in dense areas and overestimation in sparse areas; state whether this
run reproduces that direction.

If the census source is unavailable at run time, report `PENDING`. Do not substitute.

### T3.3 — OpenStreetMap completeness sensitivity

Requires a **second OSM extract taken at a later date and clipped to the identical
district polygon**. If that second extract does not exist in the repository, this check
is `PENDING` — say so and stop; do not simulate it.

If available: compute the change in building count within the sampling radius at each
site (magnitude of effect), and the Spearman rank correlation between the two runs
(whether ordering is more robust than magnitudes). Record both snapshot dates.

Expected finding: increases are predominantly digitisation of existing structures rather
than new construction, and rank agreement remains high. Report this as a genuine finding,
not a defect.

### T3.4 — Population coverage metric validation

Identify the top-20 highest-ranked **eligible** candidate sites. Generate 2 km and 5 km
buffers around them and around the current facility configuration; intersect both with
the building footprint layer serving as the demand proxy.

```
%Coverage = (demand points within n-km buffer / total demand points) × 100
ΔCoverage = %Coverage_POLARIS − %Coverage_Current
```

Report at both radii. **If the measure saturates** (both configurations near 100%),
report it as a limitation of the measure and not as evidence that no coverage deficit
exists. State the reason: buffers are Euclidean and the demand layer is the footprint
proxy, so the check measures straight-line proximity to a mapped structure rather than
a resident's ability to reach a facility. The documented Talomo North deficit is a
travel-time deficit against the DOH 30-minute standard, which a straight-line buffer
cannot detect in a district where facilities are already spaced below 2 km. A near-zero
result is a null result on a Euclidean measure, not a finding that recommendations
would not improve access.

---

## 6. Execution order

```
1. Repository reconnaissance          → validation/paths.json
2. Build expected_values.json from dataset metadata (not from prose)
3. T1.5 dataset & build integrity     (gates everything downstream)
4. T1.1, T1.2                          (Python)
5. T1.3 unit/component                 (vitest)
6. T1.3 UI-bound cases, T1.4           (playwright)
7. T2.1 → T2.5                         (Python)
8. T3.1 → T3.4                         (Python)
9. Generate reports
```

If T1.5 or T1.2 fails, **halt and report** — downstream results computed against a
corrupted dataset are meaningless.

---

## 7. Reporting

Generate four files from the JSON results. Do not hand-write numbers into them.

**`validation/reports/TIER{1,2,3}_REPORT.md`** — per tier, one section per test with:
test ID, name, status, acceptance criterion, obtained values, seed, dataset SHA-256, and
any notes. Failures include the diagnosis but not a fix.

**`validation/reports/VALIDATION_SUMMARY.md`** — a single table:

| Test ID | Tier | Check | Status | Key metric | Criterion | Met |
|---|---|---|---|---|---|---|

Followed by three explicit lists:
- **Failures** — with diagnosis.
- **Pending** — with the specific blocker for each.
- **Manuscript mismatches** — every case where an artifact value differs from the value
  stated in the manuscript, given as `manuscript value | computed value | source of
  computed value`. Do not resolve these; they require a decision.

### Manuscript-facing output

Additionally emit `validation/reports/manuscript_values.md`: a flat list of every
number this run produces that appears in, or belongs in, the Results and Discussion
chapter, formatted to the manuscript's precision conventions, so values can be
transferred without retyping. Tag each as `CONFIRMED` (reproduces the currently written
value), `CHANGED` (differs — manuscript needs updating), or `NEW` (not yet written).

---

## 8. Known traps in this repository

Check for each; they have occurred before.

- **Barangay assignment regression.** An earlier export labelled every site "Talomo
  Proper". Assert 14 distinct barangays and a plausible distribution.
- **Migration script overwriting the model export.** `migrate-sites.mjs` was once wired
  into `npm run data:build`. Confirm it is not in the build chain.
- **Hardcoded output paths.** Scripts that write to a path independent of their
  configured filename. Grep for literal `outputs/` paths after any rename.
- **Stale dataset.** Always record and compare the dataset SHA-256; a passing test
  against yesterday's export is not a passing test.

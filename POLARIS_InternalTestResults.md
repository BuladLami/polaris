# POLARIS — Internal Test Results

**Project:** POLARIS: A GIS-Based Decision Support Framework for Optimum Health Facility Site Selection with Hazard Risk Sensitivity Analysis
**Source test plan:** `POLARIS_InternalTestCases.docx` (69 cases: UT-001–026, IT-001–022, ST-001–021)
**Test dates:** 02–03 October 2026
**Prepared for:** Castada, Daniell Marie G.; Sanguenza, Carl Stephen S.

## Environment

| Item | Value |
|---|---|
| Repository commit | `816264e` (app code under `polaris/` is identical to `93ae048`; the only difference is `polaris/CLAUDE.md` removed from tracking) |
| Browser | Google Chrome 154.0.0.0, Windows 11 Pro (10.0.26200) |
| Runtime | Node 24.18.0, Vite 7.3.6; `tsc` typecheck clean |
| Unit / integration (UI) | Dev server `npm run dev` → http://localhost:3000; functions called by dynamic `import()` from the page console |
| System tests | Local production build (`vite build`) served by `vite preview` → http://localhost:4173. The deployed Vercel URL was **not** tested. |
| Python checks | Python 3.12, scikit-learn 1.6.1, joblib (`.venv-validation`) |

### Deviations from the written procedure

1. **IT-002 / IT-003 / IT-004:** editing `public/data/` in place was blocked by the session's safety policy. Instead, a copy of `public/` was served from a scratch folder by a second Vite instance (port 3001), and the fault was injected into the copy. The project's data files were never modified.
2. **Input entry:** for most UI cases, field values were set via the DOM (native value setter + `input` event, which is the same path React uses for typing). Buttons, map clicks and header controls were real clicks, except where noted.
3. **IT-011:** the Colab notebook isn't available locally, so a proxy check was run instead (see the case).
4. During part of the system tests the Chrome window was hidden. Visual checks for ST-018 and ST-020 and the map click in ST-004 were still pending when this report was written (see Status).

## Summary

| Level | Total | Pass | Fail | Blocked | Partial | Not executed |
|---|---|---|---|---|---|---|
| Unit (UT) | 26 | 26 | 0 | 0 | 0 | 0 |
| Integration (IT) | 22 | 19 | 2 | 1 | 0 | 0 |
| System (ST) | 21 | 18 | 0 | 0 | 2 | 1 |
| **Total** | **69** | **63** | **2** | **1** | **2** | **1** |

## Defects found

| ID | Severity | Found in | Description | Location |
|---|---|---|---|---|
| D-01 | Medium | IT-009, ST-017 | The site details dialog says "N buildings within **500 m**" and the "Buildings nearby" hint says "within 500 m of the site", but the pipeline radius (`building_density_radius_m`) is **300 m**, and the interpretation text in the same dialog says 300 m. The label is hard-coded. | `polaris/src/components/SiteDetailsDialog.tsx:125`, `polaris/src/lib/suitability.ts:141` (also the comment at `polaris/src/types/polaris.ts:31`). Evidence: `test_evidence/IT-009_buildings_nearby_500m.png` |
| D-02 | Low | IT-003 | With `candidate_sites.json` missing, the Vite dev and preview servers return the SPA `index.html` with HTTP 200, not a 404. The loader only checks `res.ok`, so the error screen shows a raw parse error (`Unexpected token '<', "<!doctype "... is not valid JSON`) instead of "Failed to load candidate_sites.json (HTTP 404)". On Vercel, `/data/` is excluded from the rewrite, so a real 404 would show the expected message (confirmed with a simulated 404). | `polaris/src/lib/dataset.ts:41-49`. Evidence: `test_evidence/IT-003_missing_dataset_dev.jpg` |
| D-03 | Low | ST-012 | The empty-radius panel contradicts itself: "0 sites fall inside the 100 m radius, **but every one is ruled out** — either too close to the shoreline or too hazardous", then "No site inside this radius had to be ruled out". | Recommendations panel copy |

## Observations (not counted as failures)

- **O-1:** If **Reload the data** fails after data has already loaded, the error is dropped silently: `loadError` is only rendered when `!bundle` (`polaris/src/App.tsx:225`), and the old data stays on screen with no message.
- **O-2:** A map click made during the ~1.5 s fly-to animation after a search is ignored. Clicking after the animation works (seen in IT-015).
- **O-3:** With an invalid "Sites to show" value, the button label still follows the input ("Find the top 11 sites"; with 0 it reads "Find the top 1 site"). Validation then rejects the value correctly.
- **O-4:** The road-accessibility reading can read oddly. For example, TALOMO_0618 shows "0.137 is a low number, so the site is quite far from the nearest road… The nearest road is about 15 m away." This happens because normalisation is relative to the district.
- **O-5:** The "Loading POLARIS" screen was too brief to capture against the local build. The text exists at `polaris/src/components/StatusScreens.tsx:11`.
- **O-6:** ST-002's precondition (a search in Recommend **and** an evaluation in Evaluate at the same time) can't be reached, because switching modes clears the other mode. The home control was tested from each mode separately.
- **O-7:** The browser console reader didn't capture `console.warn`. The IT-004 warning was confirmed by wrapping `console.warn` and calling `reloadBundle()`.

## Results — Unit Testing

| ID | Test case | Actual result | Status |
|---|---|---|---|
| UT-001 | parseShortlistSize accepts 1–10 | '1','3','10' → `{valid:true,value:1/3/10}` | Pass |
| UT-002 | parseShortlistSize rejects out-of-range / non-numbers | '0','11','abc','' → `{valid:false,value:3}` each | Pass |
| UT-003 | parseCoordinates | `{lat:7.073,lon:125.5666}`; `null`; `null` | Pass |
| UT-004 | validateRadius 100–5,000 m | 100, 5000 → `null`; 99, 5001, NaN → "Enter a search radius between 100 and 5,000 metres." | Pass |
| UT-005 | Missing coordinate | "Enter a valid latitude and longitude, or click the map." | Pass |
| UT-006 | Outside district bounds | "That point is outside Talomo District. Pick a location inside the district." | Pass |
| UT-007 | > 1,000 m from any site | Expected offshore message returned; nearest site 1,795.0 m | Pass |
| UT-008 | Valid point | `null` | Pass |
| UT-009 | Rank + summary (500 m, top 3) | TALOMO_0765 #1 (0.8228), 0725 #2 (0.4422), 0726 #3 (0.424); `{inRadius:10, shorelineExcluded:0, hazardExcluded:1}` | Pass |
| UT-010 | Gated top-scorer withheld | ranked = [TALOMO_0616]; 0618 (0.9036, storm surge 3) absent; `{7,0,6}` | Pass |
| UT-011 | Shoreline vs hazard tallies | TALOMO_0028, TALOMO_0111; `{9,4,3}` | Pass |
| UT-012 | Cap at n | n=1 → [0765]; n=10 → 0765, 1137, 1179, 0924, 0599, 0979, 1016, 0464, 0513, 0773, non-increasing; `{997,8,201}` | Pass |
| UT-013 | zoomForRadius | 16, 14.6, 14.6, 13.4 | Pass |
| UT-014 | haversineM | 0; 111,194.93 m | Pass |
| UT-015 | findNearestSite | `null`; TALOMO_0041 @ 554.59 m; TALOMO_0765 @ 172.32 m | Pass |
| UT-016 | sitesWithinRadius boundary | 100 m → []; d = 172.32 m → [TALOMO_0765]; 500 m → 10 | Pass |
| UT-017 | boundsOfSites / isInsideBounds | `null`; `{west:125.4919, south:7.019, east:125.6141, north:7.1409}`; false (pad 0), true (pad 0.01) | Pass |
| UT-018 | isInsideGeometry | true, false, false, true, false, false | Pass |
| UT-019 | thresholdsOf / shorelineBufferOf | defaults `{0.25,0.4,0.6}` and 50; custom `{0.3,0.5,0.7}` and 75 | Pass |
| UT-020 | classRange | '0.60 and above', '0.40 – 0.60', '0.25 – 0.40', 'below 0.25' | Pass |
| UT-021 | isShorelineExcluded | 49.9 → true; 50 → false; null → false | Pass |
| UT-022 | ineligibilityReason | 0530 → "…18 m…"; 0618 → "High storm surge risk"; 0001 → "…10 m…"; 0765 → null; copy → "High flood and storm surge risk" | Pass |
| UT-023 | describeRoadAccessibility | All four readings as expected; 0.007 text ends "…about 214 m away." | Pass |
| UT-024 | describeNormalized | Low, Moderate, Moderate, High | Pass |
| UT-025 | formatMetres / formatScore | '999 m', '1.00 km', '2.53 km', '—'; '0.823', '0.904' | Pass |
| UT-026 | scoreGuidePoints(1,10) | 4 points with the expected titles; 4th body contains "anywhere from 1 to 10 sites" | Pass |

## Results — Integration Testing

| ID | Test case | Actual result | Status |
|---|---|---|---|
| IT-001 | Data fetched once | Resource timing: exactly one request each for candidate_sites, talomo_boundary, talomo_coastline, talomo_facilities; none added on Recommend → Evaluate | Pass |
| IT-002 | Malformed dataset | "Could not load the site data" + "candidate_sites.json is not in the expected format. Expected an object with `metadata`, `top_recommendations` and `sites`…" + "Try again" (served from scratch copy, deviation 1) | Pass |
| IT-003 | Missing dataset | Error screen and "Try again" shown, but the message was `Unexpected token '<', "<!doctype "... is not valid JSON` because the server returned index.html (HTTP 200). A simulated 404 gives "Failed to load candidate_sites.json (HTTP 404)". See D-02. | **Fail** |
| IT-004 | Missing optional layer | Welcome screen and map load normally; `[POLARIS] optional layer "talomo_coastline.json" unavailable` emitted (O-7). The server returned the HTML fallback, not 404; same code path. | Pass |
| IT-005 | Reload with cache-bust | 4 new requests, each ending `?t=1790945890208`; app returned to normal | Pass |
| IT-006 | Barangay finder | Placeholder "Search 14 barangays…"; 14 listed; counts sum to 1,502 | Pass |
| IT-007 | Facilities clipped | Console: "[POLARIS] facilities layer: showing 49 of 190 (dropped 141 outside Talomo)"; layer on by default | Pass |
| IT-008 | Metadata seeds UI | Sites to show = 3; legend "50 m shoreline buffer" / "16 sites ruled out"; ranges 0.60 and above, 0.40 – 0.60, 0.25 – 0.40, below 0.25 | Pass |
| IT-009 | Building-count radius | Manifest = 300 m; interpretation says "153 within 300 m", but the dialog line says "153 buildings within **500 m**" and the hint says "within 500 m of the site". See D-01. | **Fail** |
| IT-010 | Export = manifest | Service 0.40/0.25/0.15, hazard 0.08/0.07/0.05, thresholds 0.25/0.40/0.60, buffer 50: all equal | Pass |
| IT-011 | RF predictions ±0.001 | Notebook not available (Colab). Proxy: `polaris_rf.joblib` (RandomForestRegressor, 6 features, no feature names) on the exported 4-dp `factors_normalized` in feature_importance.csv order → 19/20 within 0.001; TALOMO_0171 off by 0.0011 (consistent with input rounding). | **Blocked** |
| IT-012 | Eligibility vs gates | 0 mismatches; 0 ineligible with level ≠ 0; 16 shoreline, 272 High-hazard, 275 ineligible; top_recommendations [0765, 1137, 1179] all eligible | Pass |
| IT-013 | Class / level vs thresholds | 0 class mismatches, 0 level violations, all scores in [0, 1] | Pass |
| IT-014 | Search updates panel + map | "Top 3 recommended", "All 10 sites inside the radius were ranked…", cards 0765/0725/0726; 500 m ring and markers 1–3 on the same sites; button became "Clear search and reset map" | Pass |
| IT-015 | Map click sets centre | Fields 7.067563 / 125.580346; results removed; "No search yet". First click during fly-to ignored (O-2). | Pass |
| IT-016 | Input change discards results | After radius, size and latitude changes: results and numbered markers removed, "No search yet" each time | Pass |
| IT-017 | Barangay jump | Map flew to Ma-a; coordinates, radius and results unchanged | Pass |
| IT-018 | Evaluate on map click | Fields 7.068081 / 125.541434; result (TALOMO_0672, 0.221) shown without pressing the button | Pass |
| IT-019 | Coverage warning > 250 m | 555 m point shows the expected warning; 172 m point shows none | Pass |
| IT-020 | Same site from all entry points | Card, marker 1, and Evaluate breakdown all show TALOMO_0765, 0.823, Highly Suitable | Pass |
| IT-021 | Confirm only when work exists | "Switch to Evaluate?" dialog; Stay keeps results; Clear and switch → "No location evaluated yet"; empty switch has no dialog | Pass |
| IT-022 | Theme remembered | localStorage light → dark; `<html class="dark">` only when dark; kept after reload | Pass |

## Results — System Testing (local production build, http://localhost:4173)

| ID | Test case | Actual result | Status |
|---|---|---|---|
| ST-001 | Open and enter a mode | Welcome shows "1,502 possible sites" and the four guide points before any site score; "Open the map" only after a card is chosen; Recommend opens with map and panel. Loading screen too brief to observe (O-5). | Pass |
| ST-002 | Home control | From each mode, POLARIS name → welcome; re-entering shows "No search yet" and "No location evaluated yet" (O-6) | Pass |
| ST-003 | Search defaults | 1 TALOMO_0765 0.823 Highly; 2 0725 0.442 Moderately; 3 0726 0.424 Moderately, with interpretations; ruled out 1 at High risk | Pass |
| ST-004 | Map click after barangay jump | Barangay selected, but the map click didn't register while the browser window was hidden | Not executed |
| ST-005 | Gated top-scorer withheld | "Top 1 recommended", TALOMO_0616 0.606; "All 7 sites…"; ruled out 6 High risk; 0618 not listed | Pass |
| ST-006 | Shoreline + hazard reported | "Top 2 recommended" 0028 0.398, 0111 0.344; ruled out 4 shoreline, 3 High risk | Pass |
| ST-007 | Max radius and size | Button "Find the top 10 sites"; "Top 10 recommended"; "All 997 sites…"; first three 0765, 1137, 1179; ruled out 8 shoreline, 201 High | Pass |
| ST-008 | Missing coordinate | No results; "Enter a valid latitude and longitude, or click the map." | Pass |
| ST-009 | Radius 99 / 5001 | No results; radius message for both | Pass |
| ST-010 | Size 0 / 11 | No results; "Enter how many sites to show, between 1 and 10." for both (O-3) | Pass |
| ST-011 | Outside / offshore | Both expected messages shown | Pass |
| ST-012 | Empty radius | "No usable sites in this area", 0 sites inside the 100 m radius (copy issue D-03) | Pass |
| ST-013 | Evaluate eligible point | TALOMO_0765, Matina Pangi, 0 m; 0.823 / 1.000; Highly Suitable; interpretation; Full breakdown; no warning | Pass |
| ST-014 | Never-recommended site | TALOMO_0618, Bucana, 0.904, Highly Suitable; "Cannot be recommended. High storm surge risk. POLARIS will never put this location on a recommendation list, however high its score." | Pass |
| ST-015 | Far point | Resolves to TALOMO_0041 with the 555 m guide warning | Pass |
| ST-016 | Invalid locations | No result; all three expected messages | Pass |
| ST-017 | Full breakdown | TALOMO_0618, Bucana, 7.063800, 125.602800, 0.904, interpretation, "Never recommended" + "High storm surge risk", buildings 1.000, road 0.137 with reading. Also shows the D-01 "within 500 m" label. | Pass |
| ST-018 | Legend layer toggles | Defaults: sites off, buffer off, facilities on; all three toggle correctly. Colour-coding and grey buffer sites still to be confirmed visually. | Partial |
| ST-019 | Info dialogs | "What the scores mean" and "Where the data comes from" both open and close | Pass |
| ST-020 | Theme switch | Toggle twice: `dark` class and dark panel colours applied, then light restored. Map colours still to be confirmed visually. | Partial |
| ST-021 | Mode switch mid-task | "Switch to Evaluate?" shown; Clear and switch → Evaluate with "No location evaluated yet" | Pass |

## Evidence files

`test_evidence/IT-009_buildings_nearby_500m.png`, `test_evidence/IT-002_malformed_dataset.jpg`, `test_evidence/IT-003_missing_dataset_dev.jpg`

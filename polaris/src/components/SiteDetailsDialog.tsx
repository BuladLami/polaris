import { Ban, MapPin, Quote, ShieldAlert, Waves } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CompositeScore,
  FactorRow,
  RecommendationLevel,
} from "@/components/ScoreDisplay";
import {
  buildingRadiusOf,
  describeRoadAccessibility,
  formatMetres,
  HAZARD_KEYS,
  HAZARD_LABEL,
  HAZARD_LEVEL_LABEL,
  HAZARD_LEVEL_TONE,
  ineligibilityReason,
  isShorelineExcluded,
  SERVICE_FACTOR_LABEL,
  serviceFactorHints,
  shorelineBufferOf,
  thresholdsOf,
} from "@/lib/suitability";
import type { DatasetMetadata, RankBand, Site } from "@/types/polaris";

/**
 * Plain readings of the site's rank in the district. Both compare the site with
 * the other scored sites, which is what the band measures, and the pipeline
 * writes the interpretation from the same bands.
 */
const BUILT_UP_READING: Record<RankBand, string> = {
  top_quartile:
    "More buildings here than at most sites in the district, so there are likely many residents nearby to serve.",
  upper_middle:
    "More buildings here than at the typical site, though not among the busiest quarter of the district.",
  lower_middle:
    "Fewer buildings here than at the typical site, so there are probably fewer residents nearby to serve.",
  bottom_quartile:
    "Among the fewest buildings in the district, so there are probably few residents nearby to serve.",
};

const FACILITY_GAP_READING: Record<RankBand, string> = {
  top_quartile: "Farther from an existing health facility than most sites in the district.",
  upper_middle: "Farther from an existing health facility than the typical site.",
  lower_middle: "Closer to an existing health facility than the typical site.",
  bottom_quartile:
    "Closer to an existing health facility than most sites in the district, so a new one here would add less.",
};

const UNDERSERVED_READING =
  "At 1 km or more from the nearest one, this area counts as underserved.";

function facilityReading(rank: NonNullable<Site["rank_bands"]>["facility_distance"]) {
  const reading = FACILITY_GAP_READING[rank.band];
  return rank.underserved ? `${reading} ${UNDERSERVED_READING}` : reading;
}

export function SiteDetailsDialog({
  site,
  metadata,
  recommendationRank,
  onOpenChange,
}: {
  site: Site | null;
  metadata: DatasetMetadata | null;
  recommendationRank?: number;
  onOpenChange: (open: boolean) => void;
}) {
  const bufferM = shorelineBufferOf(metadata);
  const buildingRadiusM = buildingRadiusOf(metadata);
  const hints = serviceFactorHints(buildingRadiusM);
  const thresholds = thresholdsOf(metadata);
  const ranks = site?.rank_bands;

  return (
    <Dialog open={site !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {site && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{site.site_id}</DialogTitle>
                {recommendationRank !== undefined && (
                  <Badge className="bg-suit-high text-white">
                    Recommendation #{recommendationRank}
                  </Badge>
                )}
              </div>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" />
                  {site.barangay ?? "Barangay unknown"}
                </span>
                <span className="tabular">
                  {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
                </span>
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-5">
              {/* -- The headline: one composite score -- */}
              <CompositeScore
                score={site.score}
                suitabilityClass={site.suitability_class}
                thresholds={thresholds}
                size="lg"
              />

              <RecommendationLevel
                level={site.recommendation_level}
                label={site.recommendation_label}
                className="text-sm"
              />

              {/* -- Panel revision #3: textual interpretation -- */}
              <section className="bg-muted/50 rounded-lg border p-3">
                <h3 className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase">
                  <Quote className="size-3" />
                  What this score means
                </h3>
                <p className="text-sm leading-relaxed">{site.interpretation}</p>
              </section>

              <EligibilityNotice site={site} bufferM={bufferM} />

              <Separator />

              {/* -- Supporting detail -- */}
              <section>
                <h3 className="text-muted-foreground mb-1 text-xs font-semibold tracking-widest uppercase">
                  What went into the score
                </h3>
                <p className="text-muted-foreground mb-2 text-xs">
                  Each of these is rated from 0 to 1 as well, and higher is
                  better — the same direction as the score above. They explain
                  the score; they do not replace it.
                </p>

                <div className="divide-y">
                  <FactorRow
                    label={SERVICE_FACTOR_LABEL.building_density}
                    normalized={site.factors_normalized.building_density}
                    raw={`${site.factors.building_density.toLocaleString()} buildings within ${buildingRadiusM} m`}
                    hint={hints.building_density}
                    reading={
                      ranks && BUILT_UP_READING[ranks.building_density.band]
                    }
                  />
                  <FactorRow
                    label={SERVICE_FACTOR_LABEL.road_accessibility}
                    normalized={site.factors_normalized.road_accessibility}
                    raw={formatMetres(site.factors.road_distance_m)}
                    hint={hints.road_accessibility}
                    reading={describeRoadAccessibility(
                      site.factors_normalized.road_accessibility,
                      site.factors.road_distance_m,
                      ranks?.road_accessibility.band,
                    )}
                  />
                  <FactorRow
                    label={SERVICE_FACTOR_LABEL.facility_distance}
                    normalized={site.factors_normalized.facility_distance}
                    raw={formatMetres(site.factors.facility_distance_m)}
                    hint={hints.facility_distance}
                    reading={ranks && facilityReading(ranks.facility_distance)}
                  />
                </div>
              </section>

              <Separator />

              {/* -- Hazards -- */}
              <section className="space-y-2">
                <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase">
                  <ShieldAlert className="size-3" />
                  Hazard risk
                </h3>
                <p className="text-muted-foreground text-xs">
                  Already subtracted from the score above — there is no separate
                  hazard-free figure to compare against.
                </p>

                <ul className="grid gap-2 sm:grid-cols-3">
                  {HAZARD_KEYS.map((key) => {
                    const level = site.hazards[key];
                    return (
                      <li key={key} className="bg-muted/40 rounded-lg border p-2.5">
                        <p className="text-muted-foreground text-[11px] leading-tight">
                          {HAZARD_LABEL[key]}
                        </p>
                        <p
                          className={`mt-0.5 text-sm font-bold ${HAZARD_LEVEL_TONE[level]}`}
                        >
                          {HAZARD_LEVEL_LABEL[level]}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* -- Shoreline -- */}
              <section className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
                <Waves className="text-primary mt-0.5 size-3.5 shrink-0" />
                <p>
                  {site.factors.shoreline_distance_m === null ? (
                    <>Distance from the shoreline is unknown for this site.</>
                  ) : (
                    <>
                      <strong className="text-foreground">
                        {formatMetres(site.factors.shoreline_distance_m)}
                      </strong>{" "}
                      from the shoreline
                      {isShorelineExcluded(site, bufferM)
                        ? ` — closer than the ${bufferM} m minimum, so this site is ruled out.`
                        : ` — clear of the ${bufferM} m minimum.`}
                    </>
                  )}
                </p>
              </section>
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EligibilityNotice({ site, bufferM }: { site: Site; bufferM: number }) {
  if (site.recommendation_eligible) return null;
  const reason = ineligibilityReason(site, bufferM);

  return (
    <div className="border-destructive/50 bg-destructive/10 flex items-start gap-2.5 rounded-lg border-l-2 p-3">
      <Ban className="text-destructive mt-0.5 size-4 shrink-0" />
      <div>
        <p className="text-destructive text-sm font-semibold">
          Never recommended
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
          {reason ?? "This site breaks one of the safety rules"}. A site that
          breaks a safety rule is always kept off the recommendation list,
          however high it scores.
        </p>
      </div>
    </div>
  );
}

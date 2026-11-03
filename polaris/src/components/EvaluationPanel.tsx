import { ChevronRight, Crosshair, Info, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CompositeScore, RecommendationLevel } from "@/components/ScoreDisplay";
import { EmptyState } from "@/components/RecommendationsPanel";
import {
  formatMetres,
  ineligibilityReason,
  shorelineBufferOf,
  thresholdsOf,
} from "@/lib/suitability";
import type { DatasetMetadata, EvaluationResult } from "@/types/polaris";

export function EvaluationPanel({
  result,
  metadata,
  onOpenDetails,
}: {
  result: EvaluationResult | null;
  metadata: DatasetMetadata | null;
  onOpenDetails: (siteId: string) => void;
}) {
  if (!result) {
    return (
      <EmptyState
        icon={<Crosshair className="size-5" />}
        title="No location evaluated yet"
        body="Click a point on the map, or enter coordinates above, then press Evaluate. You will get one suitability score and a written explanation of what makes it good or bad."
      />
    );
  }

  const { site } = result;
  const bufferM = shorelineBufferOf(metadata);
  const thresholds = thresholdsOf(metadata);
  const reason = ineligibilityReason(site, bufferM);

  return (
    <div className="animate-rise-in space-y-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold">Evaluation result</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          This is the score of the nearest site POLARIS has already scored,{" "}
          <span className="font-medium">{site.site_id}</span>, in{" "}
          {site.barangay ?? "an unknown barangay"} —{" "}
          {formatMetres(result.distanceM)} from the point you clicked.
        </p>
      </header>

      {result.outsideCoverage && (
        <p className="border-suit-low/60 bg-suit-low/10 flex items-start gap-2 rounded-lg border-l-2 p-2.5 text-xs leading-relaxed">
          <TriangleAlert className="text-suit-low mt-px size-3.5 shrink-0" />
          <span>
            The nearest scored site is {formatMetres(result.distanceM)} away, so
            treat this score as a guide to the surrounding area rather than to
            that exact point.
          </span>
        </p>
      )}

      <CompositeScore
        score={site.score}
        suitabilityClass={site.suitability_class}
        thresholds={thresholds}
      />

      <RecommendationLevel
        level={site.recommendation_level}
        label={site.recommendation_label}
      />

      <section className="bg-muted/50 rounded-lg border p-3">
        <h3 className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase">
          <Info className="size-3" />
          What this means
        </h3>
        <p className="text-sm leading-relaxed">{site.interpretation}</p>
      </section>

      {!site.recommendation_eligible && reason && (
        <p className="border-destructive/50 bg-destructive/10 rounded-lg border-l-2 p-2.5 text-xs leading-relaxed">
          <strong className="text-destructive">Cannot be recommended.</strong>{" "}
          {reason}. POLARIS will never put this location on a recommendation
          list, however high its score.
        </p>
      )}

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => onOpenDetails(site.site_id)}
      >
        Full breakdown
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

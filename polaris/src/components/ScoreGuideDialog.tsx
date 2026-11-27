import { Compass, Route, ShieldAlert, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SuitabilityBadge } from "@/components/ScoreDisplay";
import { MAX_TOP_N, MIN_TOP_N } from "@/lib/search";
import {
  BUILDING_DENSITY_NOTE,
  classRange,
  DEFAULT_THRESHOLDS,
  scoreGuidePoints,
  SUITABILITY_CLASSES,
  thresholdsOf,
  type Thresholds,
} from "@/lib/suitability";
import type { DatasetMetadata } from "@/types/polaris";

const POINT_ICONS = [Compass, Route, ShieldAlert, Trophy];

/**
 * Panel revision #5 — the upfront, standalone explanation of how to read a
 * suitability score. Reachable at any time from the header, and shown on the
 * welcome screen before the user ever sees a number.
 */
export function ScoreGuideDialog({
  open,
  onOpenChange,
  metadata,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: DatasetMetadata | null;
}) {
  const thresholds = thresholdsOf(metadata);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>What the scores mean</DialogTitle>
          <DialogDescription>
            Read this once and every number in POLARIS will make sense.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <ScoreGuideBody thresholds={thresholds} />

          {/* The dataset ships its own guide, written for the manuscript. It
              says nothing the plain guide above does not, and it is dense, so
              it stays folded away rather than being the first thing read. */}
          {metadata?.score_guide && (
            <details className="group">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold tracking-widest uppercase">
                The technical version, for those who want it
              </summary>
              <p className="text-muted-foreground bg-muted/50 mt-2 rounded-lg border p-3 text-xs leading-relaxed">
                {metadata.score_guide}
              </p>
            </details>
          )}

          {metadata?.advisory_note && (
            <p className="border-primary/40 bg-primary/5 rounded-lg border-l-2 p-3 text-xs leading-relaxed">
              <strong>A reminder.</strong> {metadata.advisory_note}
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/** The guide itself, reused inline on the welcome screen. */
export function ScoreGuideBody({
  thresholds = DEFAULT_THRESHOLDS,
  compact = false,
}: {
  thresholds?: Thresholds;
  compact?: boolean;
}) {
  return (
    <div className="space-y-5">
      <ul className="grid gap-3 sm:grid-cols-2">
        {scoreGuidePoints(MIN_TOP_N, MAX_TOP_N).map((point, i) => {
          const Icon = POINT_ICONS[i] ?? Compass;
          return (
            <li
              key={point.title}
              className="bg-muted/40 flex gap-3 rounded-lg border p-3"
            >
              <span className="bg-primary/10 text-primary grid size-8 shrink-0 place-items-center rounded-md">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm leading-snug font-semibold">{point.title}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {point.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {!compact && (
        <section className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Score ranges per class
          </h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-muted-foreground text-left text-xs">
                  <th className="px-3 py-2 font-semibold">Class</th>
                  <th className="px-3 py-2 font-semibold">Score</th>
                  <th className="px-3 py-2 font-semibold">What it means</th>
                </tr>
              </thead>
              <tbody>
                {SUITABILITY_CLASSES.map((cls) => (
                  <tr key={cls} className="border-t">
                    <td className="px-3 py-2">
                      <SuitabilityBadge suitabilityClass={cls} />
                    </td>
                    <td className="tabular px-3 py-2 text-xs whitespace-nowrap">
                      {classRange(cls, thresholds)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs">
                      {CLASS_MEANING[cls]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Callout title="Buildings, not people">{BUILDING_DENSITY_NOTE}</Callout>

      <Callout title="What a value like 0.007 is telling you">
        The smaller values listed under each site work the same way as the main
        score: closer to 1 is good, closer to 0 is bad. For road access in
        particular, a value near <strong>0</strong> means the site is among the{" "}
        <strong>farthest</strong> from any road, so it would be{" "}
        <strong>hard to reach</strong>. A value near <strong>1</strong> means it
        sits right beside a road. So 0.007 is a warning sign, not a tiny
        rounding error.
      </Callout>
    </div>
  );
}

const CLASS_MEANING: Record<string, string> = {
  "Highly Suitable":
    "A strong choice — plenty of people nearby, easy to reach, far from the health facilities that already exist, and low risk.",
  Suitable:
    "Usable, but something about it is weak. Compare it with the better-rated spots before you decide.",
  "Low Suitability":
    "Weak in several ways, or fairly risky. Only choose this if you have no option outside the area.",
  "Not Suitable":
    "Poor on the things that matter most, and/or too risky to build on.",
};

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-primary/40 bg-primary/5 rounded-lg border-l-2 p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {children}
      </p>
    </div>
  );
}

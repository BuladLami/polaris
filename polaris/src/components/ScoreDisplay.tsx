import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CLASS_COLOR_VAR,
  classRange,
  DEFAULT_THRESHOLDS,
  formatScore,
  type Thresholds,
} from "@/lib/suitability";
import type { SuitabilityClass } from "@/types/polaris";

/* ------------------------------------------------------------------ */

export function SuitabilityBadge({
  suitabilityClass,
  className,
  showRange = false,
  thresholds = DEFAULT_THRESHOLDS,
}: {
  suitabilityClass: SuitabilityClass;
  className?: string;
  showRange?: boolean;
  thresholds?: Thresholds;
}) {
  const color = `var(${CLASS_COLOR_VAR[suitabilityClass]})`;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 border-current/30 font-semibold", className)}
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {suitabilityClass}
      {showRange && (
        <span className="opacity-70">({classRange(suitabilityClass, thresholds)})</span>
      )}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The composite score, rendered as the single headline number plus a 0→1
 * track. Panel revision #3: the score leads, individual factors are supporting
 * detail — and revision #5: the 0/1 direction is stated on the control itself,
 * not left to the methodology chapter.
 */
export function CompositeScore({
  score,
  suitabilityClass,
  thresholds = DEFAULT_THRESHOLDS,
  size = "default",
  className,
}: {
  score: number;
  suitabilityClass: SuitabilityClass;
  thresholds?: Thresholds;
  size?: "default" | "lg";
  className?: string;
}) {
  const color = `var(${CLASS_COLOR_VAR[suitabilityClass]})`;
  const pct = Math.max(0, Math.min(1, score)) * 100;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "tabular font-bold tracking-tight tabular-nums",
              size === "lg" ? "text-5xl" : "text-3xl",
            )}
            style={{ color }}
          >
            {formatScore(score)}
          </span>
          <span className="text-muted-foreground text-sm font-medium">/ 1.000</span>
        </div>
        <SuitabilityBadge suitabilityClass={suitabilityClass} />
      </div>

      <div className="space-y-1">
        <div className="bg-muted relative h-2 overflow-hidden rounded-full">
          {/* Threshold ticks so the class boundaries are readable in place. */}
          {[thresholds.tau1, thresholds.tau2, thresholds.tau3].map((t) => (
            <span
              key={t}
              className="bg-background/70 absolute top-0 h-full w-px"
              style={{ left: `${t * 100}%` }}
              aria-hidden
            />
          ))}
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <div className="text-muted-foreground flex justify-between text-[10px] font-medium">
          <span>0 — least suitable</span>
          <span>1 — most suitable</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** The dataset's five-level recommendation, shown beside the score and class. */
export function RecommendationLevel({
  level,
  label,
  className,
}: {
  level: number;
  label?: string;
  className?: string;
}) {
  return (
    <p className={cn("text-xs leading-relaxed", className)}>
      <span className="text-muted-foreground">Recommendation level:</span>{" "}
      <span className="font-semibold">
        {level} of 4{label ? ` · ${label}` : ""}
      </span>
    </p>
  );
}

/* ------------------------------------------------------------------ */

/** A labelled 0–1 factor value with its plain-language reading. */
export function FactorRow({
  label,
  normalized,
  raw,
  hint,
  reading,
}: {
  label: string;
  normalized: number;
  raw?: string;
  hint?: string;
  reading?: string;
}) {
  const pct = Math.max(0, Math.min(1, normalized)) * 100;

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{label}</span>
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                  aria-label={`About ${label}`}
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          {raw && <span className="text-muted-foreground text-xs">{raw}</span>}
          <span className="tabular text-sm font-semibold">
            {normalized.toFixed(3)}
          </span>
        </div>
      </div>

      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary/70 h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {reading && (
        <p className="text-muted-foreground text-xs leading-relaxed">{reading}</p>
      )}
    </div>
  );
}

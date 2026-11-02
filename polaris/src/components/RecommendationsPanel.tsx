import { Ban, ChevronRight, MapPinned, SearchX, Trophy, Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SuitabilityBadge } from "@/components/ScoreDisplay";
import { formatMetres, formatScore } from "@/lib/suitability";
import { cn } from "@/lib/utils";
import type { RankedSite, RecommendationSummary } from "@/types/polaris";

export function RecommendationsPanel({
  results,
  summary,
  topN,
  radiusM,
  onSelectSite,
  onFocusSite,
}: {
  results: readonly RankedSite[];
  summary: RecommendationSummary | null;
  topN: number;
  radiusM: number;
  onSelectSite: (siteId: string) => void;
  onFocusSite: (site: RankedSite) => void;
}) {
  if (!summary) {
    return (
      <EmptyState
        icon={<MapPinned className="size-5" />}
        title="No search yet"
        body="Place a search centre on the map and press the button above. POLARIS will rank every site inside the radius and give you the best three."
      />
    );
  }

  if (results.length === 0) {
    // Two different reasons for an empty list: nothing inside the radius at
    // all, or sites inside it that were all ruled out. Only the second has an
    // exclusion breakdown worth showing.
    const noneInside = summary.inRadius === 0;
    const siteCount = `${summary.inRadius.toLocaleString()} site${
      summary.inRadius === 1 ? "" : "s"
    }`;
    return (
      <div className="space-y-3">
        <EmptyState
          icon={<SearchX className="size-5" />}
          title="No usable sites in this area"
          body={
            noneInside
              ? `0 sites fall inside the ${formatMetres(radiusM)} radius — the radius is too small to reach any scored site. Try a larger radius or a different search centre.`
              : `${siteCount} fall${summary.inRadius === 1 ? "s" : ""} inside the ${formatMetres(radiusM)} radius, but every one is ruled out — either too close to the shoreline or too hazardous. Try a larger radius or a different search centre.`
          }
        />
        {!noneInside && <ExclusionSummary summary={summary} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Trophy className="text-suit-high size-4" />
          Top {Math.min(topN, results.length)} recommended
        </h2>
        <span className="text-muted-foreground text-[11px]">
          within {formatMetres(radiusM)}
        </span>
      </header>

      <p className="text-muted-foreground text-xs leading-relaxed">
        All {summary.inRadius.toLocaleString()} sites inside the radius were
        ranked; these scored highest among the ones that were not ruled out. The
        list is capped at {topN} so it stays short enough to review.
      </p>

      <ol className="space-y-2.5">
        {results.map((site, index) => (
          <li
            key={site.site_id}
            className="animate-slide-in"
            style={{
              animationDelay: `${index * 55}ms`,
              animationFillMode: "backwards",
            }}
          >
            <RecommendationCard
              site={site}
              rank={index + 1}
              onOpen={() => onSelectSite(site.site_id)}
              onFocus={() => onFocusSite(site)}
            />
          </li>
        ))}
      </ol>

      <ExclusionSummary summary={summary} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RecommendationCard({
  site,
  rank,
  onOpen,
  onFocus,
}: {
  site: RankedSite;
  rank: number;
  onOpen: () => void;
  onFocus: () => void;
}) {
  return (
    <article
      className={cn(
        "bg-card rounded-xl border p-3 transition-all duration-200",
        "hover:border-primary/40 hover:shadow-md",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="bg-suit-high grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white shadow-sm">
          {rank}
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{site.site_id}</p>
              <p className="text-muted-foreground truncate text-xs">
                {site.barangay ?? "Barangay unknown"} ·{" "}
                {formatMetres(site.distanceFromCentreM)} from centre
              </p>
            </div>
            <span className="tabular text-suit-high shrink-0 text-lg font-bold">
              {formatScore(site.score)}
            </span>
          </div>

          <SuitabilityBadge suitabilityClass={site.suitability_class} />

          <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">
            {site.interpretation}
          </p>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <Button size="sm" variant="secondary" onClick={onOpen}>
              Full breakdown
              <ChevronRight className="size-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={onFocus}>
              <MapPinned className="size-3.5" />
              Show on map
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ExclusionSummary({ summary }: { summary: RecommendationSummary }) {
  const total = summary.shorelineExcluded + summary.hazardExcluded;
  if (total === 0) {
    return (
      <p className="text-muted-foreground bg-muted/40 rounded-lg border p-2.5 text-[11px] leading-relaxed">
        No site inside this radius had to be ruled out — none was too close to
        the shoreline or too hazardous.
      </p>
    );
  }

  return (
    <div className="bg-muted/40 space-y-1.5 rounded-lg border p-2.5">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        Ruled out of this list
      </p>
      {summary.shorelineExcluded > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed">
          <Waves className="text-destructive mt-px size-3 shrink-0" />
          <span>
            <Badge variant="muted" className="tabular mr-1">
              {summary.shorelineExcluded}
            </Badge>
            within 50 m of the shoreline
          </span>
        </p>
      )}
      {summary.hazardExcluded > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed">
          <Ban className="text-destructive mt-px size-3 shrink-0" />
          <span>
            <Badge variant="muted" className="tabular mr-1">
              {summary.hazardExcluded}
            </Badge>
            at High risk of flood, landslide or storm surge
          </span>
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-muted/30 flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
      <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-full">
        {icon}
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
        {body}
      </p>
    </div>
  );
}

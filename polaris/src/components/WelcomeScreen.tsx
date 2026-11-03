import { useState } from "react";
import { ArrowRight, Compass, Crosshair, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScoreGuideBody } from "@/components/ScoreGuideDialog";
import { cn } from "@/lib/utils";
import { thresholdsOf } from "@/lib/suitability";
import type { AppMode, DatasetMetadata } from "@/types/polaris";

const MODE_CARDS: {
  id: AppMode;
  title: string;
  description: string;
  icon: typeof Compass;
}[] = [
  {
    id: "recommendation",
    title: "Recommend sites",
    description:
      "Pick a search area and get the best sites inside it, each with a written explanation of why.",
    icon: Compass,
  },
  {
    id: "evaluation",
    title: "Evaluate a location",
    description:
      "Click any point in the district and read its suitability score and what makes it good or bad.",
    icon: Crosshair,
  },
];

export function WelcomeScreen({
  metadata,
  siteCount,
  onEnter,
}: {
  metadata: DatasetMetadata | null;
  siteCount: number;
  onEnter: (mode: AppMode) => void;
}) {
  const [selected, setSelected] = useState<AppMode | null>(null);
  const thresholds = thresholdsOf(metadata);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-8 px-5 py-10 sm:py-14">
        {/* Masthead */}
        <header className="animate-rise-in flex items-start gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <MapPin className="size-3" />
                {metadata?.study_area ?? "Talomo District, Davao City"}
              </Badge>
            </div>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              POLARIS
            </h1>
            <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base">
              A map-based tool for deciding where to put a new health facility.
              It has already scored{" "}
              <strong className="text-foreground">
                {siteCount.toLocaleString()}
              </strong>{" "}
              possible sites across the district from 0 to 1, so you can see at
              a glance which ones are worth considering.
            </p>
          </div>

          {/* The full lockup, wordmark included. `alt=""` because the heading
              beside it already says POLARIS — announcing it twice is noise.
              Hidden on phones, where the column is too narrow to give it room
              without pushing the score guide below the fold. */}
          <img
            src="/logo-lockup.png"
            alt=""
            width={360}
            height={518}
            className="hidden w-28 shrink-0 rounded-xl border shadow-sm sm:block lg:w-32"
          />
        </header>

        {/* Panel revision #5 — the guide comes BEFORE any number is shown. */}
        <section
          className="animate-rise-in space-y-3"
          style={{ animationDelay: "60ms", animationFillMode: "backwards" }}
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">
              Read this first: what the scores mean
            </h2>
            <p className="text-muted-foreground text-sm">
              Four things worth knowing before you look at any site.
            </p>
          </div>
          <ScoreGuideBody thresholds={thresholds} compact />
        </section>

        {/* Mode choice */}
        <section
          className="animate-rise-in space-y-3"
          style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
        >
          <h2 className="text-lg font-semibold tracking-tight">
            What would you like to do?
          </h2>

          {/* Each card is a wrapper, not a button: the card's own "Open the
              map" action lives inside it, and a button may not nest inside a
              button. The select target and the confirm action are therefore
              siblings, which also means clicking the action never re-toggles
              the card underneath it. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {MODE_CARDS.map(({ id, title, description, icon: Icon }) => {
              const isSelected = selected === id;
              return (
                <div
                  key={id}
                  className={cn(
                    "group flex flex-col rounded-xl border transition-all duration-200",
                    "hover:-translate-y-0.5 hover:shadow-md",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "bg-card hover:border-primary/40",
                  )}
                >
                  {/* Clicking the selected card again clears the choice. */}
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex flex-1 flex-col gap-2 rounded-xl p-4 text-left",
                      "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-lg transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="font-semibold">{title}</span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {description}
                    </span>
                  </button>

                  {isSelected && (
                    <div className="animate-rise-in px-4 pb-4">
                      <Button
                        size="lg"
                        className="w-full"
                        onClick={() => onEnter(id)}
                      >
                        Open the map
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!selected && (
            <p className="text-muted-foreground text-xs">
              Choose one of the two options above to continue.
            </p>
          )}
        </section>

        <footer className="text-muted-foreground border-t pt-5 text-xs leading-relaxed">
          <p>
            {metadata?.advisory_note ??
              "POLARIS is only a guide. The final decision on where to build a health facility still rests with the planning officers."}
          </p>
          <p className="mt-1">
            University of the Immaculate Conception — College of Computer
            Studies, Davao City.
          </p>
        </footer>
      </div>
    </ScrollArea>
  );
}

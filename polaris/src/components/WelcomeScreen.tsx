import { useState } from "react";
import { ArrowLeft, ArrowRight, Compass, Crosshair, MapPin } from "lucide-react";

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

const ADVISORY_FALLBACK =
  "POLARIS is only a guide. The final decision on where to build a health facility still rests with the planning officers.";

/**
 * The way into the app, in two steps so neither is crowded:
 *
 *   1. Landing: what POLARIS is, in one sentence, and "Get started".
 *   2. Before you start: the score guide (panel revision #5, so it still comes
 *      before any number is shown) and the choice of mode, which opens the map.
 */
export function WelcomeScreen({
  metadata,
  siteCount,
  onEnter,
}: {
  metadata: DatasetMetadata | null;
  siteCount: number;
  onEnter: (mode: AppMode) => void;
}) {
  const [step, setStep] = useState<"landing" | "intro">("landing");

  return step === "landing" ? (
    <Landing
      metadata={metadata}
      siteCount={siteCount}
      onGetStarted={() => setStep("intro")}
    />
  ) : (
    <Intro
      metadata={metadata}
      onBack={() => setStep("landing")}
      onEnter={onEnter}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 — landing                                                   */
/* ------------------------------------------------------------------ */

function Landing({
  metadata,
  siteCount,
  onGetStarted,
}: {
  metadata: DatasetMetadata | null;
  siteCount: number;
  onGetStarted: () => void;
}) {
  return (
    <div className="relative flex h-full flex-col overflow-y-auto">
      {/* A soft wash of the brand colour behind the hero, and two faint shapes
          drifting slowly in it, so the page has some life without anything
          extra to read. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="from-primary/10 absolute inset-x-0 top-0 h-[60%] bg-gradient-to-b to-transparent" />
        <div className="animate-drift bg-primary/15 absolute -top-24 left-[12%] size-[26rem] rounded-full blur-3xl" />
        <div
          className="animate-drift bg-facility-ring/10 absolute top-[30%] right-[8%] size-[22rem] rounded-full blur-3xl"
          style={{ animationDelay: "-11s", animationDirection: "alternate-reverse" }}
        />
      </div>

      <main className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="flex max-w-xl flex-col items-center text-center">
          <div className="animate-hero-in relative isolate">
            <div
              aria-hidden
              className="animate-glow bg-primary/40 absolute inset-0 -z-10 rounded-3xl blur-2xl"
            />
            <img
              src="/logo-lockup.png"
              alt=""
              width={360}
              height={518}
              className="animate-float w-24 rounded-2xl border shadow-lg sm:w-28"
            />
          </div>

          <Badge
            variant="secondary"
            className="animate-hero-in mt-6 gap-1.5"
            style={{ animationDelay: "120ms", animationFillMode: "backwards" }}
          >
            <MapPin className="size-3" />
            {metadata?.study_area ?? "Talomo District, Davao City"}
          </Badge>

          <h1
            className="animate-hero-in mt-3 text-4xl font-bold tracking-tight sm:text-5xl"
            style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
          >
            POLARIS
          </h1>

          <p
            className="animate-hero-in text-muted-foreground mt-4 text-base leading-relaxed text-balance sm:text-lg"
            style={{ animationDelay: "280ms", animationFillMode: "backwards" }}
          >
            Find the best places for a new health facility. Every one of{" "}
            <strong className="text-foreground">
              {siteCount.toLocaleString()}
            </strong>{" "}
            possible sites in the district already has a score.
          </p>

          <Button
            size="lg"
            className="animate-hero-in group mt-8 h-12 px-8 text-base shadow-md transition-[translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lg"
            style={{ animationDelay: "380ms", animationFillMode: "backwards" }}
            onClick={onGetStarted}
          >
            Get started
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Button>
        </div>
      </main>

      <footer
        className="animate-hero-in text-muted-foreground relative px-4 pb-6 text-center text-[11px] leading-relaxed"
        style={{ animationDelay: "500ms", animationFillMode: "backwards" }}
      >
        <p className="mx-auto max-w-xl">
          {metadata?.advisory_note ?? ADVISORY_FALLBACK}
        </p>
        <p className="mt-1">
          University of the Immaculate Conception — College of Computer Studies,
          Davao City
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 — before you start                                          */
/* ------------------------------------------------------------------ */

function Intro({
  metadata,
  onBack,
  onEnter,
}: {
  metadata: DatasetMetadata | null;
  onBack: () => void;
  onEnter: (mode: AppMode) => void;
}) {
  const [selected, setSelected] = useState<AppMode | null>(null);
  const thresholds = thresholdsOf(metadata);

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-8 px-5 py-8 sm:py-12">
        <div className="animate-hero-in">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground -ml-2"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </div>

        {/* Panel revision #5 — the guide comes BEFORE any number is shown. */}
        <section
          className="animate-hero-in space-y-3"
          style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
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
          className="animate-hero-in space-y-3"
          style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
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
          <p>{metadata?.advisory_note ?? ADVISORY_FALLBACK}</p>
        </footer>
      </div>
    </ScrollArea>
  );
}

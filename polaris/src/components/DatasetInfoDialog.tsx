import { Database, MapPinned, TreePine, Waves } from "lucide-react";
import type { ReactNode } from "react";

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
import { MAX_TOP_N, MIN_TOP_N } from "@/lib/search";
import { HAZARD_LABEL, SERVICE_FACTOR_LABEL } from "@/lib/suitability";
import type { DatasetMetadata, HazardKey, ServiceFactorKey } from "@/types/polaris";

/**
 * Panel revision #6 — states plainly that the ~300,000 OpenStreetMap figure
 * and the ~3,000 training-site figure describe two different quantities, and
 * shows the exact counts this dataset carries.
 */
export function DatasetInfoDialog({
  open,
  onOpenChange,
  metadata,
  siteCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: DatasetMetadata | null;
  siteCount: number;
}) {
  if (!metadata) return null;

  const clarification = metadata.dataset_clarification;
  const rawRecords = clarification?.raw_osm_records_extracted ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Where the data comes from</DialogTitle>
          <DialogDescription>
            {metadata.study_area} — what was gathered, what was scored, and how
            the score is put together.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* ---- Revision #6: the two counts are different things ---- */}
          <section className="space-y-3">
            <SectionTitle icon={<Database className="size-4" />}>
              Two numbers that are often mixed up
            </SectionTitle>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Map records collected"
                value={
                  rawRecords !== null
                    ? rawRecords.toLocaleString()
                    : "≈300,000"
                }
                caveat={
                  rawRecords !== null
                    ? "Buildings, roads and existing health facilities across the district."
                    : "Figure quoted in the paper. The current data file does not record the exact count."
                }
              />
              <StatCard
                label="Candidate sites actually scored"
                value={clarification.training_candidate_sites.toLocaleString()}
                caveat={`Points spread evenly across the district. ${siteCount.toLocaleString()} of them are loaded right now.`}
                emphasis
              />
            </div>

            <p className="text-muted-foreground bg-muted/50 rounded-lg border p-3 text-xs leading-relaxed">
              {clarification.note}
            </p>
          </section>

          <Separator />

          {/* ---- Revision #1 + #8: single Random Forest, hazard intrinsic ---- */}
          <section className="space-y-3">
            <SectionTitle icon={<TreePine className="size-4" />}>
              How the score is produced
            </SectionTitle>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {metadata.model}
              </Badge>
              {metadata.model_status === "provisional" && (
                <Badge variant="outline" className="text-suit-low text-xs">
                  Provisional data — figures may still change
                </Badge>
              )}
            </div>

            {metadata.model_note && (
              <p className="border-suit-low/50 bg-suit-low/5 rounded-lg border-l-2 p-3 text-xs leading-relaxed">
                {metadata.model_note}
              </p>
            )}

            <p className="text-muted-foreground text-xs leading-relaxed">
              Every site is scored the same way — there is only one version of
              the score. An earlier draft offered a second score that ignored
              flood, landslide and storm surge risk, and that has been removed. A
              hazardous site should not be recommended at all, so hazard risk is
              now built into every score and cannot be switched off to make a
              site look better than it is.
            </p>
          </section>

          <Separator />

          {/* ---- Weights ---- */}
          <section className="space-y-3">
            <SectionTitle icon={<MapPinned className="size-4" />}>
              How much each factor counts
            </SectionTitle>

            <div className="grid gap-4 sm:grid-cols-2">
              <WeightList
                heading="Adds to the score"
                total={0.8}
                entries={Object.entries(metadata.weights.service).map(
                  ([key, value]) => ({
                    label: SERVICE_FACTOR_LABEL[key as ServiceFactorKey] ?? key,
                    value,
                  }),
                )}
              />
              <WeightList
                heading="Takes away from the score"
                total={0.2}
                entries={Object.entries(metadata.weights.hazard_penalty).map(
                  ([key, value]) => ({
                    label: HAZARD_LABEL[key as HazardKey] ?? key,
                    value,
                  }),
                )}
                negative
              />
            </div>
          </section>

          <Separator />

          {/* ---- Revision #2: shoreline buffer ---- */}
          <section className="space-y-2">
            <SectionTitle icon={<Waves className="size-4" />}>
              Rules that rule a site out
            </SectionTitle>
            <ul className="text-muted-foreground space-y-1.5 text-xs leading-relaxed">
              <li>
                <strong className="text-foreground">
                  Nothing within {metadata.shoreline_buffer_m} m of the shoreline.
                </strong>{" "}
                The distance to the shoreline is measured for every site.{" "}
                {clarification.shoreline_excluded_sites.toLocaleString()} site
                {clarification.shoreline_excluded_sites === 1 ? " is" : "s are"}{" "}
                too close and can never be recommended. You can switch this band
                on and off in the map key.
              </li>
              <li>
                <strong className="text-foreground">
                  Nothing rated High on a hazard.
                </strong>{" "}
                Any site rated High for flood, landslide or storm surge is kept
                off the recommendation list, no matter how good its score is.
              </li>
              <li>
                <strong className="text-foreground">
                  A short list only.
                </strong>{" "}
                You choose how many sites to see, from {MIN_TOP_N} to {MAX_TOP_N},
                instead of sifting through thousands of near-identical options.
              </li>
            </ul>
          </section>

          {metadata.generated_at && (
            <p className="text-muted-foreground text-[11px]">
              This data was prepared{" "}
              {new Date(metadata.generated_at).toLocaleString()}
              {metadata.generated_by ? ` by ${metadata.generated_by}` : ""}.
              {metadata.osm_snapshot_date &&
                ` Map data is from OpenStreetMap as of ${metadata.osm_snapshot_date}.`}
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

function SectionTitle({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold">
      <span className="text-primary">{icon}</span>
      {children}
    </h3>
  );
}

function StatCard({
  label,
  value,
  caveat,
  emphasis,
}: {
  label: string;
  value: string;
  caveat: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "border-primary/40 bg-primary/5 rounded-lg border p-3"
          : "bg-muted/40 rounded-lg border p-3"
      }
    >
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="tabular mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
        {caveat}
      </p>
    </div>
  );
}

function WeightList({
  heading,
  entries,
  total,
  negative,
}: {
  heading: string;
  entries: { label: string; value: number }[];
  total: number;
  negative?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs font-semibold">
        {heading} — {negative ? "−" : ""}
        {total.toFixed(2)} total
      </p>
      <ul className="space-y-1.5">
        {entries.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            <span className="tabular font-semibold">
              {negative ? "−" : "+"}
              {entry.value.toFixed(3)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

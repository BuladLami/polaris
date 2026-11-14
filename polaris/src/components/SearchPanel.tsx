import { useMemo, useState } from "react";
import { AlertCircle, Locate, RotateCcw, Search, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BarangayEntry } from "@/lib/dataset";
import type { AppMode } from "@/types/polaris";

export interface SearchPanelProps {
  mode: AppMode;
  barangays: readonly BarangayEntry[];
  latitude: string;
  longitude: string;
  radiusM: string;
  minRadiusM: number;
  maxRadiusM: number;
  topN: string;
  minTopN: number;
  maxTopN: number;
  error: string | null;
  hasResults: boolean;
  onLatitudeChange: (value: string) => void;
  onLongitudeChange: (value: string) => void;
  onRadiusChange: (value: string) => void;
  onTopNChange: (value: string) => void;
  onRun: () => void;
  onClear: () => void;
  onFlyTo: (lat: number, lon: number, zoom: number) => void;
}

export function SearchPanel({
  mode,
  barangays,
  latitude,
  longitude,
  radiusM,
  minRadiusM,
  maxRadiusM,
  topN,
  minTopN,
  maxTopN,
  error,
  hasResults,
  onLatitudeChange,
  onLongitudeChange,
  onRadiusChange,
  onTopNChange,
  onRun,
  onClear,
  onFlyTo,
}: SearchPanelProps) {
  const isRecommendation = mode === "recommendation";
  const hasPoint = latitude.trim() !== "" && longitude.trim() !== "";
  // Falls back while the field is empty or mid-edit, so the button never
  // renders "Find the top  sites".
  const shortlistSize = Number.parseInt(topN, 10) || minTopN;

  return (
    <section className="space-y-3">
      <BarangayFinder barangays={barangays} onFlyTo={onFlyTo} />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            {isRecommendation ? "Search centre" : "Location to evaluate"}
          </label>
          {hasPoint && (
            <button
              type="button"
              onClick={onClear}
              className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
            >
              <Trash2 className="size-3" />
              Clear
            </button>
          )}
        </div>

        <p className="text-muted-foreground text-xs leading-relaxed">
          Click anywhere on the map, or type coordinates below.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <LabelledInput
            label="Latitude"
            value={latitude}
            placeholder="7.0511"
            onChange={onLatitudeChange}
          />
          <LabelledInput
            label="Longitude"
            value={longitude}
            placeholder="125.5439"
            onChange={onLongitudeChange}
          />
        </div>

        {isRecommendation && (
          <div className="grid grid-cols-2 gap-2">
            <LabelledInput
              label={`Radius in metres (${minRadiusM}–${maxRadiusM.toLocaleString()})`}
              value={radiusM}
              placeholder="500"
              type="number"
              min={minRadiusM}
              max={maxRadiusM}
              step={50}
              onChange={onRadiusChange}
            />
            <LabelledInput
              label={`Sites to show (${minTopN}–${maxTopN})`}
              value={topN}
              placeholder={String(minTopN)}
              type="number"
              min={minTopN}
              max={maxTopN}
              step={1}
              onChange={onTopNChange}
            />
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="border-destructive/50 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border-l-2 p-2.5 text-xs leading-relaxed"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* Once a shortlist exists the primary action becomes destructive: it
          tears down the search centre, the radius ring and the results, and
          returns the map to its opening view. */}
      {isRecommendation && hasResults ? (
        <Button className="w-full" variant="destructive" onClick={onClear}>
          <RotateCcw className="size-4" />
          Clear search and reset map
        </Button>
      ) : (
        <Button className="w-full" onClick={onRun}>
          {isRecommendation ? (
            <>
              <Search className="size-4" />
              Find the top {shortlistSize}{" "}
              {shortlistSize === 1 ? "site" : "sites"}
            </>
          ) : (
            <>
              <Locate className="size-4" />
              Evaluate this location
            </>
          )}
        </Button>
      )}

      <p className="text-muted-foreground text-[11px] leading-relaxed">
        {!isRecommendation
          ? "Clicking a point on the map evaluates it straight away. Moving or zooming the map changes nothing."
          : hasResults
            ? "Clearing removes the search centre, its radius circle and the results, then zooms back out to the whole district."
            : "Nothing is worked out until you press this button. Moving or zooming the map changes nothing."}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function LabelledInput({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<"input">, "onChange" | "value">) {
  return (
    <label className="block space-y-1">
      <span className="text-muted-foreground text-[11px] font-medium">
        {label}
      </span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        {...props}
      />
    </label>
  );
}

/**
 * Barangay jump-to. The list is derived from the scored sites themselves, so
 * every option is guaranteed to contain results. The suggestion list expands
 * inline rather than floating, so it can never overlap the controls beneath it
 * or be clipped by the panel's scroll container.
 */
function BarangayFinder({
  barangays,
  onFlyTo,
}: {
  barangays: readonly BarangayEntry[];
  onFlyTo: (lat: number, lon: number, zoom: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? barangays.filter((b) => b.name.toLowerCase().includes(q))
      : barangays;
    return pool.slice(0, 40);
  }, [barangays, query]);

  return (
    <div className="space-y-2">
      <label className="text-muted-foreground block text-xs font-semibold tracking-widest uppercase">
        Jump to barangay
      </label>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          value={query}
          placeholder={`Search ${barangays.length} barangays…`}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="pr-8 pl-8"
        />
        {(query || open) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
            aria-label="Clear barangay search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <ul
          className={cn(
            "animate-fade-in bg-muted/40 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border p-1",
          )}
        >
          {matches.length === 0 && (
            <li className="text-muted-foreground px-2 py-2 text-xs">
              No barangay matches “{query}”.
            </li>
          )}
          {matches.map((b) => (
            <li key={b.name}>
              <button
                type="button"
                onClick={() => {
                  onFlyTo(b.latitude, b.longitude, 14.5);
                  setQuery(b.name);
                  setOpen(false);
                }}
                className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
              >
                <span className="truncate font-medium">{b.name}</span>
                <span className="text-muted-foreground tabular shrink-0 text-[10px]">
                  {b.siteCount.toLocaleString()} sites
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useState } from "react";
import { ChevronDown, Cross, Layers, Waves } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CLASS_COLOR_VAR,
  classRange,
  DEFAULT_THRESHOLDS,
  SUITABILITY_CLASSES,
  type Thresholds,
} from "@/lib/suitability";
import { mapKeyStartsOpen } from "@/lib/map-view";

/**
 * Floating map key. Collapsible and bottom-left so it never collides with the
 * zoom controls (top-right) or the MapLibre attribution (bottom-right).
 *
 * Collapsing folds the colour key away and leaves the layer switches in place,
 * since those are what a reader reaches for while working on the map.
 */
export function MapLegend({
  thresholds = DEFAULT_THRESHOLDS,
  shorelineBufferM,
  showShorelineBuffer,
  onToggleShorelineBuffer,
  showAllSites,
  onToggleAllSites,
  showFacilities,
  onToggleFacilities,
  facilityCount,
  siteCount,
  excludedCount,
}: {
  thresholds?: Thresholds;
  shorelineBufferM: number;
  showShorelineBuffer: boolean;
  onToggleShorelineBuffer: () => void;
  showAllSites: boolean;
  onToggleAllSites: () => void;
  showFacilities: boolean;
  onToggleFacilities: () => void;
  /** Null when the facilities file is absent — the toggle then hides entirely. */
  facilityCount: number | null;
  siteCount: number;
  excludedCount: number;
}) {
  const [open, setOpen] = useState(mapKeyStartsOpen);

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-[min(24rem,calc(100%-2rem))]">
      <div className="bg-card/90 pointer-events-auto overflow-hidden rounded-xl border shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="hover:bg-accent/60 flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors"
        >
          <Layers className="text-primary size-5 shrink-0" />
          <span className="flex-1 text-base font-semibold">Map key</span>
          <ChevronDown
            className={cn(
              "text-muted-foreground size-5 shrink-0 transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
        </button>

        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-4 border-t px-4 pt-3.5">
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase">
                  Suitability score
                </p>
                <ul className="space-y-1.5">
                  {SUITABILITY_CLASSES.map((cls) => (
                    <li
                      key={cls}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: `var(${CLASS_COLOR_VAR[cls]})`,
                          }}
                        />
                        <span className="truncate">{cls}</span>
                      </span>
                      <span className="text-muted-foreground tabular shrink-0">
                        {classRange(cls, thresholds)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2 text-sm">
                    <span className="bg-suit-excluded size-2.5 shrink-0 rounded-full" />
                    <span className="text-muted-foreground truncate">
                      Ruled out — within {shorelineBufferM} m of the shoreline
                    </span>
                  </li>
                  {facilityCount !== null && (
                    <li className="flex items-center gap-2 text-sm">
                      {/* Ring, not a filled dot — matches how the map draws it. */}
                      <span className="bg-card border-facility-ring size-2.5 shrink-0 rounded-full border-2" />
                      <span className="text-muted-foreground truncate">
                        Existing health facility — not a candidate site
                      </span>
                    </li>
                  )}
                </ul>
              </div>

              <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
                The closer to 1, the better the site. Flood, landslide and storm
                surge risk are already counted in every score.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 border-t px-4 py-3">
                <LegendToggle
                  checked={showAllSites}
                  onChange={onToggleAllSites}
                  label={`All ${siteCount.toLocaleString()} scored sites`}
                />
                <LegendToggle
                  checked={showShorelineBuffer}
                  onChange={onToggleShorelineBuffer}
                  label={`${shorelineBufferM} m shoreline buffer`}
                  hint={`${excludedCount} site${excludedCount === 1 ? "" : "s"} ruled out`}
                  icon={<Waves className="size-4" />}
                />
                {facilityCount !== null && (
                  <LegendToggle
                    checked={showFacilities}
                    onChange={onToggleFacilities}
                    label="Existing health facilities"
                    icon={<Cross className="size-4" />}
                  />
                )}
        </div>
      </div>
    </div>
  );
}

function LegendToggle({
  checked,
  onChange,
  label,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className="hover:bg-accent/40 -mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-primary size-4 shrink-0 cursor-pointer"
      />
      {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && (
        <span className="text-muted-foreground shrink-0 text-xs">{hint}</span>
      )}
    </label>
  );
}

import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  BedDouble,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Landmark,
  Link as LinkIcon,
  Mail,
  MapPin,
  Phone,
  Siren,
  Stethoscope,
  Tag,
} from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  facilityDetailRows,
  facilityKindLabel,
  facilityTitle,
  osmUrl,
  type FacilityDetailKey,
  type FacilityFeature,
} from "@/lib/facilities";

const ROW_ICON: Record<FacilityDetailKey, LucideIcon> = {
  also_known_as: Tag,
  address: MapPin,
  speciality: Stethoscope,
  operator: Landmark,
  opening_hours: Clock,
  phone: Phone,
  email: Mail,
  website: Globe,
  facebook: LinkIcon,
  beds: BedDouble,
  emergency: Siren,
  wheelchair: Accessibility,
};

/**
 * What OpenStreetMap records about one existing facility.
 *
 * Only opened for facilities that have something beyond a name and type (see
 * `facilityDetailRows`), so the body is never empty. It reports and does not
 * judge: facilities are not scored, so there is no score here.
 */
export function FacilityDetailsDialog({
  facility,
  snapshotDate,
  onOpenChange,
}: {
  facility: FacilityFeature | null;
  /** OSM snapshot the details were read from, e.g. "2026-07-29". */
  snapshotDate?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const props = facility?.properties;
  const rows = props ? facilityDetailRows(props) : [];
  const [lon, lat] = facility?.geometry.coordinates ?? [0, 0];
  const osm = props ? osmUrl(props) : null;

  return (
    <Dialog open={facility !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {props && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{facilityTitle(props)}</DialogTitle>
                <Badge variant="outline" className="border-facility-ring text-facility-ring">
                  Existing facility
                </Badge>
              </div>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{facilityKindLabel(props)}</span>
                <span className="tabular">
                  {lat.toFixed(6)}, {lon.toFixed(6)}
                </span>
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <dl className="divide-y">
                {rows.map((row) => {
                  const Icon = ROW_ICON[row.key];
                  return (
                    <div
                      key={row.key}
                      className="grid grid-cols-[1.25rem_7rem_1fr] items-start gap-x-2 py-2 text-sm first:pt-0"
                    >
                      <Icon className="text-muted-foreground mt-0.5 size-4" />
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="min-w-0 space-y-0.5 break-words">
                        {row.values.map((v, i) => (
                          <p key={i}>
                            {v.href ? (
                              <a
                                href={v.href}
                                className="text-primary underline-offset-2 hover:underline"
                                {...(v.href.startsWith("http")
                                  ? { target: "_blank", rel: "noopener noreferrer" }
                                  : {})}
                              >
                                {v.text}
                              </a>
                            ) : (
                              v.text
                            )}
                          </p>
                        ))}
                      </dd>
                    </div>
                  );
                })}
              </dl>

              <section className="bg-muted/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed">
                <Info className="text-primary mt-0.5 size-3.5 shrink-0" />
                <p>
                  Not a candidate site. Existing facilities are what each site's{" "}
                  <strong className="text-foreground">
                    distance from existing facilities
                  </strong>{" "}
                  is measured to, so sites close to this one score lower on that
                  factor.
                </p>
              </section>
            </DialogBody>

            <DialogFooter className="text-muted-foreground items-center text-[11px] sm:justify-between">
              <p>
                Details from OpenStreetMap
                {snapshotDate ? ` (snapshot ${snapshotDate})` : ""}. They may
                be incomplete or out of date.
              </p>
              {osm && (
                <a
                  href={osm}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex shrink-0 items-center gap-1 underline-offset-2 hover:underline"
                >
                  View on OpenStreetMap
                  <ExternalLink className="size-3" />
                </a>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

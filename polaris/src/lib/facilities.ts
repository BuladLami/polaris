import type { Feature, FeatureCollection, Point } from "geojson";

import type { FacilityProperties } from "@/types/polaris";

/**
 * Existing health facilities: what the details dialog shows, and the rule for
 * when it shows at all.
 *
 * A facility is clickable only when it has something to say beyond its name
 * and type, which the hover card already gives. Opening a dialog that repeats
 * the hover card would teach people that facility clicks are not worth making.
 */

export type FacilityFeature = Feature<Point, FacilityProperties>;
export type FacilityCollection = FeatureCollection<Point, FacilityProperties>;

/** Placeholder the pipeline writes when OSM has no `name` tag. */
const UNNAMED = "Unnamed facility";

/**
 * OSM tags many barangay health centres as `amenity=doctors`. "Doctors" reads
 * as a person, so use a term that fits both a private practice and a centre.
 */
const KIND_LABEL: Record<string, string> = {
  hospital: "Hospital",
  clinic: "Clinic",
  doctors: "Doctor's clinic",
  health_post: "Health post",
};

export function facilityKindLabel(p: FacilityProperties): string {
  return (p.amenity && KIND_LABEL[p.amenity]) || p.kind || "Health facility";
}

/** The real name, or null for the pipeline's "Unnamed facility" placeholder. */
export function facilityName(p: FacilityProperties): string | null {
  const name = p.name?.trim();
  return name && name !== UNNAMED ? name : null;
}

/** Heading for the hover card and the dialog. */
export function facilityTitle(p: FacilityProperties): string {
  return facilityName(p) ?? `Unnamed ${facilityKindLabel(p).toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/*  Detail rows                                                        */
/* ------------------------------------------------------------------ */

export type FacilityDetailKey =
  | "also_known_as"
  | "address"
  | "speciality"
  | "operator"
  | "opening_hours"
  | "phone"
  | "email"
  | "website"
  | "facebook"
  | "beds"
  | "emergency"
  | "wheelchair";

export interface FacilityDetailValue {
  text: string;
  /** Present only for values that are safe to open: http(s), tel or mailto. */
  href?: string;
}

export interface FacilityDetailRow {
  key: FacilityDetailKey;
  label: string;
  values: FacilityDetailValue[];
}

function clean(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function list(v: string | null | undefined): string[] {
  return (clean(v) ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** "infectious_diseases" -> "Infectious diseases". */
function sentenceCase(s: string): string {
  const words = s.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const OPERATOR_TYPE: Record<string, string> = {
  government: "Government",
  public: "Public",
  private: "Private",
  ngo: "Non-government organisation",
  community: "Community",
  religious: "Religious organisation",
  charitable: "Charity",
};

const DAY: Record<string, string> = {
  Mo: "Mon",
  Tu: "Tue",
  We: "Wed",
  Th: "Thu",
  Fr: "Fri",
  Sa: "Sat",
  Su: "Sun",
  PH: "public holidays",
};

/**
 * OSM `opening_hours` made readable without parsing it: day codes become day
 * names and "off" becomes "closed". Anything unusual passes through as written,
 * which is still correct, only terser.
 */
function readableHours(raw: string): string {
  if (raw === "24/7") return "Open 24 hours, every day";
  return raw
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAY[d] ?? d)
    .replace(/\boff\b/g, "closed")
    .replace(/\s*;\s*/g, "; ");
}

function isHttp(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

/** Display form of a URL: no scheme, no leading www, no trailing slash. */
function shortUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

function websiteValue(raw: string): FacilityDetailValue {
  const url = /^www\./i.test(raw) ? `https://${raw}` : raw;
  return isHttp(url) ? { text: shortUrl(url), href: url } : { text: raw };
}

/** OSM holds Facebook pages as full URLs, bare URLs, `@handle` or a handle. */
function facebookValue(raw: string): FacilityDetailValue {
  let url = raw;
  if (/^(www\.)?facebook\.com\//i.test(url)) url = `https://${url}`;
  else if (!/^https?:\/\//i.test(url)) {
    const handle = url.replace(/^@/, "");
    if (!/^[\w.-]+$/.test(handle)) return { text: raw };
    url = `https://www.facebook.com/${handle}`;
  }
  return isHttp(url) ? { text: shortUrl(url), href: url } : { text: raw };
}

function phoneValue(raw: string): FacilityDetailValue {
  // Dial the number itself; an extension ("loc. 5140") stays in the text.
  const dial = raw.split(/\b(?:loc|local|ext)\b/i)[0].replace(/[^\d+]/g, "");
  return dial.length >= 7 ? { text: raw, href: `tel:${dial}` } : { text: raw };
}

function emailValue(raw: string): FacilityDetailValue {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
    ? { text: raw, href: `mailto:${raw}` }
    : { text: raw };
}

const EMERGENCY: Record<string, string> = {
  yes: "Has an emergency department",
  no: "No emergency department",
};

const WHEELCHAIR: Record<string, string> = {
  yes: "Wheelchair accessible",
  limited: "Limited wheelchair access",
  no: "Not wheelchair accessible",
};

/**
 * Everything the dialog can say about a facility, in reading order. Empty when
 * OSM holds nothing beyond the name and type — that is exactly the case where
 * the facility is not clickable.
 */
export function facilityDetailRows(p: FacilityProperties): FacilityDetailRow[] {
  const rows: FacilityDetailRow[] = [];
  const add = (
    key: FacilityDetailKey,
    label: string,
    values: FacilityDetailValue[],
  ) => {
    if (values.length) rows.push({ key, label, values });
  };
  const text = (s: string | null) => (s ? [{ text: s }] : []);

  const name = facilityName(p);
  add(
    "also_known_as",
    "Also known as",
    text(
      list(p.also_known_as)
        .filter((a) => a !== name)
        .join(", ") || null,
    ),
  );
  add("address", "Address", text(clean(p.address)));
  add(
    "speciality",
    "Services",
    text(list(p.speciality).map(sentenceCase).join(", ") || null),
  );

  const operator = clean(p.operator);
  const operatorType = clean(p.operator_type);
  const typeLabel = operatorType
    ? (OPERATOR_TYPE[operatorType] ?? sentenceCase(operatorType))
    : null;
  add(
    "operator",
    "Operator",
    text(
      operator && typeLabel
        ? `${operator} (${typeLabel.toLowerCase()})`
        : (operator ?? (typeLabel && `${typeLabel}-run`)),
    ),
  );

  const hours = clean(p.opening_hours);
  add("opening_hours", "Opening hours", text(hours && readableHours(hours)));
  add("phone", "Phone", list(p.phone).map(phoneValue));

  const email = clean(p.email);
  add("email", "Email", email ? [emailValue(email)] : []);
  const website = clean(p.website);
  add("website", "Website", website ? [websiteValue(website)] : []);
  const facebook = clean(p.facebook);
  add("facebook", "Facebook", facebook ? [facebookValue(facebook)] : []);

  const beds = clean(p.beds);
  add("beds", "Beds", text(beds && (/^\d+$/.test(beds) ? `${beds} beds` : beds)));

  const emergency = clean(p.emergency);
  add(
    "emergency",
    "Emergency",
    text(emergency && (EMERGENCY[emergency] ?? sentenceCase(emergency))),
  );
  const wheelchair = clean(p.wheelchair);
  add(
    "wheelchair",
    "Accessibility",
    text(wheelchair && (WHEELCHAIR[wheelchair] ?? sentenceCase(wheelchair))),
  );

  return rows;
}

export function osmUrl(p: FacilityProperties): string | null {
  if (!p.osm_type || typeof p.osm_id !== "number") return null;
  return `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`;
}

/**
 * Stamps each displayed facility with its position (`fid`) and whether it has
 * details. The map's hit test returns only flat feature properties, so these
 * are what a click carries back to find the record and decide whether to open.
 */
export function indexFacilities(
  facilities: FeatureCollection | null,
): FacilityCollection | null {
  if (!facilities) return null;
  const features = (facilities.features as FacilityFeature[]).map(
    (feature, fid) => ({
      ...feature,
      properties: {
        ...feature.properties,
        fid,
        has_details: facilityDetailRows(feature.properties ?? {
          name: null,
          amenity: null,
        }).length
          ? (1 as const)
          : (0 as const),
      },
    }),
  );
  return { ...(facilities as FacilityCollection), features };
}

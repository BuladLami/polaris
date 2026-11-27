#!/usr/bin/env node
/**
 * Renames the second suitability class from "Moderately Suitable" to
 * "Suitable" in an existing candidate_sites.json, and changes nothing else.
 *
 *   node scripts/relabel-classes.mjs [path]      (default: public/data/candidate_sites.json)
 *
 * The rename is done on the raw text, so every other byte of the file is left
 * exactly as the pipeline wrote it: number formatting, key order and escaping
 * all survive. The result is then parsed and compared with the original field
 * by field, and the file is written only if
 *
 *   - the only values that differ are `suitability_class` on sites and on
 *     top_recommendations, and the key of `metadata.suitability_class_counts`;
 *   - each of those differences is exactly "Moderately Suitable" → "Suitable";
 *   - the class counts are identical before and after (same numbers, new name);
 *   - no "Moderately" is left anywhere in the file.
 *
 * Running it on a file that is already relabelled is a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OLD = "Moderately Suitable";
const NEW = "Suitable";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(
  process.argv[2] ?? path.join(here, "..", "public", "data", "candidate_sites.json"),
);

const before = fs.readFileSync(target, "utf8");
const quotedOld = JSON.stringify(OLD);
const quotedNew = JSON.stringify(NEW);

const occurrences = before.split(quotedOld).length - 1;
if (occurrences === 0) {
  console.log(`No "${OLD}" in ${target} — already relabelled, nothing to do.`);
  process.exit(0);
}

const after = before.split(quotedOld).join(quotedNew);
const a = JSON.parse(before);
const b = JSON.parse(after);

/* ---- Field-by-field comparison --------------------------------------- */

const allowed = [];
const unexpected = [];

function compare(x, y, at) {
  if (Array.isArray(x)) {
    if (!Array.isArray(y) || x.length !== y.length) return unexpected.push(`${at}: array shape`);
    x.forEach((v, i) => compare(v, y[i], `${at}[${i}]`));
    return;
  }
  if (x !== null && typeof x === "object") {
    if (y === null || typeof y !== "object") return unexpected.push(`${at}: type`);
    const kx = Object.keys(x);
    const ky = Object.keys(y);
    if (kx.length !== ky.length) return unexpected.push(`${at}: key count`);
    kx.forEach((k, i) => {
      const k2 = ky[i];
      if (k !== k2) {
        // The only key allowed to change is the class name in the counts table.
        if (at === "$.metadata.suitability_class_counts" && k === OLD && k2 === NEW) {
          allowed.push(`${at} key`);
        } else {
          unexpected.push(`${at}: key ${k} -> ${k2}`);
        }
      }
      compare(x[k], y[k2], `${at}.${k}`);
    });
    return;
  }
  if (x === y) return;
  const isClassField = /\.(sites|top_recommendations)\[\d+\]\.suitability_class$/.test(at);
  if (isClassField && x === OLD && y === NEW) allowed.push(at);
  else unexpected.push(`${at}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
}
compare(a, b, "$");

/* ---- Counts ----------------------------------------------------------- */

const tally = (sites) =>
  sites.reduce((m, s) => ((m[s.suitability_class] = (m[s.suitability_class] ?? 0) + 1), m), {});
const ca = tally(a.sites);
const cb = tally(b.sites);
const rename = (k) => (k === OLD ? NEW : k);
const countsMatch =
  Object.keys(ca).length === Object.keys(cb).length &&
  Object.entries(ca).every(([k, n]) => cb[rename(k)] === n);

const metaA = a.metadata?.suitability_class_counts ?? {};
const metaB = b.metadata?.suitability_class_counts ?? {};
const metaMatch = Object.entries(metaA).every(([k, n]) => metaB[rename(k)] === n);

const problems = [...unexpected];
if (!countsMatch) problems.push("per-site class counts differ after the rename");
if (!metaMatch) problems.push("metadata.suitability_class_counts differ after the rename");
if (after.includes("Moderately")) problems.push('"Moderately" still present after the rename');
if (allowed.length !== occurrences) {
  problems.push(`${occurrences} occurrences replaced but ${allowed.length} accounted for`);
}

if (problems.length) {
  console.error("Refusing to write — the rename would change more than the label:");
  for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
  process.exit(1);
}

fs.writeFileSync(target, after);
console.log(`Relabelled ${target}`);
console.log(`  "${OLD}" -> "${NEW}": ${occurrences} occurrence(s)`);
console.log(`  sites: ${allowed.filter((p) => p.includes(".sites[")).length}`);
console.log(`  top_recommendations: ${allowed.filter((p) => p.includes(".top_recommendations[")).length}`);
console.log(`  metadata.suitability_class_counts key: ${allowed.filter((p) => p.endsWith(" key")).length}`);
console.log(`  class counts before: ${JSON.stringify(ca)}`);
console.log(`  class counts after : ${JSON.stringify(cb)}`);
console.log("  every other field: unchanged");

#!/usr/bin/env node
/**
 * Proves that two candidate_sites.json files score every site identically.
 *
 *   node scripts/verify-scores-unchanged.mjs <before.json> <after.json>
 *
 * Per site it compares the score, the class (by its position on the scale, so
 * the "Moderately Suitable" -> "Suitable" rename counts as the same class),
 * recommendation eligibility and recommendation level, and then every other
 * field of the record. It also compares the shortlist and the metadata. Exits
 * non-zero on any difference other than the class label rename.
 */
import fs from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error("usage: verify-scores-unchanged.mjs <before.json> <after.json>");
  process.exit(2);
}

const CLASS_POSITION = {
  "Not Suitable": 0,
  "Low Suitability": 1,
  "Moderately Suitable": 2,
  Suitable: 2,
  "Highly Suitable": 3,
};
const RENAMED = { "Moderately Suitable": "Suitable" };
const relabel = (v) => RENAMED[v] ?? v;

const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));

const problems = [];
const tally = { score: 0, classPosition: 0, eligible: 0, level: 0, otherFields: 0, labelRenamed: 0 };

const A = new Map(before.sites.map((s) => [s.site_id, s]));
const B = new Map(after.sites.map((s) => [s.site_id, s]));
if (A.size !== B.size) problems.push(`site count ${A.size} -> ${B.size}`);
for (const id of A.keys()) if (!B.has(id)) problems.push(`site ${id} missing after`);

const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

for (const [id, a] of A) {
  const b = B.get(id);
  if (!b) continue;
  if (a.score !== b.score) { tally.score++; problems.push(`${id} score ${a.score} -> ${b.score}`); }
  if (CLASS_POSITION[a.suitability_class] !== CLASS_POSITION[b.suitability_class]) {
    tally.classPosition++;
    problems.push(`${id} class ${a.suitability_class} -> ${b.suitability_class}`);
  }
  if (a.recommendation_eligible !== b.recommendation_eligible) {
    tally.eligible++; problems.push(`${id} eligibility changed`);
  }
  if (a.recommendation_level !== b.recommendation_level) {
    tally.level++; problems.push(`${id} level changed`);
  }
  if (a.suitability_class !== b.suitability_class) {
    if (relabel(a.suitability_class) === b.suitability_class) tally.labelRenamed++;
    else problems.push(`${id} label ${a.suitability_class} -> ${b.suitability_class}`);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === "suitability_class") continue;
    if (!same(a[k], b[k])) { tally.otherFields++; problems.push(`${id}.${k} changed`); }
  }
}

const shortlist = (d) =>
  d.top_recommendations.map((r) => ({ ...r, suitability_class: relabel(r.suitability_class) }));
const shortlistSame = same(shortlist(before), shortlist(after));
if (!shortlistSame) problems.push("top_recommendations differ");

const meta = (m) => {
  const counts = Object.fromEntries(
    Object.entries(m.suitability_class_counts ?? {}).map(([k, v]) => [relabel(k), v]),
  );
  return { ...m, suitability_class_counts: counts };
};
const metaSame = same(meta(before.metadata), meta(after.metadata));
if (!metaSame) problems.push("metadata differs beyond the class-count key");

console.log(`Compared ${A.size} sites: ${beforePath}  vs  ${afterPath}`);
console.log(`  score differences                : ${tally.score}`);
console.log(`  class (position on scale) changes: ${tally.classPosition}`);
console.log(`  eligibility changes              : ${tally.eligible}`);
console.log(`  recommendation level changes     : ${tally.level}`);
console.log(`  other per-site field changes     : ${tally.otherFields}`);
console.log(`  label renamed only               : ${tally.labelRenamed} (Moderately Suitable -> Suitable)`);
console.log(`  shortlist identical              : ${shortlistSame}`);
console.log(`  metadata identical (bar the key) : ${metaSame}`);
if (problems.length) {
  console.error(`FAIL — ${problems.length} difference(s):`);
  for (const p of problems.slice(0, 20)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("PASS — every score, class, eligibility flag and level is unchanged.");

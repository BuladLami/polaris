/** Test helpers: read the shipped data files straight from disk. */
import fs from "node:fs";
import path from "node:path";
import type { FeatureCollection } from "geojson";

import type { PolarisDataset } from "@/types/polaris";

export const APP_ROOT = path.resolve(import.meta.dirname, "..", "..");
export const REPO_ROOT = path.resolve(APP_ROOT, "..");

export const dataPath = (file: string) => path.join(APP_ROOT, "public", "data", file);

export const readText = (p: string) => fs.readFileSync(p, "utf8");

export const loadDataset = () =>
  JSON.parse(readText(dataPath("candidate_sites.json"))) as PolarisDataset;

export const loadTiles = () =>
  JSON.parse(readText(dataPath("talomo_site_tiles.json"))) as FeatureCollection;

/**
 * Static catalog loaders — fetched once on the client and memoized.
 */

export interface StarRecord {
  id: string;
  ra: number;
  dec: number;
  mag: number;
  bv: number;
  name?: string;
  bf?: string;
  con?: string;
}

export interface DsoRecord {
  id: string;
  ra: number;
  dec: number;
  mag: number;
  type: string;
  size?: number;
  name?: string;
  m?: number;
  con?: string;
}

interface ConstellationLineFeature {
  id: string;
  properties: { rank: string };
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
}

interface ConstellationLineGeoJson {
  features: ConstellationLineFeature[];
}

let starsPromise: Promise<StarRecord[]> | null = null;
let dsoPromise: Promise<DsoRecord[]> | null = null;
let linesPromise: Promise<ConstellationLineFeature[]> | null = null;

export function loadStars(): Promise<StarRecord[]> {
  if (!starsPromise) {
    starsPromise = fetch("/data/stars-mag6.json").then((r) => r.json());
  }
  return starsPromise;
}

export function loadDeepSky(): Promise<DsoRecord[]> {
  if (!dsoPromise) {
    dsoPromise = fetch("/data/dso.json").then((r) => r.json());
  }
  return dsoPromise;
}

export function loadConstellationLines(): Promise<ConstellationLineFeature[]> {
  if (!linesPromise) {
    linesPromise = fetch("/data/constellation-lines.json")
      .then((r) => r.json())
      .then((d: ConstellationLineGeoJson) => d.features);
  }
  return linesPromise;
}

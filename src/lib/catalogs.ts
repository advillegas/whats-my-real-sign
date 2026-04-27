/**
 * Static catalog loaders — fetched once on the client and memoized.
 *
 * Stars are loaded in two stages: a small mag-6.5 bootstrap (~1.5 MB, ~9k stars)
 * lights up the sky immediately, and a deeper mag-8.5 catalog (~9 MB, ~62k stars)
 * streams in afterwards and replaces the bootstrap. Consumers re-render whenever
 * `loadStars` resolves a deeper set.
 */

export interface StarRecord {
  id: string;
  /** RA in hours (J2000). */
  ra: number;
  /** Dec in degrees (J2000). */
  dec: number;
  /** Apparent visual magnitude. */
  mag: number;
  /** B-V color index. */
  bv: number;
  name?: string;
  /** Bayer/Flamsteed designation, e.g. "Alp Cen". */
  bf?: string;
  /** IAU constellation 3-letter code. */
  con?: string;
  /** Spectral type, e.g. "G2V". */
  spect?: string;
  /** Distance in parsecs. */
  distPc?: number;
  /** Absolute V magnitude. */
  absMag?: number;
  /** Variable-star flag. */
  variable?: boolean;
  hd?: string;
  hip?: string;
  hr?: string;
  gl?: string;
}

export interface DsoRecord {
  id: string;
  ra: number;
  dec: number;
  mag: number;
  /** OpenNGC type code: G, OCl, GCl, PN, EmN, RfN, Neb, SNR, ... */
  type: string;
  /** Major-axis arcmin. */
  size?: number;
  /** Minor-axis arcmin. */
  sizeMinor?: number;
  /** Position angle of the major axis, degrees east of north. */
  posAngle?: number;
  name?: string;
  /** Other common names beyond `name`. */
  commonNames?: string[];
  /** Messier number when applicable. */
  m?: number;
  ngc?: string;
  ic?: string;
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

let starsBootstrapPromise: Promise<StarRecord[]> | null = null;
let starsDeepPromise: Promise<StarRecord[]> | null = null;
let dsoPromise: Promise<DsoRecord[]> | null = null;
let linesPromise: Promise<ConstellationLineFeature[]> | null = null;

/**
 * Load the deep mag-8.5 star catalog (~62k stars). Memoized.
 *
 * Use {@link loadStarsBootstrap} when you want something on screen immediately.
 */
export function loadStars(): Promise<StarRecord[]> {
  if (!starsDeepPromise) {
    starsDeepPromise = fetch("/data/stars-mag9.json").then((r) => r.json());
  }
  return starsDeepPromise;
}

/** Load the small ~9k naked-eye-bright bootstrap. Memoized. */
export function loadStarsBootstrap(): Promise<StarRecord[]> {
  if (!starsBootstrapPromise) {
    starsBootstrapPromise = fetch("/data/stars-mag6.json").then((r) => r.json());
  }
  return starsBootstrapPromise;
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

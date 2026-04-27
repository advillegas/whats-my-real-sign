/**
 * IAU constellation lookup ("which official constellation does this RA/Dec
 * fall into?") plus zodiac helpers for the sidereal-sign reveal.
 *
 * Boundary data: d3-celestial "constellations.bounds.json" (precessed J2000).
 * We treat each Polygon as a (longitude, latitude) shape and use a wrap-aware
 * ray-casting point-in-polygon test. Longitude in the source data is
 * RA expressed in degrees on (-180, 180]; we normalize internally.
 */

import { normalizeRaDeg } from "./coordinates";

export interface ConstellationProps {
  rank: string;
}

export interface ConstellationBoundary {
  /** IAU 3-letter abbreviation (e.g. "Ori"). */
  desig: string;
  /** Pretty name (e.g. "Orion"). */
  name?: string;
  /** Polygon rings. Each ring is an array of [lonDeg(-180,180], latDeg]. */
  rings: number[][][];
}

export interface ConstellationMeta {
  desig: string;
  name: string;
  /** RA hours of typical center. */
  ra: number;
  /** Dec degrees of typical center. */
  dec: number;
  /** rank "1" | "2" | "3" — used for label sizing. */
  rank: string;
}

interface BoundsGeoJson {
  features: {
    id: string;
    properties: { rank: string };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }[];
}

interface MetaGeoJson {
  features: {
    id: string;
    properties: { name: string; desig: string; rank: string };
    geometry: { type: "Point"; coordinates: [number, number] };
  }[];
}

let boundariesCache: ConstellationBoundary[] | null = null;
let metaCache: ConstellationMeta[] | null = null;
let nameByDesig: Map<string, string> | null = null;

export async function loadBoundaries(): Promise<ConstellationBoundary[]> {
  if (boundariesCache) return boundariesCache;
  const res = await fetch("/data/constellation-boundaries.json");
  const data = (await res.json()) as BoundsGeoJson;
  boundariesCache = data.features.map((f) => ({
    desig: f.id,
    rings: f.geometry.coordinates,
  }));
  // Attach pretty name once meta is loaded.
  if (nameByDesig) {
    for (const b of boundariesCache) {
      b.name = nameByDesig.get(b.desig);
    }
  }
  return boundariesCache;
}

export async function loadMeta(): Promise<ConstellationMeta[]> {
  if (metaCache) return metaCache;
  const res = await fetch("/data/constellation-meta.json");
  const data = (await res.json()) as MetaGeoJson;
  metaCache = data.features.map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    return {
      desig: f.properties.desig,
      name: f.properties.name,
      ra: normalizeRaDeg(lon) / 15,
      dec: lat,
      rank: f.properties.rank,
    };
  });
  nameByDesig = new Map(metaCache.map((m) => [m.desig, m.name]));
  if (boundariesCache) {
    for (const b of boundariesCache) {
      b.name = nameByDesig.get(b.desig);
    }
  }
  return metaCache;
}

/**
 * Returns the IAU constellation containing the celestial point (raHours, decDeg).
 * Returns the boundary record for the matching constellation, or undefined.
 */
export function constellationAt(
  raHours: number,
  decDeg: number,
  boundaries: ConstellationBoundary[],
): ConstellationBoundary | undefined {
  const lon = wrapLon(raHours * 15);
  const lat = decDeg;
  for (const b of boundaries) {
    for (const ring of b.rings) {
      if (pointInRing(lon, lat, ring)) return b;
    }
  }
  return undefined;
}

/** Wraps a longitude (in degrees) into (-180, 180]. */
function wrapLon(d: number): number {
  let x = d;
  while (x > 180) x -= 360;
  while (x <= -180) x += 360;
  return x;
}

/** Wrap-aware ray casting. Shifts ring vertices to be within ±180° of `lon`. */
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    let xi = ring[i][0];
    const yi = ring[i][1];
    let xj = ring[j][0];
    const yj = ring[j][1];
    while (xi - lon > 180) xi -= 360;
    while (xi - lon < -180) xi += 360;
    while (xj - lon > 180) xj -= 360;
    while (xj - lon < -180) xj += 360;
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/* ---------- Sidereal-sign lookup ---------- */

/** The 13 zodiacal IAU constellations the ecliptic actually crosses. */
export const ZODIAC_CONSTELLATIONS: { desig: string; name: string }[] = [
  { desig: "Psc", name: "Pisces" },
  { desig: "Ari", name: "Aries" },
  { desig: "Tau", name: "Taurus" },
  { desig: "Gem", name: "Gemini" },
  { desig: "Cnc", name: "Cancer" },
  { desig: "Leo", name: "Leo" },
  { desig: "Vir", name: "Virgo" },
  { desig: "Lib", name: "Libra" },
  { desig: "Sco", name: "Scorpius" },
  { desig: "Oph", name: "Ophiuchus" },
  { desig: "Sgr", name: "Sagittarius" },
  { desig: "Cap", name: "Capricornus" },
  { desig: "Aqr", name: "Aquarius" },
];

/** Tropical zodiac (the "Western astrology" sign), based purely on calendar ecliptic longitude. */
export function tropicalSign(eclipticLongitudeDeg: number): {
  name: string;
  symbol: string;
} {
  const tropical = [
    { name: "Aries", symbol: "♈" },
    { name: "Taurus", symbol: "♉" },
    { name: "Gemini", symbol: "♊" },
    { name: "Cancer", symbol: "♋" },
    { name: "Leo", symbol: "♌" },
    { name: "Virgo", symbol: "♍" },
    { name: "Libra", symbol: "♎" },
    { name: "Scorpio", symbol: "♏" },
    { name: "Sagittarius", symbol: "♐" },
    { name: "Capricorn", symbol: "♑" },
    { name: "Aquarius", symbol: "♒" },
    { name: "Pisces", symbol: "♓" },
  ];
  const lon = ((eclipticLongitudeDeg % 360) + 360) % 360;
  return tropical[Math.floor(lon / 30)];
}

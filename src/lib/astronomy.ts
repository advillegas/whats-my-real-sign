/**
 * Wrappers over `astronomy-engine` (Don Cross, MIT) for the bodies and quantities
 * we display on the sky, plus a small set of celestial-sphere helpers (LMST,
 * RA/Dec → alt/az) used by the observer-aware UI.
 *
 * RA values are returned/consumed in hours, Dec in degrees, and alt/az in
 * degrees, matching the convention used throughout the app.
 */

import {
  AstroTime,
  Body,
  Equator,
  EquatorialCoordinates,
  Observer,
  SiderealTime,
  Ecliptic,
  Vector,
  GeoVector,
} from "astronomy-engine";

export type PlanetId =
  | "Mercury"
  | "Venus"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Moon"
  | "Sun";

export const VISIBLE_PLANETS: PlanetId[] = [
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Moon",
];

const BODY_BY_ID: Record<PlanetId, Body> = {
  Sun: Body.Sun,
  Moon: Body.Moon,
  Mercury: Body.Mercury,
  Venus: Body.Venus,
  Mars: Body.Mars,
  Jupiter: Body.Jupiter,
  Saturn: Body.Saturn,
  Uranus: Body.Uranus,
  Neptune: Body.Neptune,
};

/** Default observer: Earth's geocenter (good enough for an "all-sky" celestial map). */
export const GEOCENTRIC_OBSERVER: Observer = new Observer(0, 0, 0);

/** Geocentric apparent equatorial coordinates of `body` at `date`, in J2000 frame. */
export function bodyEquatorial(body: PlanetId, date: Date): EquatorialCoordinates {
  // ofdate=true → equator of the date (apparent), ofdate=false → J2000.
  // For visual placement among J2000 stars we want J2000 mean equator.
  return Equator(BODY_BY_ID[body], date, GEOCENTRIC_OBSERVER, false, true);
}

export interface BodySky {
  id: PlanetId;
  /** RA in hours, J2000. */
  ra: number;
  /** Dec in degrees, J2000. */
  dec: number;
  /** Earth-body distance, AU. */
  dist: number;
  /** Apparent visual magnitude (rough; not all bodies provide this from astronomy-engine). */
  mag?: number;
  /** Ecliptic longitude in degrees, useful for the Sun's "current zodiac". */
  eclipticLongitude?: number;
}

/** All visible solar-system bodies with their geocentric J2000 RA/Dec at `date`. */
export function allBodySky(date: Date): BodySky[] {
  const out: BodySky[] = [];
  out.push(sunSky(date));
  for (const id of VISIBLE_PLANETS) {
    const eq = bodyEquatorial(id, date);
    out.push({ id, ra: eq.ra, dec: eq.dec, dist: eq.dist });
  }
  return out;
}

/** Sun-only convenience that also returns the ecliptic longitude. */
export function sunSky(date: Date): BodySky {
  const eq = bodyEquatorial("Sun", date);
  // Geocentric vector to the Sun, then convert to ecliptic to get longitude.
  const geo: Vector = GeoVector(Body.Sun, date, true);
  const ecl = Ecliptic(geo);
  return {
    id: "Sun",
    ra: eq.ra,
    dec: eq.dec,
    dist: eq.dist,
    eclipticLongitude: ecl.elon,
  };
}

/** Greenwich Apparent Sidereal Time in hours. */
export function gastHours(date: Date): number {
  const t = new AstroTime(date);
  return SiderealTime(t);
}

/** Local Mean (Apparent) Sidereal Time at `lonDeg` for `date`, in hours. */
export function lmstHours(date: Date, lonDeg: number): number {
  const gast = gastHours(date);
  // Astronomical convention: east longitude positive.
  const lst = gast + lonDeg / 15;
  let h = lst % 24;
  if (h < 0) h += 24;
  return h;
}

export interface AltAz {
  /** Altitude in degrees, -90 (nadir) .. +90 (zenith). */
  alt: number;
  /** Azimuth in degrees, 0 = north, 90 = east, 180 = south, 270 = west. */
  az: number;
}

/**
 * Convert apparent RA/Dec (hours/degrees, J2000 close enough for display purposes)
 * to topocentric altitude/azimuth at observer (`latDeg`, `lonDeg`) for `date`.
 *
 * Uses the standard formulae: H = LST - RA, then
 *   sin(alt) = sin(δ)·sin(φ) + cos(δ)·cos(φ)·cos(H)
 *   tan(az)  = -cos(δ)·sin(H) / (sin(δ)·cos(φ) - cos(δ)·sin(φ)·cos(H))
 * Azimuth is normalized to [0, 360), measured eastward from north.
 */
export function raDecToAltAz(
  raHours: number,
  decDeg: number,
  latDeg: number,
  lonDeg: number,
  date: Date,
): AltAz {
  const lst = lmstHours(date, lonDeg);
  const haDeg = ((lst - raHours) * 15 + 540) % 360 - 180;
  const ha = (haDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const sinAlt =
    Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const y = -Math.cos(dec) * Math.sin(ha);
  const x =
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha);
  let az = Math.atan2(y, x);
  if (az < 0) az += 2 * Math.PI;
  return { alt: (alt * 180) / Math.PI, az: (az * 180) / Math.PI };
}

export { AstroTime };

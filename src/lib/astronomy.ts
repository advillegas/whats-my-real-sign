/**
 * Wrappers over `astronomy-engine` (Don Cross, MIT) for the bodies and quantities
 * we display on the sky. All RA values are returned in hours, Dec in degrees,
 * matching the convention used by the rest of the app.
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

export { AstroTime };

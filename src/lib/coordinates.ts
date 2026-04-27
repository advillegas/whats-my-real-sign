/**
 * Celestial-coordinate helpers.
 *
 * The scene uses a left-handed convention friendly to three.js' default camera:
 *   +X  → toward RA = 0h, Dec = 0° (vernal equinox)
 *   +Y  → toward the north celestial pole (Dec = +90°)
 *   +Z  → toward RA = 6h, Dec = 0°
 *
 * RA values can be supplied in either hours [0, 24) or degrees [-180, 180]
 * (the convention used by d3-celestial GeoJSON files).
 */

import { Vector3 } from "three";

export const CELESTIAL_RADIUS = 1000;

/** Convert RA (hours) + Dec (degrees) to a unit Vector3. */
export function raDecHoursToVec3(
  raHours: number,
  decDeg: number,
  radius: number = 1,
  out?: Vector3,
): Vector3 {
  const raRad = (raHours * 15 * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const cd = Math.cos(decRad);
  const v = out ?? new Vector3();
  v.set(
    radius * cd * Math.cos(raRad),
    radius * Math.sin(decRad),
    radius * cd * Math.sin(raRad),
  );
  return v;
}

/** Convert RA (degrees, -180..180 OK) + Dec (degrees) to a unit Vector3. */
export function raDecDegToVec3(
  raDeg: number,
  decDeg: number,
  radius: number = 1,
  out?: Vector3,
): Vector3 {
  // Normalize to [0, 360)
  const ra = ((raDeg % 360) + 360) % 360;
  return raDecHoursToVec3(ra / 15, decDeg, radius, out);
}

/** Convert a unit Vector3 back to (RA hours, Dec degrees). */
export function vec3ToRaDecHours(v: Vector3): { raHours: number; decDeg: number } {
  const r = v.length();
  if (r === 0) return { raHours: 0, decDeg: 0 };
  const dec = Math.asin(v.y / r);
  let ra = Math.atan2(v.z, v.x);
  if (ra < 0) ra += 2 * Math.PI;
  return {
    raHours: (ra * 180) / Math.PI / 15,
    decDeg: (dec * 180) / Math.PI,
  };
}

/** Normalize an RA value (any unit) into a value in degrees on [0, 360). */
export function normalizeRaDeg(raDeg: number): number {
  return ((raDeg % 360) + 360) % 360;
}

/** Angular separation in radians between two unit-sphere vectors. */
export function angularSeparation(a: Vector3, b: Vector3): number {
  const dot = Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())));
  return Math.acos(dot);
}

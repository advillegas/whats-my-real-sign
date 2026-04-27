/**
 * Print the geocentric apparent sky positions of all major bodies for
 * 2026-04-26, plus their separation from the Sun. Useful for working out
 * which body shows up where in the rendered scene.
 */

import { Body, Equator, Observer } from "astronomy-engine";

const date = new Date("2026-04-26T20:00:00Z");
const observer = new Observer(0, 0, 0);

const BODIES = [
  Body.Sun,
  Body.Moon,
  Body.Mercury,
  Body.Venus,
  Body.Mars,
  Body.Jupiter,
  Body.Saturn,
  Body.Uranus,
  Body.Neptune,
];

const sunEq = Equator(Body.Sun, date, observer, false, true);
console.log(`Date: ${date.toISOString()}`);
console.log("name      RA(h)   Dec(°)   dist(AU)   Δ from Sun (°)");
for (const b of BODIES) {
  const eq = Equator(b, date, observer, false, true);
  const dRa = ((eq.ra - sunEq.ra) * 15 + 360) % 360;
  const ra = Math.min(dRa, 360 - dRa);
  const ddec = eq.dec - sunEq.dec;
  const sep = Math.sqrt(ra * ra + ddec * ddec);
  console.log(
    `${b.padEnd(9)} ${eq.ra.toFixed(2).padStart(5)}   ${eq.dec
      .toFixed(2)
      .padStart(6)}    ${eq.dist.toFixed(3).padStart(8)}    ${sep
      .toFixed(1)
      .padStart(5)}`,
  );
}

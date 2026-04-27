"use client";

/**
 * AR-mode camera math.
 *
 * One job: turn a `DeviceOrientationEvent` plus the observer's
 * location/clock into the THREE camera quaternion that points the camera
 * through the back of the device at the matching patch of celestial
 * sphere. Lift the phone toward the real Sun → the synthetic Sun lands at
 * screen centre.
 *
 * Pipeline (all inside `buildArCameraQuat`):
 *
 *   1. (alpha, beta, gamma, screenAngle, yawOffset, flipHorizontalAlpha)
 *      → device-to-THREE-world quaternion.
 *
 *      Standard `THREE.DeviceOrientationControls` recipe — Z-X'-Y'' Euler
 *      angles, then a -π/2 rotation around X so the camera looks out the
 *      *back* of the device, then a -screenAngle rotation around Z so the
 *      math survives landscape mode. Two extra knobs:
 *
 *       • `flipHorizontalAlpha` — most browsers (iOS Safari + nearly all
 *         Android Chrome builds) report alpha as a CW compass heading,
 *         not the W3C-spec CCW yaw. With the flag on (the default) we
 *         negate alpha to put it back into W3C terms. The "Mirror sky"
 *         button in the AR overlay exposes this for spec-literal devices.
 *
 *       • `yawOffsetRad` — manual heading nudge the user dials in by
 *         dragging the AR overlay. iOS references alpha to whatever
 *         orientation the page loaded in (not true north), and even on
 *         Android with absolute events the magnetometer is routinely off
 *         by 5-15° from local interference / declination. We bake the
 *         offset directly into alpha (same units, same axis), which means
 *         spec-normalization and user-calibration commute and there's no
 *         order-of-operations ambiguity.
 *
 *   2. Extract device-back (camera forward) and device-screen-up (camera
 *      up) vectors in the THREE world frame (+X east, +Y up, -Z north).
 *
 *   3. World vector → (alt, az) → (RA, Dec) → scene-frame Vec3.
 *      The atan2 form is just the inverse of the standard ENU spherical
 *      formula; `astronomy-engine` handles the alt/az → equatorial step;
 *      `raDecHoursToVec3` lands us in the same celestial frame the stars
 *      are rendered in. We have to round-trip through equatorial because
 *      the scene frame is fixed to the stars (J2000-ish) while the world
 *      frame is fixed to the observer — the rotation between them spins
 *      one full turn per sidereal day.
 *
 *   4. `Matrix4.lookAt(origin, lookCelestial, upCelestial)` → quaternion.
 *      lookAt builds a proper rotation from "look here, with this up"
 *      regardless of frame handedness, so the result is a clean
 *      quaternion (and so slerpable for smoothing).
 *
 * Returns null when any sensor channel is unavailable.
 */

import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import { altAzToRaDec } from "./astronomy";
import { raDecHoursToVec3 } from "./coordinates";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const Z_AXIS = new Vector3(0, 0, 1);
// THREE's correction: a phone held flat with screen up has its back along
// world -Z, but THREE camera convention also looks down -Z. The -π/2
// rotation around X swings the camera so it looks out the *back* of the
// device instead of out the *top*.
const Q_PHONE_TO_WORLD = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);

// All scratch is module-level — the sensor handler runs at sensor rate
// (~60 Hz) and allocating per call would thrash the GC.
const _euler = new Euler();
const _qDev = new Quaternion();
const _qScreen = new Quaternion();
const _vBack = new Vector3();
const _vUp = new Vector3();
const _vLookCel = new Vector3();
const _vUpCel = new Vector3();
const _origin = new Vector3();
const _lookMat = new Matrix4();

export interface ArCameraInput {
  /** `event.alpha` in degrees, or null when missing. */
  alpha: number | null;
  /** `event.beta` in degrees, or null when missing. */
  beta: number | null;
  /** `event.gamma` in degrees, or null when missing. */
  gamma: number | null;
  /** `screen.orientation.angle` in degrees (0 portrait, 90 landscape, …). */
  screenAngle: number;
  /** Observer latitude in degrees (+N). */
  latDeg: number;
  /** Observer longitude in degrees (+E). */
  lonDeg: number;
  /** Date used for the sidereal-time computation. */
  date: Date;
  /**
   * User-applied yaw correction in radians, mutated live by the AR drag
   * handler in `CameraRig`. Positive = synthetic sky shifts right on
   * screen (matches the intuitive direction of a rightward drag). Reset
   * to 0 when AR mode toggles, or when the user flips "Mirror sky" — its
   * old value is measured in the now-opposite frame and would land
   * somewhere random.
   */
  yawOffsetRad: number;
  /**
   * Negate alpha for devices that report it as a CW compass heading
   * (iOS Safari + most Android browsers) instead of the W3C-spec CCW yaw.
   * Defaults to true; the AR overlay exposes a toggle for the rare
   * spec-literal device.
   */
  flipHorizontalAlpha: boolean;
}

export function buildArCameraQuat(
  input: ArCameraInput,
  outQ: Quaternion = new Quaternion(),
): Quaternion | null {
  const {
    alpha,
    beta,
    gamma,
    screenAngle,
    latDeg,
    lonDeg,
    date,
    yawOffsetRad,
    flipHorizontalAlpha,
  } = input;
  if (alpha == null || beta == null || gamma == null) return null;

  // ── 1. device → THREE-world quaternion ──────────────────────────────
  // Spec normalisation (CW-heading → CCW-yaw) and the user's calibration
  // nudge are two independent corrections to the same scalar, applied in
  // the same place so they can't fight each other.
  const alphaCcw = flipHorizontalAlpha ? -alpha : alpha;
  const alphaUsed = alphaCcw + yawOffsetRad * RAD2DEG;
  _euler.set(beta * DEG2RAD, alphaUsed * DEG2RAD, -gamma * DEG2RAD, "YXZ");
  _qDev.setFromEuler(_euler);
  _qDev.multiply(Q_PHONE_TO_WORLD);
  _qScreen.setFromAxisAngle(Z_AXIS, -screenAngle * DEG2RAD);
  _qDev.multiply(_qScreen);

  // ── 2. device-back & device-screen-up in world frame ────────────────
  _vBack.set(0, 0, -1).applyQuaternion(_qDev);
  _vUp.set(0, 1, 0).applyQuaternion(_qDev);

  // ── 3. world Vec3 → (alt, az) → (RA, Dec) → scene-frame Vec3 ────────
  // World frame: +X east, +Y up, -Z north. Same atan2 formula for both.
  const lookAlt = Math.asin(clamp(_vBack.y, -1, 1)) * RAD2DEG;
  const lookAz = wrapAz(Math.atan2(_vBack.x, -_vBack.z) * RAD2DEG);
  const upAlt = Math.asin(clamp(_vUp.y, -1, 1)) * RAD2DEG;
  const upAz = wrapAz(Math.atan2(_vUp.x, -_vUp.z) * RAD2DEG);

  const lookEq = altAzToRaDec(lookAlt, lookAz, latDeg, lonDeg, date);
  const upEq = altAzToRaDec(upAlt, upAz, latDeg, lonDeg, date);

  raDecHoursToVec3(lookEq.raHours, lookEq.decDeg, 1, _vLookCel);
  raDecHoursToVec3(upEq.raHours, upEq.decDeg, 1, _vUpCel);

  // ── 4. scene-frame lookAt → camera quaternion ───────────────────────
  // Camera at the celestial-sphere centre, looking at the celestial point
  // matched to the device-back direction, with the local zenith mapped to
  // screen-top. Using world +Y as up here would tilt the synthetic horizon
  // by 90° − latitude (world +Y is the celestial pole, not the local
  // zenith) — that's the "horizon nearly vertical" bug from earlier.
  _origin.set(0, 0, 0);
  _lookMat.lookAt(_origin, _vLookCel, _vUpCel);
  return outQ.setFromRotationMatrix(_lookMat);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function wrapAz(deg: number): number {
  let v = deg % 360;
  if (v < 0) v += 360;
  return v;
}

/**
 * Read the current screen orientation angle in degrees. Falls back to the
 * deprecated `window.orientation` for older Safari builds, then 0.
 */
export function readScreenAngle(): number {
  if (typeof window === "undefined") return 0;
  const o = (window.screen as Screen & { orientation?: { angle: number } })
    .orientation;
  if (o && typeof o.angle === "number") return o.angle;
  const legacy = (window as Window & { orientation?: number }).orientation;
  if (typeof legacy === "number") return legacy;
  return 0;
}

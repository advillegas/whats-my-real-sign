/**
 * Pure math for translating a phone's `DeviceOrientationEvent` into the
 * altitude/azimuth direction the back of the device is currently pointing.
 *
 * Background: browsers expose three Euler angles (alpha, beta, gamma) that
 * describe the device's orientation relative to a local east-north-up frame.
 * THREE's `DeviceOrientationControls` uses the same recipe; we replicate it
 * here without the React/three-specific bits so the function stays unit-
 * testable.
 *
 * Output azimuth is in the astronomy convention (0° = north, 90° = east,
 * clockwise), and altitude is in degrees above the horizon.
 *
 * Magnetic-vs-true-north correction is intentionally deferred — most users
 * won't notice the typical 0–15° offset, and a manual "calibrate to a known
 * object" knob can be layered on top later.
 */

import { Euler, Quaternion, Vector3 } from "three";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);
// THREE's correction: a phone held vertical with its screen facing the user
// has its back along world -Z, but the camera convention also looks down -Z.
// The −π/2 rotation around X aligns the device "back" with the world frame.
const Q_PHONE_TO_WORLD = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);

const tmpEuler = new Euler();
const tmpQ = new Quaternion();
const tmpScreenQ = new Quaternion();
const tmpHeadingQ = new Quaternion();
const tmpDir = new Vector3();

export interface OrientationInput {
  /** `event.alpha` in degrees, or null when unavailable. */
  alpha: number | null;
  /** `event.beta` in degrees, or null. */
  beta: number | null;
  /** `event.gamma` in degrees, or null. */
  gamma: number | null;
  /**
   * Current screen orientation in degrees (0 portrait, 90 landscape-left,
   * etc). Reads from `screen.orientation.angle` or `window.orientation`.
   */
  screenAngle: number;
  /**
   * Manual user-applied yaw correction in radians, rotating the synthetic
   * sky around the local zenith. Lets the user drag the AR overlay to
   * align it with reality — alpha is referenced to whatever orientation
   * the page loaded in on iOS (and even on Android with absolute events
   * the magnetometer can be off by 5–15° depending on local interference),
   * so a manual nudge knob is the only fully reliable calibration.
   */
  yawOffsetRad?: number;
}

export interface AltAzDeg {
  altDeg: number;
  azDeg: number;
}

/**
 * The device's full orientation expressed as alt/az pairs for both the
 * back-of-phone direction (where the rear camera points → "look") and the
 * top-of-phone direction (→ "up", what the user calls screen-top).
 *
 * Both are needed because just knowing where the phone aims doesn't tell us
 * how the phone is rolled around that axis. The `up` vector is what lets the
 * rendered view roll correctly when the phone tilts sideways AND lets us
 * align the local zenith (not the celestial pole) with screen-top.
 */
export interface DeviceOrientationLookUp {
  look: AltAzDeg;
  up: AltAzDeg;
}

/**
 * Build the rotation that takes a vector expressed in the device's local
 * frame (right=+X, top=+Y, out-of-screen=+Z) into a Three.js-style world
 * frame (east=+X, up=+Y, south=+Z, equivalently north=-Z).
 *
 * Recipe matches the long-standing `THREE.DeviceOrientationControls`:
 *   1. Apply the device's intrinsic Z-X'-Y'' Euler angles
 *   2. Multiply by a -π/2 rotation around X so the THREE camera ends up
 *      looking out the *back* of the phone instead of out the *top*.
 *   3. Multiply by a -screenAngle rotation around Z so the math holds when
 *      the user rotates the phone into landscape mode.
 */
function deviceOrientationQuaternion(
  input: OrientationInput,
  outQ: Quaternion = new Quaternion(),
): Quaternion | null {
  const { alpha, beta, gamma, screenAngle, yawOffsetRad } = input;
  if (alpha == null || beta == null || gamma == null) return null;

  tmpEuler.set(beta * DEG2RAD, alpha * DEG2RAD, -gamma * DEG2RAD, "YXZ");
  outQ.setFromEuler(tmpEuler);
  outQ.multiply(Q_PHONE_TO_WORLD);
  tmpScreenQ.setFromAxisAngle(Z_AXIS, -screenAngle * DEG2RAD);
  outQ.multiply(tmpScreenQ);

  // User-supplied calibration nudge. Premultiplying rotates the result
  // around +Y in the local-up frame, so the back-of-device azimuth shifts
  // by `yawOffsetRad`. (Positive +Y rotation moves vectors counter-
  // clockwise / decreasing azimuth, hence the negation.)
  if (yawOffsetRad && Number.isFinite(yawOffsetRad)) {
    tmpHeadingQ.setFromAxisAngle(Y_AXIS, -yawOffsetRad);
    outQ.premultiply(tmpHeadingQ);
  }

  return outQ;
}

/**
 * Convert a unit vector in the local east-north-up world frame used above
 * (+X east, +Y up, -Z north) into astronomy-convention alt/az.
 */
function vecToAltAz(v: Vector3): AltAzDeg {
  const altDeg = Math.asin(Math.max(-1, Math.min(1, v.y))) * RAD2DEG;
  let azRad = Math.atan2(v.x, -v.z);
  if (azRad < 0) azRad += 2 * Math.PI;
  return { altDeg, azDeg: azRad * RAD2DEG };
}

/**
 * Translate a `DeviceOrientationEvent` to the altitude/azimuth the back of
 * the device is pointing. Returns null when any input angle is missing.
 */
export function deviceOrientationToAltAz(input: OrientationInput): AltAzDeg | null {
  const q = deviceOrientationQuaternion(input, tmpQ);
  if (!q) return null;
  tmpDir.set(0, 0, -1).applyQuaternion(q);
  return vecToAltAz(tmpDir);
}

/**
 * Translate a `DeviceOrientationEvent` to BOTH the look and screen-up
 * directions in alt/az. Used by AR mode so we can build a full camera
 * orientation (not just yaw/pitch) and keep the synthetic horizon glued to
 * the real horizon as the phone rolls.
 */
const tmpLookV = new Vector3();
const tmpUpV = new Vector3();
export function deviceOrientationToLookUp(
  input: OrientationInput,
): DeviceOrientationLookUp | null {
  const q = deviceOrientationQuaternion(input, tmpQ);
  if (!q) return null;
  tmpLookV.set(0, 0, -1).applyQuaternion(q);
  tmpUpV.set(0, 1, 0).applyQuaternion(q);
  return {
    look: vecToAltAz(tmpLookV),
    up: vecToAltAz(tmpUpV),
  };
}

/**
 * One-pole low-pass filter for yaw/pitch readings. Handles yaw wraparound
 * (so a 359° → 1° reading doesn't smear across 358°).
 *
 * `alpha` is the per-sample mix factor: 0 = ignore the new sample, 1 = no
 * smoothing. Around 0.18 at ~60 Hz gives a roughly 10 Hz cutoff which feels
 * responsive but kills the high-frequency gyro jitter.
 */
export function lowPassYawPitch(
  prev: { yaw: number; pitch: number } | null,
  next: { yaw: number; pitch: number },
  alpha: number,
): { yaw: number; pitch: number } {
  if (!prev) return next;

  let dy = next.yaw - prev.yaw;
  if (dy > Math.PI) dy -= Math.PI * 2;
  else if (dy < -Math.PI) dy += Math.PI * 2;

  let yaw = prev.yaw + dy * alpha;
  // Renormalize to (-PI, PI] to avoid unbounded drift.
  if (yaw > Math.PI) yaw -= Math.PI * 2;
  else if (yaw < -Math.PI) yaw += Math.PI * 2;

  const pitch = prev.pitch + (next.pitch - prev.pitch) * alpha;
  return { yaw, pitch };
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

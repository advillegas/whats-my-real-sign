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
}

export interface AltAzDeg {
  altDeg: number;
  azDeg: number;
}

/**
 * Translate a `DeviceOrientationEvent` to the altitude/azimuth the back of
 * the device is pointing. Returns null when any input angle is missing
 * (e.g. browser hasn't delivered a reading yet).
 */
export function deviceOrientationToAltAz(input: OrientationInput): AltAzDeg | null {
  const { alpha, beta, gamma, screenAngle } = input;
  if (alpha == null || beta == null || gamma == null) return null;

  // ZXY Euler order in radians, the convention DeviceOrientationEvent uses.
  tmpEuler.set(beta * DEG2RAD, alpha * DEG2RAD, -gamma * DEG2RAD, "YXZ");
  tmpQ.setFromEuler(tmpEuler);
  tmpQ.multiply(Q_PHONE_TO_WORLD);
  tmpScreenQ.setFromAxisAngle(Z_AXIS, -screenAngle * DEG2RAD);
  tmpQ.multiply(tmpScreenQ);

  // Back-of-phone direction is -Z in the device frame.
  tmpDir.set(0, 0, -1).applyQuaternion(tmpQ);

  // World convention here: y up, -z forward, x right. After the corrections
  // above, the phone-back vector reads as:
  //   y → altitude (up component)
  //   x, z → horizontal projection; azimuth measured clockwise from north.
  const altDeg = Math.asin(Math.max(-1, Math.min(1, tmpDir.y))) * RAD2DEG;

  // Azimuth: 0 = north (-z), 90 = east (+x), 180 = south, 270 = west.
  let azRad = Math.atan2(tmpDir.x, -tmpDir.z);
  if (azRad < 0) azRad += 2 * Math.PI;
  const azDeg = azRad * RAD2DEG;

  return { altDeg, azDeg };
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

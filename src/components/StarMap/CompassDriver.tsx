"use client";

/**
 * Subscribes to `DeviceOrientationEvent` while compass mode is active and
 * translates each reading into the FULL camera orientation that aligns the
 * on-screen sky with the patch the phone is physically pointing at.
 *
 * Pipeline (per event):
 *   device orientation → alt/az pair (back-of-phone "look" + top-of-phone "up")
 *      altAzToRaDec    → RA/Dec for each at the current observer + clock
 *      raDecToVec3     → unit direction in the scene celestial frame
 *      Matrix4.lookAt  → target camera quaternion (with local zenith as up)
 *          slerp       → smoothed quaternion written to compassState
 *
 * Why both look AND up?
 *   The scene's world Y-axis is the *celestial* north pole, not the *local*
 *   zenith. If we only fed in a look direction and let three.js use its
 *   default up, the rendered horizon would tilt by (90° − observer.lat)
 *   relative to the real horizon. Driving the camera by quaternion fixes
 *   that and also lets the view roll when the phone tilts sideways.
 *
 * Renders nothing.
 */

import { useEffect } from "react";
import { Matrix4, Quaternion, Vector3 } from "three";
import { useViewer } from "@/store/viewer-store";
import { altAzToRaDec } from "@/lib/astronomy";
import { raDecHoursToVec3 } from "@/lib/coordinates";
import {
  deviceOrientationToLookUp,
  readScreenAngle,
} from "@/lib/compass-math";
import { compassState } from "@/lib/compass-state";

// Higher = snappier but jitterier. 0.25 at ~60 Hz reads as a ~15 Hz cutoff,
// which feels alive without being twitchy.
const SMOOTHING_ALPHA = 0.25;

interface PermissionedDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export function CompassDriver() {
  const compassMode = useViewer((s) => s.compassMode);
  const observer = useViewer((s) => s.observer);
  const setCompassMode = useViewer((s) => s.setCompassMode);

  // Auto-disable compass if the observer is cleared while it's running —
  // the alt/az → RA/Dec math is undefined without a location.
  useEffect(() => {
    if (compassMode && !observer) {
      setCompassMode(false);
    }
  }, [compassMode, observer, setCompassMode]);

  // Wire the listener.
  useEffect(() => {
    if (!compassMode) {
      compassState.hasReading = false;
      compassState.yawOffsetRad = 0;
      return;
    }
    // Fresh AR session → start with no calibration offset; the user can
    // drag to nudge.
    compassState.yawOffsetRad = 0;
    if (typeof window === "undefined") return;
    if (typeof DeviceOrientationEvent === "undefined") return;

    let screenAngle = readScreenAngle();
    let firstReading = true;

    const onScreenChange = () => {
      screenAngle = readScreenAngle();
    };

    const handle = (e: DeviceOrientationEvent) => {
      const state = useViewer.getState();
      const obs = state.observer;
      if (!obs) return;

      const lookUp = deviceOrientationToLookUp({
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        screenAngle,
        // User-applied calibration: a single horizontal yaw offset that
        // the AR drag handler in `CameraRig` mutates live. Without this,
        // alpha is relative to the orientation the page loaded in (iOS),
        // so the synthetic sky is rotated by an arbitrary offset and a
        // perfectly-aimed phone can have its target completely off-screen.
        yawOffsetRad: compassState.yawOffsetRad,
      });
      if (!lookUp) return;

      // Both directions get the same alt/az → RA/Dec → world-Vec3 treatment so
      // they stay perfectly orthogonal in the celestial frame.
      const lookEq = altAzToRaDec(
        lookUp.look.altDeg,
        lookUp.look.azDeg,
        obs.lat,
        obs.lon,
        state.date,
      );
      const upEq = altAzToRaDec(
        lookUp.up.altDeg,
        lookUp.up.azDeg,
        obs.lat,
        obs.lon,
        state.date,
      );

      raDecHoursToVec3(lookEq.raHours, lookEq.decDeg, 1, _lookCel);
      raDecHoursToVec3(upEq.raHours, upEq.decDeg, 1, _upCel);

      // Build the camera quaternion via Matrix4.lookAt(eye, target, up). Three's
      // convention: camera looks down its local -Z, so a lookAt matrix with
      // target = look gives a rotation that points the camera at it. We pass
      // the celestial-frame up vector so screen-top = local zenith, not the
      // celestial pole — this is what fixes the "horizon nearly vertical" bug.
      _lookMat.lookAt(_origin, _lookCel, _upCel);
      _targetQ.setFromRotationMatrix(_lookMat);

      if (firstReading) {
        _smoothedQ.copy(_targetQ);
        firstReading = false;
      } else {
        // Take the shortest arc on the 4-sphere so we don't ever flip.
        if (_smoothedQ.dot(_targetQ) < 0) {
          _targetQ.x = -_targetQ.x;
          _targetQ.y = -_targetQ.y;
          _targetQ.z = -_targetQ.z;
          _targetQ.w = -_targetQ.w;
        }
        _smoothedQ.slerp(_targetQ, SMOOTHING_ALPHA);
      }

      compassState.qx = _smoothedQ.x;
      compassState.qy = _smoothedQ.y;
      compassState.qz = _smoothedQ.z;
      compassState.qw = _smoothedQ.w;
      compassState.hasReading = true;
      compassState.lastUpdateMs = performance.now();
    };

    // Prefer the absolute (true-north-referenced) variant where available;
    // fall back to the bare event everywhere else.
    const useAbsolute = "ondeviceorientationabsolute" in window;
    const eventName = useAbsolute ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(eventName, handle as EventListener, true);

    const sc = (window.screen as Screen & { orientation?: EventTarget })
      .orientation;
    if (sc && typeof sc.addEventListener === "function") {
      sc.addEventListener("change", onScreenChange);
    } else {
      window.addEventListener("orientationchange", onScreenChange);
    }

    return () => {
      window.removeEventListener(eventName, handle as EventListener, true);
      if (sc && typeof sc.removeEventListener === "function") {
        sc.removeEventListener("change", onScreenChange);
      } else {
        window.removeEventListener("orientationchange", onScreenChange);
      }
      compassState.hasReading = false;
    };
  }, [compassMode]);

  return null;
}

// Per-tick scratch — kept module-level so the high-frequency event handler
// allocates nothing.
const _lookCel = new Vector3();
const _upCel = new Vector3();
const _origin = new Vector3(0, 0, 0);
const _lookMat = new Matrix4();
const _targetQ = new Quaternion();
const _smoothedQ = new Quaternion();

/**
 * Imperative iOS-style permission prompt. Must be called from within a user
 * gesture (button click) or Safari throws. Returns true if the browser
 * already grants orientation events without a prompt.
 */
export async function requestCompassPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const ctor = DeviceOrientationEvent as unknown as PermissionedDeviceOrientationEvent;
  if (typeof ctor.requestPermission !== "function") return true;
  try {
    const result = await ctor.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

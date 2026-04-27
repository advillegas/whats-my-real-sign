"use client";

/**
 * Subscribes to `DeviceOrientationEvent` while AR/compass mode is active
 * and writes the resulting smoothed camera quaternion to `compassState`,
 * where `CameraRig` reads it once per frame.
 *
 * All the math lives in `lib/compass-math.ts` — this file just owns the
 * lifecycle (event listeners, screen-orientation tracking, the slerp
 * smoothing buffer) and the iOS permission prompt.
 *
 * Renders nothing.
 */

import { useEffect } from "react";
import { Quaternion } from "three";

import { useViewer } from "@/store/viewer-store";
import { buildArCameraQuat, readScreenAngle } from "@/lib/compass-math";
import { compassState } from "@/lib/compass-state";

// Per-tick mix factor for the slerp into compassState. Higher = snappier
// but jitterier. 0.35 at ~60 Hz reads as a ~21 Hz cutoff — alive without
// being noisy. (We deliberately let the slerp do all the smoothing now;
// the old yaw/pitch low-pass added a second filter that just felt laggy.)
const SMOOTHING_ALPHA = 0.35;

interface PermissionedDeviceOrientationEvent {
  requestPermission?: () => Promise<"granted" | "denied">;
}

const _targetQ = new Quaternion();
const _smoothedQ = new Quaternion();

export function CompassDriver() {
  const compassMode = useViewer((s) => s.compassMode);
  const observer = useViewer((s) => s.observer);
  const setCompassMode = useViewer((s) => s.setCompassMode);

  // The alt/az → RA/Dec math is undefined without a location, so auto-bail
  // if the observer is cleared while AR is running.
  useEffect(() => {
    if (compassMode && !observer) {
      setCompassMode(false);
    }
  }, [compassMode, observer, setCompassMode]);

  useEffect(() => {
    if (!compassMode) {
      compassState.hasReading = false;
      compassState.yawOffsetRad = 0;
      return;
    }
    // Fresh AR session → start with zero calibration; the user drags to
    // nudge from there.
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

      const target = buildArCameraQuat(
        {
          alpha: e.alpha,
          beta: e.beta,
          gamma: e.gamma,
          screenAngle,
          latDeg: obs.lat,
          lonDeg: obs.lon,
          date: state.date,
          yawOffsetRad: compassState.yawOffsetRad,
          flipHorizontalAlpha: compassState.flipHorizontalAlpha,
        },
        _targetQ,
      );
      if (!target) return;

      if (firstReading) {
        _smoothedQ.copy(_targetQ);
        firstReading = false;
      } else {
        // Shortest-arc slerp: flip the target if it's on the far hemisphere
        // of the 4-sphere from the current smoothed quaternion. Without
        // this, slerp can take the long way round and the camera spins
        // when the device crosses certain orientations.
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

    // Prefer the absolute (true-north-referenced) variant where it exists;
    // fall back to the bare event everywhere else. Magnetic-vs-true-north
    // and page-load offsets are absorbed by the user's drag calibration.
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

/**
 * Imperative iOS-style permission prompt. Must be called from within a
 * user gesture (button click) or Safari throws. Returns true if the
 * browser already grants orientation events without prompting.
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

"use client";

/**
 * Subscribes to `DeviceOrientationEvent` while compass mode is active and
 * translates each reading into the yaw/pitch the camera should adopt so the
 * on-screen sky matches the patch the phone is physically pointing at.
 *
 * Pipeline (per event):
 *   device orientation  →  alt/az (back-of-phone)
 *      altAzToRaDec     →  RA/Dec at the current observer + clock
 *      raDecToVec3      →  unit direction in scene world frame
 *      dirToYawPitch    →  yaw/pitch matching CameraRig's convention
 *      lowPassYawPitch  →  jitter-smoothed values written to compassState
 *
 * Renders nothing.
 */

import { useEffect } from "react";
import { Vector3, MathUtils } from "three";
import { useViewer } from "@/store/viewer-store";
import { altAzToRaDec } from "@/lib/astronomy";
import { raDecHoursToVec3 } from "@/lib/coordinates";
import {
  deviceOrientationToAltAz,
  lowPassYawPitch,
  readScreenAngle,
} from "@/lib/compass-math";
import { compassState } from "@/lib/compass-state";

const SMOOTHING_ALPHA = 0.18;

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
      return;
    }
    if (typeof window === "undefined") return;
    if (typeof DeviceOrientationEvent === "undefined") return;

    let screenAngle = readScreenAngle();
    let lastSmoothed: { yaw: number; pitch: number } | null = null;

    const onScreenChange = () => {
      screenAngle = readScreenAngle();
    };

    const handle = (e: DeviceOrientationEvent) => {
      const state = useViewer.getState();
      const obs = state.observer;
      if (!obs) return;
      const altAz = deviceOrientationToAltAz({
        alpha: e.alpha,
        beta: e.beta,
        gamma: e.gamma,
        screenAngle,
      });
      if (!altAz) return;

      const { raHours, decDeg } = altAzToRaDec(
        altAz.altDeg,
        altAz.azDeg,
        obs.lat,
        obs.lon,
        state.date,
      );

      const dir = raDecHoursToVec3(raHours, decDeg, 1, _tmpDir);
      const yaw = Math.atan2(dir.z, dir.x);
      const pitch = Math.asin(MathUtils.clamp(dir.y, -1, 1));

      lastSmoothed = lowPassYawPitch(lastSmoothed, { yaw, pitch }, SMOOTHING_ALPHA);
      compassState.yaw = lastSmoothed.yaw;
      compassState.pitch = lastSmoothed.pitch;
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

const _tmpDir = new Vector3();

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

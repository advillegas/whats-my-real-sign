"use client";

/**
 * Projects the currently `selected` celestial object into screen-space every
 * frame and writes the result into `arTargetState`. A DOM-based AR overlay
 * (`<ARTargetIndicator />`) reads from that state to draw an arrow toward
 * the target (when off-screen) or a halo around it (when on-screen).
 *
 * Lives inside the R3F Canvas because we need the live camera matrices.
 * Renders nothing.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useViewer } from "@/store/viewer-store";
import { raDecHoursToVec3 } from "@/lib/coordinates";
import { allBodySky } from "@/lib/astronomy";
import { arTargetState } from "@/lib/ar-target-state";

const _targetWorld = new Vector3();
const _targetCam = new Vector3();
const _camForward = new Vector3();

export function ARTargetTracker() {
  const { camera } = useThree();

  useFrame(() => {
    const s = useViewer.getState();
    if (!s.compassMode || !s.selected) {
      arTargetState.active = false;
      return;
    }

    // Solar-system bodies drift across the sky on the timescale of a long
    // AR session — recompute from the current clock so the arrow doesn't
    // lag behind the actual target.
    let raHours = s.selected.ra;
    let decDeg = s.selected.dec;
    if (s.selected.kind === "planet") {
      const live = allBodySky(s.date).find((b) => b.id === s.selected!.id);
      if (live) {
        raHours = live.ra;
        decDeg = live.dec;
      }
    }
    raDecHoursToVec3(raHours, decDeg, 1, _targetWorld);

    // Camera-space coords. Three's camera looks down its local -Z, so a
    // positive `z` here means "behind me".
    _targetCam.copy(_targetWorld).applyMatrix4(camera.matrixWorldInverse);

    // Angular separation from the screen-center direction (= camera forward).
    _camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dot = Math.max(-1, Math.min(1, _camForward.dot(_targetWorld)));
    const sepRad = Math.acos(dot);
    const separationDeg = (sepRad * 180) / Math.PI;

    let ndcX = 0;
    let ndcY = 0;
    let onScreen = false;

    const fovRad = ("fov" in camera ? (camera as { fov: number }).fov : 55) * Math.PI / 180;
    const aspect =
      "aspect" in camera ? (camera as { aspect: number }).aspect : 1;
    const tanHalfV = Math.tan(fovRad / 2);
    const tanHalfH = tanHalfV * aspect;

    if (_targetCam.z < -1e-4) {
      // In front of the camera. Convert (x, y) at depth -z into NDC by
      // dividing by the half-width / half-height of the view frustum at
      // that depth.
      const depth = -_targetCam.z;
      ndcX = _targetCam.x / depth / tanHalfH;
      ndcY = _targetCam.y / depth / tanHalfV;
      onScreen = Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1;
    } else {
      // Behind the camera. There's no real screen position; project the
      // direction vector onto the screen-plane and flip so the arrow points
      // *outward* toward where the target actually is.
      const len = Math.hypot(_targetCam.x, _targetCam.y) || 1e-6;
      ndcX = -_targetCam.x / len;
      ndcY = -_targetCam.y / len;
      onScreen = false;
    }

    arTargetState.active = true;
    arTargetState.onScreen = onScreen;
    arTargetState.ndcX = ndcX;
    arTargetState.ndcY = ndcY;
    arTargetState.separationDeg = separationDeg;
    arTargetState.name = s.selected.name ?? "";
    arTargetState.lastUpdateMs = performance.now();
  });

  return null;
}

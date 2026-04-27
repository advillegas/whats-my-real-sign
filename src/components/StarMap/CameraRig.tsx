"use client";

/**
 * First-person "look around the sky" camera, plus quaternion-style tweens to
 * fly to a requested RA/Dec when the store's cameraTarget changes.
 *
 * Camera always sits at the origin. Stars and other celestial objects sit on
 * a sphere of radius CELESTIAL_RADIUS; the camera quaternion alone determines
 * what's on screen. Mouse drag yaws/pitches; wheel zooms FOV.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, MathUtils, Quaternion } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { clamp, easeInOutCubic, lerp, shortestAngle } from "@/lib/tween";
import { useViewer } from "@/store/viewer-store";
import { compassState } from "@/lib/compass-state";

const PITCH_LIMIT = MathUtils.degToRad(89.0);
const DRAG_SENSITIVITY = 0.0035;
const TWEEN_DURATION_MS = 1500;
const MIN_FOV = 12;
const MAX_FOV = 95;

interface YawPitch {
  yaw: number;
  pitch: number;
}

function dirToYawPitch(d: Vector3): YawPitch {
  return {
    yaw: Math.atan2(d.z, d.x),
    pitch: Math.asin(MathUtils.clamp(d.y, -1, 1)),
  };
}

function applyYawPitch(yaw: number, pitch: number, out: Vector3) {
  const cp = Math.cos(pitch);
  out.set(cp * Math.cos(yaw), Math.sin(pitch), cp * Math.sin(yaw));
}

export function CameraRig() {
  const { camera, gl } = useThree();
  const yp = useRef<YawPitch>({ yaw: 0, pitch: 0 });
  const lookTarget = useRef(new Vector3(1, 0, 0));
  const tween = useRef<{
    start: number;
    from: YawPitch;
    to: YawPitch;
    fromFov: number;
    toFov: number;
    duration: number;
  } | null>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ initialDist: number; initialFov: number } | null>(null);
  const targetState = useViewer((s) => s.cameraTarget);
  const fovNudge = useViewer((s) => s.fovNudge);
  const setAnimating = useViewer((s) => s.setAnimating);
  const markInteracted = useViewer((s) => s.markInteracted);
  const compassMode = useViewer((s) => s.compassMode);
  const compassModeRef = useRef(compassMode);
  compassModeRef.current = compassMode;
  // Carries from compass-driven orientation back to manual when toggled off,
  // avoiding a snap.
  const prevCompassMode = useRef(compassMode);

  useEffect(() => {
    if (!camera) return;
    camera.position.set(0, 0, 0);
    if ("fov" in camera) {
      (camera as { fov: number; updateProjectionMatrix: () => void }).fov = 55;
      (camera as { fov: number; updateProjectionMatrix: () => void }).updateProjectionMatrix();
    }
    applyYawPitch(yp.current.yaw, yp.current.pitch, lookTarget.current);
    camera.lookAt(lookTarget.current.clone().multiplyScalar(CELESTIAL_RADIUS));
  }, [camera]);

  // Pointer drag handlers + multi-touch pinch.
  useEffect(() => {
    const dom = gl.domElement;

    const pinchDist = () => {
      const pts = Array.from(pointers.current.values());
      if (pts.length < 2) return 0;
      const a = pts[0];
      const b = pts[1];
      return Math.hypot(b.x - a.x, b.y - a.y);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tween.current = null;
      markInteracted();
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      // Single-pointer drag is captured in both modes. In normal mode it
      // updates yaw/pitch; in AR mode it nudges the heading-calibration
      // offset so the user can drag the synthetic sky into alignment with
      // the real one.
      if (pointers.current.size === 1) {
        dragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        pinch.current = null;
      } else if (pointers.current.size === 2 && "fov" in camera) {
        // Switch into pinch mode; suspend drag.
        dragging.current = false;
        pinch.current = {
          initialDist: pinchDist(),
          initialFov: (camera as { fov: number }).fov,
        };
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2 && pinch.current && "fov" in camera) {
        const dist = pinchDist();
        if (dist > 0 && pinch.current.initialDist > 0) {
          const cam = camera as { fov: number; updateProjectionMatrix: () => void };
          const ratio = pinch.current.initialDist / dist;
          cam.fov = clamp(pinch.current.initialFov * ratio, MIN_FOV, MAX_FOV);
          cam.updateProjectionMatrix();
        }
        return;
      }

      if (!dragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      // Sensitivity scales with FOV so a finger sweep at 12° feels the same
      // as at 90°.
      const fovScale = "fov" in camera ? (camera as { fov: number }).fov / 55 : 1;
      if (compassModeRef.current) {
        // Calibration nudge. Only the horizontal component matters: the
        // gyro-derived pitch is gravity-referenced and accurate, but the
        // heading from north is the part that drifts (especially on iOS
        // where alpha is referenced to whenever the page loaded).
        compassState.yawOffsetRad -= dx * DRAG_SENSITIVITY * fovScale;
        return;
      }
      yp.current.yaw -= dx * DRAG_SENSITIVITY * fovScale;
      yp.current.pitch += dy * DRAG_SENSITIVITY * fovScale;
      yp.current.pitch = clamp(yp.current.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    };

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (pointers.current.size < 2) {
        pinch.current = null;
      }
      if (pointers.current.size === 0) {
        dragging.current = false;
      } else if (pointers.current.size === 1) {
        // Resume single-pointer drag from the surviving touch (calibration
        // in AR mode, look-around in normal mode).
        dragging.current = true;
        const [pt] = pointers.current.values();
        lastPos.current = { x: pt.x, y: pt.y };
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!("fov" in camera)) return;
      const cam = camera as { fov: number; updateProjectionMatrix: () => void };
      const factor = Math.exp(e.deltaY * 0.0015);
      cam.fov = clamp(cam.fov * factor, MIN_FOV, MAX_FOV);
      cam.updateProjectionMatrix();
      markInteracted();
      e.preventDefault();
    };

    const onTouchStart = (e: TouchEvent) => {
      // Block the browser pinch-zoom and pull-to-refresh; we manage zoom.
      if (e.touches.length > 1) e.preventDefault();
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("touchstart", onTouchStart, { passive: false });
    dom.addEventListener("touchmove", onTouchStart, { passive: false });
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("touchstart", onTouchStart);
      dom.removeEventListener("touchmove", onTouchStart);
    };
  }, [camera, gl]);

  // Kick off a fly-to tween when the camera target changes.
  useEffect(() => {
    if (typeof targetState.nonce !== "number") return;
    if (targetState.nonce === 0 && tween.current === null) {
      // First-mount initialization: snap.
      const dir = raDecHoursToVec3(
        targetState.raHours,
        targetState.decDeg,
        1,
        new Vector3(),
      );
      const next = dirToYawPitch(dir);
      yp.current = next;
      return;
    }
    // Camera target tweens (search results, sign reveal) are meaningless when
    // the user is physically aiming the device. Only honor the destination
    // FOV in that case.
    if (compassModeRef.current) {
      if (targetState.fovDeg && "fov" in camera) {
        const cam = camera as { fov: number; updateProjectionMatrix: () => void };
        cam.fov = clamp(targetState.fovDeg, MIN_FOV, MAX_FOV);
        cam.updateProjectionMatrix();
      }
      return;
    }
    const dir = raDecHoursToVec3(
      targetState.raHours,
      targetState.decDeg,
      1,
      new Vector3(),
    );
    const to = dirToYawPitch(dir);
    const from: YawPitch = { yaw: yp.current.yaw, pitch: yp.current.pitch };
    const adjustedToYaw = shortestAngle(from.yaw, to.yaw);
    const fromFov =
      "fov" in camera ? (camera as { fov: number }).fov : 55;
    const toFov = targetState.fovDeg ?? fromFov;
    tween.current = {
      start: performance.now(),
      from,
      to: { yaw: adjustedToYaw, pitch: to.pitch },
      fromFov,
      toFov,
      duration: TWEEN_DURATION_MS,
    };
    setAnimating(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetState.nonce]);

  // Apply external FOV nudges (zoom buttons / keyboard shortcuts).
  useEffect(() => {
    if (fovNudge.nonce === 0) return;
    if (!("fov" in camera)) return;
    const cam = camera as { fov: number; updateProjectionMatrix: () => void };
    if (Number.isNaN(fovNudge.delta) || fovNudge.delta === 0) {
      cam.fov = 55;
    } else {
      cam.fov = clamp(cam.fov * Math.exp(fovNudge.delta), MIN_FOV, MAX_FOV);
    }
    cam.updateProjectionMatrix();
    markInteracted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fovNudge.nonce]);

  useFrame(() => {
    // Compass mode: copy the live device-driven quaternion straight onto the
    // camera. We bypass the yaw/pitch path entirely because that loses the
    // device's *roll* and forces the camera-up vector to be the celestial
    // pole instead of the local zenith — which is exactly what tilted the
    // rendered horizon in the first place.
    if (compassModeRef.current) {
      tween.current = null;
      if (compassState.hasReading) {
        camera.position.set(0, 0, 0);
        _arQuat.set(
          compassState.qx,
          compassState.qy,
          compassState.qz,
          compassState.qw,
        );
        camera.quaternion.copy(_arQuat);
      }
      prevCompassMode.current = true;
      return;
    }

    if (prevCompassMode.current) {
      // Just toggled off. Derive yaw/pitch from the camera's current forward
      // direction so manual control resumes from wherever the device was
      // last pointed. Roll is intentionally dropped — manual mode keeps the
      // celestial pole as up.
      _arForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      yp.current = dirToYawPitch(_arForward);
      yp.current.pitch = clamp(yp.current.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      tween.current = null;
      prevCompassMode.current = false;
    }

    if (tween.current) {
      const t = (performance.now() - tween.current.start) / tween.current.duration;
      const tc = clamp(t, 0, 1);
      const e = easeInOutCubic(tc);
      yp.current.yaw = lerp(tween.current.from.yaw, tween.current.to.yaw, e);
      yp.current.pitch = lerp(tween.current.from.pitch, tween.current.to.pitch, e);
      if ("fov" in camera) {
        const cam = camera as { fov: number; updateProjectionMatrix: () => void };
        cam.fov = lerp(tween.current.fromFov, tween.current.toFov, e);
        cam.updateProjectionMatrix();
      }
      if (tc >= 1) {
        tween.current = null;
        setAnimating(false);
      }
    }
    applyYawPitch(yp.current.yaw, yp.current.pitch, lookTarget.current);
    camera.position.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookTarget.current.clone().multiplyScalar(CELESTIAL_RADIUS));
  });

  return null;
}

// Frame-loop scratch — kept module-level so AR mode allocates nothing per
// tick at 60 Hz.
const _arQuat = new Quaternion();
const _arForward = new Vector3();

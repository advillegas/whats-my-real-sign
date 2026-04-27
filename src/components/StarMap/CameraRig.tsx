"use client";

/**
 * First-person "look around the sky" camera, plus quaternion-style tweens to
 * fly to a requested RA/Dec when the store's cameraTarget changes.
 *
 * Camera always sits at the origin. Stars and other celestial objects sit on
 * a sphere of radius CELESTIAL_RADIUS; the camera quaternion alone determines
 * what's on screen.
 *
 * Input model:
 *   • 1 finger (or mouse drag) → yaw/pitch.
 *   • 2 fingers → pinch (FOV), twist (roll), and centroid-drag (yaw/pitch),
 *     all simultaneously. Same model as Google Maps / Earth — the user
 *     never has to commit to one gesture.
 *   • Wheel → FOV.
 *   • AR/compass mode → device gyro drives the camera quaternion directly;
 *     1-finger drag nudges the heading-calibration yaw offset; 2-finger
 *     pinch still adjusts FOV, but pan/twist are inert (the gyro owns
 *     orientation in that mode).
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

interface YawPitchRoll {
  yaw: number;
  pitch: number;
  /**
   * Camera rotation around its own forward axis, in radians. Positive =
   * the world appears to rotate CCW on screen. Driven by 2-finger twist;
   * tweens reset it to 0 so fly-to destinations always land upright.
   */
  roll: number;
}

function dirToYawPitch(d: Vector3): { yaw: number; pitch: number } {
  return {
    yaw: Math.atan2(d.z, d.x),
    pitch: Math.asin(MathUtils.clamp(d.y, -1, 1)),
  };
}

function applyYawPitch(yaw: number, pitch: number, out: Vector3) {
  const cp = Math.cos(pitch);
  out.set(cp * Math.cos(yaw), Math.sin(pitch), cp * Math.sin(yaw));
}

interface PinchSnapshot {
  /** Pixel distance between the two pointers on the previous tick. */
  lastDist: number;
  /** Screen-coord angle of (b - a) on the previous tick, in radians. */
  lastAngle: number;
  /** Centroid pixel coordinates on the previous tick. */
  lastCx: number;
  lastCy: number;
}

export function CameraRig() {
  const { camera, gl } = useThree();
  const ypr = useRef<YawPitchRoll>({ yaw: 0, pitch: 0, roll: 0 });
  const lookTarget = useRef(new Vector3(1, 0, 0));
  const tween = useRef<{
    start: number;
    from: YawPitchRoll;
    to: YawPitchRoll;
    fromFov: number;
    toFov: number;
    duration: number;
  } | null>(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<PinchSnapshot | null>(null);
  const targetState = useViewer((s) => s.cameraTarget);
  const fovNudge = useViewer((s) => s.fovNudge);
  const setAnimating = useViewer((s) => s.setAnimating);
  const markInteracted = useViewer((s) => s.markInteracted);
  const compassMode = useViewer((s) => s.compassMode);
  const compassModeRef = useRef(compassMode);
  compassModeRef.current = compassMode;
  const prevCompassMode = useRef(compassMode);

  useEffect(() => {
    if (!camera) return;
    camera.position.set(0, 0, 0);
    if ("fov" in camera) {
      (camera as { fov: number; updateProjectionMatrix: () => void }).fov = 55;
      (camera as { fov: number; updateProjectionMatrix: () => void }).updateProjectionMatrix();
    }
    applyYawPitch(ypr.current.yaw, ypr.current.pitch, lookTarget.current);
    camera.lookAt(lookTarget.current.clone().multiplyScalar(CELESTIAL_RADIUS));
  }, [camera]);

  useEffect(() => {
    const dom = gl.domElement;

    const computePinch = (): {
      dist: number;
      angle: number;
      cx: number;
      cy: number;
    } | null => {
      const pts = Array.from(pointers.current.values());
      if (pts.length < 2) return null;
      const a = pts[0];
      const b = pts[1];
      return {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        // Screen-coord +Y is down, so this angle measures CW visually.
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
    };

    const startPinch = () => {
      const data = computePinch();
      if (!data) return;
      pinch.current = {
        lastDist: data.dist,
        lastAngle: data.angle,
        lastCx: data.cx,
        lastCy: data.cy,
      };
      dragging.current = false;
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
      if (pointers.current.size === 1) {
        // Normal mode → single-pointer drag = look around.
        // AR mode    → single-pointer drag = nudge heading calibration.
        dragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        pinch.current = null;
      } else if (pointers.current.size === 2 && "fov" in camera) {
        startPinch();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2 && "fov" in camera) {
        const data = computePinch();
        if (!data) return;
        // The pinch snapshot is created on touchdown; if a third finger
        // joined after we started tracking, just refresh the snapshot
        // off the first two (keeps things stable, no NaN on very-rapid
        // 3-finger gestures).
        if (!pinch.current) {
          startPinch();
          return;
        }
        const cam = camera as {
          fov: number;
          updateProjectionMatrix: () => void;
        };

        // ── Pinch (FOV) ───────────────────────────────────────────────
        if (pinch.current.lastDist > 0 && data.dist > 0) {
          const ratio = pinch.current.lastDist / data.dist;
          cam.fov = clamp(cam.fov * ratio, MIN_FOV, MAX_FOV);
          cam.updateProjectionMatrix();
        }

        // ── Twist (roll) and centroid pan (yaw/pitch) ────────────────
        // Both are inert in AR mode — the gyro owns orientation, and any
        // 2-finger orientation tweak would just fight the device pose.
        if (!compassModeRef.current) {
          const fovScale = cam.fov / 55;

          const dx = data.cx - pinch.current.lastCx;
          const dy = data.cy - pinch.current.lastCy;
          ypr.current.yaw -= dx * DRAG_SENSITIVITY * fovScale;
          ypr.current.pitch += dy * DRAG_SENSITIVITY * fovScale;
          ypr.current.pitch = clamp(
            ypr.current.pitch,
            -PITCH_LIMIT,
            PITCH_LIMIT,
          );

          let dAngle = data.angle - pinch.current.lastAngle;
          // Wrap into [-π, π] so a gesture that crosses the ±π seam
          // doesn't snap the camera halfway around.
          if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
          if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
          // CCW twist on screen → dAngle < 0 (screen Y is flipped) →
          // we want world to rotate CCW → camera rolls CW around its
          // local +Z (the back direction). Negate to convert.
          ypr.current.roll -= dAngle;
        }

        pinch.current.lastDist = data.dist;
        pinch.current.lastAngle = data.angle;
        pinch.current.lastCx = data.cx;
        pinch.current.lastCy = data.cy;
        return;
      }

      if (!dragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      const fovScale = "fov" in camera ? (camera as { fov: number }).fov / 55 : 1;
      if (compassModeRef.current) {
        // Drag right (dx > 0) → user expects the synthetic sky to shift
        // right. The new compass pipeline bakes yawOffset directly into
        // the W3C alpha (CCW-positive). Increasing it rotates the device's
        // assumed pose CCW from above, which moves the lookAt target from
        // (say) celestial-N toward celestial-W and slides stars rightward
        // on screen.
        compassState.yawOffsetRad += dx * DRAG_SENSITIVITY * fovScale;
        return;
      }
      ypr.current.yaw -= dx * DRAG_SENSITIVITY * fovScale;
      ypr.current.pitch += dy * DRAG_SENSITIVITY * fovScale;
      ypr.current.pitch = clamp(ypr.current.pitch, -PITCH_LIMIT, PITCH_LIMIT);
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
        // One finger left → resume single-pointer drag from where it is,
        // not from the now-stale centroid.
        dragging.current = true;
        const [pt] = pointers.current.values();
        lastPos.current = { x: pt.x, y: pt.y };
      } else if (pointers.current.size >= 2) {
        // A finger lifted but two are still down (rare: 3-finger gesture
        // collapsing to 2). Re-snapshot so the next move tick computes
        // a sensible delta.
        startPinch();
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
  }, [camera, gl, markInteracted]);

  useEffect(() => {
    if (typeof targetState.nonce !== "number") return;
    if (targetState.nonce === 0 && tween.current === null) {
      const dir = raDecHoursToVec3(
        targetState.raHours,
        targetState.decDeg,
        1,
        new Vector3(),
      );
      const next = dirToYawPitch(dir);
      ypr.current = { ...next, roll: 0 };
      return;
    }
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
    const from: YawPitchRoll = {
      yaw: ypr.current.yaw,
      pitch: ypr.current.pitch,
      roll: ypr.current.roll,
    };
    const adjustedToYaw = shortestAngle(from.yaw, to.yaw);
    const fromFov = "fov" in camera ? (camera as { fov: number }).fov : 55;
    const toFov = targetState.fovDeg ?? fromFov;
    tween.current = {
      start: performance.now(),
      from,
      // Fly-to destinations always land with the celestial pole as up —
      // any roll the user dialed in earlier is unwound during the tween.
      to: { yaw: adjustedToYaw, pitch: to.pitch, roll: 0 },
      fromFov,
      toFov,
      duration: TWEEN_DURATION_MS,
    };
    setAnimating(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetState.nonce]);

  useEffect(() => {
    if (fovNudge.nonce === 0) return;
    if (!("fov" in camera)) return;
    const cam = camera as { fov: number; updateProjectionMatrix: () => void };
    if (Number.isNaN(fovNudge.delta) || fovNudge.delta === 0) {
      cam.fov = 55;
      // "Reset zoom" also unwinds any user-dialed roll. Keeps the recovery
      // path single-tap when the view ends up sideways.
      ypr.current.roll = 0;
    } else {
      cam.fov = clamp(cam.fov * Math.exp(fovNudge.delta), MIN_FOV, MAX_FOV);
    }
    cam.updateProjectionMatrix();
    markInteracted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fovNudge.nonce]);

  useFrame(() => {
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
      _arForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const next = dirToYawPitch(_arForward);
      ypr.current.yaw = next.yaw;
      ypr.current.pitch = clamp(next.pitch, -PITCH_LIMIT, PITCH_LIMIT);
      ypr.current.roll = 0;
      tween.current = null;
      prevCompassMode.current = false;
    }

    if (tween.current) {
      const t = (performance.now() - tween.current.start) / tween.current.duration;
      const tc = clamp(t, 0, 1);
      const e = easeInOutCubic(tc);
      ypr.current.yaw = lerp(tween.current.from.yaw, tween.current.to.yaw, e);
      ypr.current.pitch = lerp(tween.current.from.pitch, tween.current.to.pitch, e);
      ypr.current.roll = lerp(tween.current.from.roll, tween.current.to.roll, e);
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
    applyYawPitch(ypr.current.yaw, ypr.current.pitch, lookTarget.current);
    camera.position.set(0, 0, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookTarget.current.clone().multiplyScalar(CELESTIAL_RADIUS));
    if (ypr.current.roll !== 0) {
      // Post-multiply: rotation in the camera's local frame, around its
      // own back axis. Doesn't change what the camera looks at — only
      // how that view is oriented on screen.
      camera.rotateZ(ypr.current.roll);
    }
  });

  return null;
}

const _arQuat = new Quaternion();
const _arForward = new Vector3();

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
import { Vector3, MathUtils } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { clamp, easeInOutCubic, lerp, shortestAngle } from "@/lib/tween";
import { useViewer } from "@/store/viewer-store";

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
  const targetState = useViewer((s) => s.cameraTarget);
  const fovNudge = useViewer((s) => s.fovNudge);
  const setAnimating = useViewer((s) => s.setAnimating);

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

  // Pointer drag handlers.
  useEffect(() => {
    const dom = gl.domElement;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
      tween.current = null;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      yp.current.yaw -= dx * DRAG_SENSITIVITY;
      yp.current.pitch += dy * DRAG_SENSITIVITY;
      yp.current.pitch = clamp(yp.current.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    };
    const onUp = (e: PointerEvent) => {
      dragging.current = false;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!("fov" in camera)) return;
      const cam = camera as { fov: number; updateProjectionMatrix: () => void };
      const factor = Math.exp(e.deltaY * 0.0015);
      cam.fov = clamp(cam.fov * factor, MIN_FOV, MAX_FOV);
      cam.updateProjectionMatrix();
      e.preventDefault();
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
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
      // Sentinel: reset.
      cam.fov = 55;
    } else {
      cam.fov = clamp(cam.fov * Math.exp(fovNudge.delta), MIN_FOV, MAX_FOV);
    }
    cam.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fovNudge.nonce]);

  useFrame(() => {
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
    camera.lookAt(lookTarget.current.clone().multiplyScalar(CELESTIAL_RADIUS));
  });

  return null;
}

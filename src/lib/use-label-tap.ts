"use client";

/**
 * Pointer-event handler factory for in-canvas labels.
 *
 * The problem this solves: drei's `<Html>` labels are real DOM elements with
 * `pointer-events: auto`, so a press that *starts* on a label never reaches
 * the WebGL canvas where `CameraRig` listens. Result: the user grabs the
 * label and the camera refuses to pan.
 *
 * The fix: a single `onPointerDown` handler that watches the gesture. If the
 * pointer barely moves and lifts within 500 ms, fire `onTap()` (the label
 * was clicked). If the pointer moves more than 6 px before release, treat
 * it as a drag — synthesize a `pointerdown` (then forward subsequent
 * moves/up) on `gl.domElement` so the camera-rig listeners pick up the
 * gesture and pan as if the press had landed on bare canvas.
 *
 * Thresholds (`MOVE_PX`, `TAP_MS`) intentionally match `Picker.tsx`'s
 * tap-vs-drag thresholds so identical gestures behave identically whether
 * they start on a label or on empty sky.
 *
 * `pointerType === "mouse"` is also surfaced so callers can suppress
 * "phantom hover" highlight on touch (where a touch-start fires a hover
 * event the user never intended).
 */

import { useCallback, useRef } from "react";
import { useThree } from "@react-three/fiber";

export const LABEL_TAP_MOVE_PX = 6;
export const LABEL_TAP_MAX_MS = 500;

interface Options {
  /** Called only when the gesture is a clean tap (no significant movement). */
  onTap?: () => void;
}

interface Tracking {
  pointerId: number;
  startX: number;
  startY: number;
  startT: number;
  pointerType: string;
  drag: boolean;
}

export function useLabelTap({ onTap }: Options) {
  const { gl } = useThree();
  const tracking = useRef<Tracking | null>(null);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Don't compete with non-primary mouse buttons.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      // If a previous gesture is still mid-flight, abandon it.
      if (tracking.current) cleanup();

      const t: Tracking = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startT: performance.now(),
        pointerType: e.pointerType,
        drag: false,
      };
      tracking.current = t;

      // Crucially do NOT stopPropagation/preventDefault and do NOT
      // setPointerCapture — we need the gesture to remain forwardable.

      const dom = gl.domElement;

      const onMove = (ev: PointerEvent) => {
        const cur = tracking.current;
        if (!cur || ev.pointerId !== cur.pointerId) return;
        const dx = ev.clientX - cur.startX;
        const dy = ev.clientY - cur.startY;
        if (!cur.drag && dx * dx + dy * dy > LABEL_TAP_MOVE_PX * LABEL_TAP_MOVE_PX) {
          cur.drag = true;
          // First, synthesize the pointerdown the canvas missed, with the
          // *original* coordinates so CameraRig's lastPos seed is right.
          dispatchSynthetic(dom, "pointerdown", {
            pointerId: cur.pointerId,
            pointerType: cur.pointerType,
            clientX: cur.startX,
            clientY: cur.startY,
            button: 0,
            buttons: 1,
          });
        }
        if (cur.drag) {
          dispatchSynthetic(dom, "pointermove", {
            pointerId: cur.pointerId,
            pointerType: cur.pointerType,
            clientX: ev.clientX,
            clientY: ev.clientY,
            button: -1,
            buttons: ev.buttons || 1,
          });
        }
      };

      const onUp = (ev: PointerEvent) => {
        const cur = tracking.current;
        if (!cur || ev.pointerId !== cur.pointerId) return;
        if (cur.drag) {
          dispatchSynthetic(dom, "pointerup", {
            pointerId: cur.pointerId,
            pointerType: cur.pointerType,
            clientX: ev.clientX,
            clientY: ev.clientY,
            button: 0,
            buttons: 0,
          });
        } else {
          const dt = performance.now() - cur.startT;
          if (dt <= LABEL_TAP_MAX_MS) {
            onTapRef.current?.();
          }
        }
        cleanup();
      };

      const onCancel = (ev: PointerEvent) => {
        const cur = tracking.current;
        if (!cur || ev.pointerId !== cur.pointerId) return;
        if (cur.drag) {
          dispatchSynthetic(dom, "pointercancel", {
            pointerId: cur.pointerId,
            pointerType: cur.pointerType,
            clientX: ev.clientX,
            clientY: ev.clientY,
            button: 0,
            buttons: 0,
          });
        }
        cleanup();
      };

      function cleanup() {
        tracking.current = null;
        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onUp, true);
        document.removeEventListener("pointercancel", onCancel, true);
      }

      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onUp, true);
      document.addEventListener("pointercancel", onCancel, true);
    },
    [gl],
  );

  return { onPointerDown };
}

interface SyntheticInit {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
}

function dispatchSynthetic(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: SyntheticInit,
) {
  // PointerEvent constructor may not be available everywhere; guard once.
  if (typeof PointerEvent !== "function") return;
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: init.pointerId,
    pointerType: init.pointerType,
    clientX: init.clientX,
    clientY: init.clientY,
    screenX: init.clientX,
    screenY: init.clientY,
    button: init.button,
    buttons: init.buttons,
    isPrimary: true,
  });
  target.dispatchEvent(ev);
}

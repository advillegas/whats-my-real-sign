"use client";

/**
 * "Point your phone here" indicator for AR mode.
 *
 * When AR is on and an object is selected (e.g. via search), this shows:
 *   - A pulsing halo locked onto the target's screen position when the
 *     target is currently inside the field of view.
 *   - A directional chevron pinned to the screen edge (with the target's
 *     name and the angular distance left to sweep) when it isn't.
 *
 * Reads from `arTargetState`, which `<ARTargetTracker />` updates every
 * R3F frame. Pulled out into a DOM component so we can pin overlays to the
 * viewport edge without any 3D positioning tricks.
 */

import { useEffect, useRef, useState } from "react";
import { useViewer } from "@/store/viewer-store";
import { arTargetState } from "@/lib/ar-target-state";

export function ARTargetIndicator() {
  const compassMode = useViewer((s) => s.compassMode);
  const selected = useViewer((s) => s.selected);
  const setSelected = useViewer((s) => s.setSelected);

  const [snapshot, setSnapshot] = useState({
    onScreen: false,
    ndcX: 0,
    ndcY: 0,
    separationDeg: 0,
    name: "",
  });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!compassMode || !selected) return;
    const tick = () => {
      // Capture the live state on every animation frame; React only re-
      // renders if the snapshot actually changed enough to matter.
      const next = {
        onScreen: arTargetState.onScreen,
        ndcX: arTargetState.ndcX,
        ndcY: arTargetState.ndcY,
        separationDeg: arTargetState.separationDeg,
        name: arTargetState.name,
      };
      setSnapshot((prev) => {
        if (
          prev.onScreen === next.onScreen &&
          Math.abs(prev.ndcX - next.ndcX) < 0.005 &&
          Math.abs(prev.ndcY - next.ndcY) < 0.005 &&
          Math.abs(prev.separationDeg - next.separationDeg) < 0.25 &&
          prev.name === next.name
        ) {
          return prev;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [compassMode, selected]);

  if (!compassMode || !selected) return null;

  const { onScreen, ndcX, ndcY, separationDeg, name } = snapshot;

  if (onScreen) {
    // NDC → CSS percent. NDC y is up, CSS top is down.
    const left = ((ndcX + 1) / 2) * 100;
    const top = ((-ndcY + 1) / 2) * 100;
    return (
      <div
        className="fixed inset-0 pointer-events-none z-30"
        aria-hidden
      >
        <div
          className="absolute"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="relative w-16 h-16 sm:w-20 sm:h-20">
            <span className="absolute inset-0 rounded-full border-2 border-amber-300/90 animate-ping" />
            <span className="absolute inset-1.5 rounded-full border border-amber-200/80" />
            <span className="absolute inset-0 grid place-items-center">
              <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-amber-200 text-[10px] sm:text-xs font-medium tracking-wide whitespace-nowrap">
                {name}
              </span>
            </span>
          </div>
        </div>
        <button
          onClick={() => setSelected(null)}
          className="absolute top-2 left-1/2 -translate-x-1/2 mt-16 sm:mt-20 pointer-events-auto glass rounded-full px-3 py-1 text-[10px] sm:text-xs text-white/85 hover:text-white"
        >
          On target — clear
        </button>
      </div>
    );
  }

  // Off-screen → pin a chevron to the screen edge in the direction of
  // the target. Convert the (clamped) NDC vector into a position on a
  // central rectangle inset from the viewport edges so the chevron sits
  // safely inside the safe area.
  const len = Math.hypot(ndcX, ndcY) || 1e-6;
  const ux = ndcX / len;
  const uy = ndcY / len;
  // Scale into a rectangle at (±0.86, ±0.86) so the chevron stays out of
  // the very corners (which collide with safe-area UI).
  const edgeScale = Math.min(0.86 / Math.max(Math.abs(ux), 1e-6), 0.86 / Math.max(Math.abs(uy), 1e-6));
  const ex = ux * edgeScale;
  const ey = uy * edgeScale;
  const left = ((ex + 1) / 2) * 100;
  const top = ((-ey + 1) / 2) * 100;
  // Chevron points outward (toward the target).
  const rotationDeg = (Math.atan2(-uy, ux) * 180) / Math.PI;

  return (
    <div className="fixed inset-0 pointer-events-none z-30" aria-hidden>
      <div
        className="absolute flex flex-col items-center gap-1.5"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-amber-400/15 border border-amber-300/70 backdrop-blur-sm grid place-items-center text-amber-200 shadow-lg shadow-amber-900/30"
          style={{ transform: `rotate(${rotationDeg}deg)` }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </div>
        <div className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-amber-100 text-[10px] sm:text-xs whitespace-nowrap">
          {name}{" "}
          <span className="text-white/55">
            · {separationDeg < 1 ? separationDeg.toFixed(1) : Math.round(separationDeg)}°
          </span>
        </div>
      </div>
      <button
        onClick={() => setSelected(null)}
        className="absolute bottom-24 sm:bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto glass rounded-full px-3 py-1 text-[10px] sm:text-xs text-white/85 hover:text-white"
      >
        Cancel target
      </button>
    </div>
  );
}

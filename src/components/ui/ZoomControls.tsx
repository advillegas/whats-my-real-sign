"use client";

/**
 * Compact zoom buttons + keyboard shortcuts for the sky view.
 *
 * Shortcuts:
 *   "+", "=" → zoom in (narrower FOV)
 *   "-"      → zoom out (wider FOV)
 *   "0"      → reset to 55° default
 *
 * The actual FOV change is applied by CameraRig in response to fovNudge
 * updates in the viewer store; this component just emits intent.
 */

import { useEffect } from "react";
import { useViewer } from "@/store/viewer-store";

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const ResetIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const STEP_IN = -0.22;
const STEP_OUT = 0.22;

export function ZoomControls() {
  const nudgeFov = useViewer((s) => s.nudgeFov);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") {
        nudgeFov(STEP_IN);
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        nudgeFov(STEP_OUT);
        e.preventDefault();
      } else if (e.key === "0") {
        nudgeFov(NaN);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudgeFov]);

  return (
    <div className="glass flex flex-row sm:flex-col items-stretch overflow-hidden rounded-lg text-white/80 shadow-lg">
      <button
        onClick={() => nudgeFov(STEP_IN)}
        title="Zoom in (+)"
        className="grid place-items-center w-10 h-10 sm:w-auto sm:h-auto sm:px-2.5 sm:py-2 transition-colors hover:bg-white/10 active:bg-white/20 hover:text-white"
        aria-label="Zoom in"
      >
        <PlusIcon />
      </button>
      <div className="w-px sm:w-full sm:h-px h-full bg-white/10" />
      <button
        onClick={() => nudgeFov(NaN)}
        title="Reset zoom (0)"
        className="grid place-items-center w-10 h-10 sm:w-auto sm:h-auto sm:px-2.5 sm:py-2 transition-colors hover:bg-white/10 active:bg-white/20 hover:text-white"
        aria-label="Reset zoom"
      >
        <ResetIcon />
      </button>
      <div className="w-px sm:w-full sm:h-px h-full bg-white/10" />
      <button
        onClick={() => nudgeFov(STEP_OUT)}
        title="Zoom out (−)"
        className="grid place-items-center w-10 h-10 sm:w-auto sm:h-auto sm:px-2.5 sm:py-2 transition-colors hover:bg-white/10 active:bg-white/20 hover:text-white"
        aria-label="Zoom out"
      >
        <MinusIcon />
      </button>
    </div>
  );
}

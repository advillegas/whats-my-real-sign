"use client";

/**
 * AR-mode calibration UI.
 *
 * Two knobs the user can touch:
 *   1. "Reset alignment" — zeroes the live yaw nudge they've been dragging.
 *   2. "Mirror sky"      — flips the alpha-sign convention. The synthetic
 *                          sky should track real motion; if turning the
 *                          phone moves the on-screen sky the wrong way,
 *                          tap this. Persisted in localStorage so the
 *                          device only needs to be calibrated once.
 *
 * Also shows a one-time "drag to align" hint on first AR session.
 */

import { useEffect, useState } from "react";
import { useViewer } from "@/store/viewer-store";
import { compassState } from "@/lib/compass-state";

const HINT_KEY = "ar-calibration-hint-seen";
// Bumped when the default convention flipped — so any stored "1" / "0" from
// the old default doesn't override the new default for users who never
// explicitly touched the toggle. v4 = the rewrite that only trusts absolute
// orientation events and defaults the mirror to OFF (W3C alpha is already
// CCW yaw, no negation needed).
const FLIP_KEY = "ar-flip-horizontal-v4";
const FLIP_DEFAULT = false;

export function ARCalibrationOverlay() {
  const compassMode = useViewer((s) => s.compassMode);
  const [showHint, setShowHint] = useState(false);
  const [hasOffset, setHasOffset] = useState(false);
  const [needsAbsolute, setNeedsAbsolute] = useState(false);
  // Mirror toggle — kept in component state so the button re-renders, plus
  // mirrored to compassState (read by the high-frequency event handler).
  const [flipped, setFlipped] = useState(FLIP_DEFAULT);

  // Restore mirror preference on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(FLIP_KEY);
    if (raw === null) {
      compassState.flipHorizontalAlpha = FLIP_DEFAULT;
      return;
    }
    const value = raw === "1";
    setFlipped(value);
    compassState.flipHorizontalAlpha = value;
  }, []);

  useEffect(() => {
    if (!compassMode) {
      setShowHint(false);
      setHasOffset(false);
      return;
    }
    if (typeof window !== "undefined") {
      const seen = window.localStorage.getItem(HINT_KEY) === "1";
      if (!seen) {
        setShowHint(true);
        const t = window.setTimeout(() => {
          setShowHint(false);
          window.localStorage.setItem(HINT_KEY, "1");
        }, 6500);
        return () => window.clearTimeout(t);
      }
    }
  }, [compassMode]);

  useEffect(() => {
    if (!compassMode) return;
    const id = window.setInterval(() => {
      setHasOffset(Math.abs(compassState.yawOffsetRad) > 0.01);
      // Only warn if we've been in AR for >1.5s with no absolute reading
      // arriving — gives Android Chrome time to deliver its first
      // `deviceorientationabsolute` event.
      const stale =
        compassState.needsAbsolute &&
        !compassState.hasReading &&
        performance.now() - compassState.lastUpdateMs > 1500;
      setNeedsAbsolute(stale);
    }, 350);
    return () => window.clearInterval(id);
  }, [compassMode]);

  if (!compassMode) return null;

  const toggleMirror = () => {
    const next = !flipped;
    setFlipped(next);
    compassState.flipHorizontalAlpha = next;
    // Wipe the drag nudge when changing convention — its old value is
    // measured in the now-flipped frame and will land somewhere random.
    compassState.yawOffsetRad = 0;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FLIP_KEY, next ? "1" : "0");
    }
  };

  return (
    <>
      {needsAbsolute && (
        <div
          role="alert"
          className="fixed left-1/2 -translate-x-1/2 bottom-32 sm:bottom-36 z-30 pointer-events-none px-3"
        >
          <div className="glass rounded-2xl px-4 py-3 text-[11px] sm:text-xs text-amber-100 shadow-lg max-w-[88vw] text-center leading-snug ring-1 ring-amber-300/40">
            This device isn&apos;t reporting an absolute compass heading, so AR
            mode can&apos;t anchor to true north.
            <div className="mt-1 text-white/65 text-[10px]">
              Try mobile Safari (iOS) or Chrome on Android — desktop browsers
              and most laptops don&apos;t have a magnetometer.
            </div>
          </div>
        </div>
      )}

      {showHint && !needsAbsolute && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-32 sm:bottom-36 z-30 pointer-events-none px-3"
        >
          <div className="glass rounded-2xl px-4 py-2.5 text-[11px] sm:text-xs text-white/90 shadow-lg max-w-[88vw] text-center leading-snug">
            Drag horizontally to fine-tune the alignment with what you see.
            <div className="mt-1 text-white/55 text-[10px]">
              If turning the phone moves the sky the wrong way, tap “Mirror sky”.
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={toggleMirror}
          className={`glass rounded-full px-3 py-1.5 text-[10px] sm:text-xs shadow-lg transition ${
            flipped
              ? "text-emerald-200 ring-1 ring-emerald-300/40"
              : "text-white/85 hover:text-white"
          }`}
          aria-pressed={flipped}
          title="Flip horizontal-rotation direction if turning the phone moves the sky the wrong way"
        >
          {flipped ? "Mirror: on" : "Mirror: off"}
        </button>
        {hasOffset && (
          <button
            onClick={() => {
              compassState.yawOffsetRad = 0;
              setHasOffset(false);
            }}
            className="glass rounded-full px-3 py-1.5 text-[10px] sm:text-xs text-white/85 hover:text-white shadow-lg"
            title="Clear your AR alignment nudge"
          >
            Reset alignment
          </button>
        )}
      </div>
    </>
  );
}

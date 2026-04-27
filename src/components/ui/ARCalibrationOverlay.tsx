"use client";

/**
 * AR-mode calibration UI. Shows a one-time hint ("drag to align") on the
 * first session, and a small persistent "Reset alignment" pill so the user
 * can zero out their nudges if they get lost.
 *
 * Background: device alpha on iOS is referenced to whatever orientation the
 * page loaded in, and even Android's absolute orientation drifts 5–15° due
 * to local magnetic interference. Rather than guessing wrong, we let the
 * user drag the synthetic sky into alignment with reality and remember the
 * offset for the rest of the session.
 */

import { useEffect, useState } from "react";
import { useViewer } from "@/store/viewer-store";
import { compassState } from "@/lib/compass-state";

const HINT_KEY = "ar-calibration-hint-seen";

export function ARCalibrationOverlay() {
  const compassMode = useViewer((s) => s.compassMode);
  const [showHint, setShowHint] = useState(false);
  // Animation tick so the "Reset" button only appears once the user has
  // actually nudged the offset away from zero. Reading once per second is
  // plenty — this is just a visibility gate, not a render of the value.
  const [hasOffset, setHasOffset] = useState(false);

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
        }, 6000);
        return () => window.clearTimeout(t);
      }
    }
  }, [compassMode]);

  useEffect(() => {
    if (!compassMode) return;
    const id = window.setInterval(() => {
      setHasOffset(Math.abs(compassState.yawOffsetRad) > 0.01);
    }, 350);
    return () => window.clearInterval(id);
  }, [compassMode]);

  if (!compassMode) return null;

  return (
    <>
      {showHint && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-32 sm:bottom-36 z-30 pointer-events-none"
        >
          <div className="glass rounded-full px-4 py-2 text-[11px] sm:text-xs text-white/90 shadow-lg max-w-[88vw] text-center">
            Drag horizontally to align the synthetic sky with what you see.
          </div>
        </div>
      )}
      {hasOffset && (
        <button
          onClick={() => {
            compassState.yawOffsetRad = 0;
            setHasOffset(false);
          }}
          className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto glass rounded-full px-3 py-1.5 text-[10px] sm:text-xs text-white/85 hover:text-white shadow-lg"
          title="Clear your AR alignment nudge"
        >
          Reset alignment
        </button>
      )}
    </>
  );
}

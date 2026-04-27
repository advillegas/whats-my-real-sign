"use client";

/**
 * Centered intro overlay that explains what the user is looking at and
 * names the constellation currently behind the Sun. Dismisses itself the
 * first time the user manually navigates (drag, scroll, pinch, click an
 * object, change the date, search, etc.) — all of which set
 * `hasInteracted` in the viewer store.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useViewer } from "@/store/viewer-store";
import { sunSky } from "@/lib/astronomy";
import {
  constellationAt,
  loadBoundaries,
  type ConstellationBoundary,
} from "@/lib/constellations";

const APPEAR_DELAY_MS = 600;
const AUTO_DISMISS_MS = 12_000;

export function WelcomeOverlay() {
  const date = useViewer((s) => s.date);
  const hasInteracted = useViewer((s) => s.hasInteracted);
  const markInteracted = useViewer((s) => s.markInteracted);
  const [bounds, setBounds] = useState<ConstellationBoundary[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadBoundaries().then((b) => {
      if (alive) setBounds(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), APPEAR_DELAY_MS);
    const a = window.setTimeout(() => markInteracted(), AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(a);
    };
  }, [markInteracted]);

  const visible = ready && !hasInteracted && !!bounds;

  let realName = "—";
  if (bounds) {
    const sun = sunSky(date);
    const real = constellationAt(sun.ra, sun.dec, bounds);
    realName = real?.name ?? real?.desig ?? "—";
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="pointer-events-none fixed inset-x-0 top-0 z-[45] flex items-start justify-center px-3 pt-14 sm:pt-20 safe-top"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="glass pointer-events-auto rounded-2xl px-4 py-4 sm:px-7 sm:py-6 max-w-lg w-full sm:w-auto text-center relative shadow-2xl ring-1 ring-white/10"
          >
            <button
              onClick={() => markInteracted()}
              aria-label="Dismiss intro"
              className="absolute top-2 right-2 w-8 h-8 grid place-items-center rounded-full text-white/55 hover:text-white hover:bg-white/10 active:bg-white/20 transition text-lg leading-none"
            >
              ×
            </button>
            <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.32em] text-blue-200/70">
              How this works
            </div>
            <p className="mt-2 text-[13px] sm:text-sm text-white/85 leading-relaxed">
              Your zodiac sign is determined by the constellation positioned
              directly{" "}
              <span className="text-amber-200">behind the Sun</span> on the day
              you were born.
            </p>
            <p className="mt-3 text-[13px] sm:text-sm text-white/85 leading-relaxed">
              Right now the Sun is in front of{" "}
              <span className="text-blue-200 font-semibold">{realName}</span>.
            </p>
            <p className="mt-3 text-[11px] sm:text-[12px] text-white/55 leading-snug">
              Drag to look around · scroll or pinch to zoom · tap any
              label for details · change the date below to see another sky.
            </p>
            <div className="mt-4 text-[10px] uppercase tracking-[0.24em] text-white/45">
              Tap anything, drag, or scroll to begin
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

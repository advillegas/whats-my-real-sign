"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sunSky } from "@/lib/astronomy";
import {
  constellationAt,
  loadBoundaries,
  loadMeta,
  tropicalSign,
  type ConstellationBoundary,
} from "@/lib/constellations";
import { useViewer } from "@/store/viewer-store";

export function SignReveal() {
  const date = useViewer((s) => s.date);
  const [bounds, setBounds] = useState<ConstellationBoundary[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([loadBoundaries(), loadMeta()]).then(([b]) => {
      if (alive) setBounds(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!bounds) return null;
  const sun = sunSky(date);
  const real = constellationAt(sun.ra, sun.dec, bounds);
  const tropical = sun.eclipticLongitude
    ? tropicalSign(sun.eclipticLongitude)
    : null;
  const realName = real?.name ?? real?.desig ?? "—";
  const matches =
    tropical && realName.toLowerCase().startsWith(tropical.name.toLowerCase().slice(0, 4));

  return (
    <AnimatePresence mode="wait" initial={false}>
      {open ? (
        <motion.div
          key="card"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          className="glass rounded-2xl px-3.5 py-3 sm:px-5 sm:py-4 max-w-md relative"
        >
          <button
            onClick={() => setOpen(false)}
            aria-label="Hide constellation reveal"
            title="Hide for a fuller view of the sky"
            className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-7 h-7 sm:w-8 sm:h-8 grid place-items-center rounded-full text-white/55 hover:text-white hover:bg-white/10 active:bg-white/20 transition text-lg leading-none"
          >
            ×
          </button>
          <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.24em] sm:tracking-[0.28em] text-blue-200/70 pr-7">
            Constellation behind the Sun
          </div>
          <div className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-white pr-7">
            {realName}
          </div>
          <div className="mt-1.5 sm:mt-2 text-[11px] sm:text-xs text-white/70 leading-relaxed">
            {tropical && (
              <>
                Western astrology calls this date {""}
                <span className="text-amber-200">
                  {tropical.symbol} {tropical.name}
                </span>
                {matches ? (
                  " — and the actual sky agrees today."
                ) : (
                  <>
                    , but the Sun is actually in front of{" "}
                    <span className="text-blue-200">{realName}</span> right now.
                  </>
                )}
              </>
            )}
            <br />
            <span className="text-white/50">
              Ecliptic longitude {sun.eclipticLongitude?.toFixed(2)}° • RA{" "}
              {sun.ra.toFixed(2)}h • Dec {sun.dec.toFixed(2)}°
            </span>
          </div>
        </motion.div>
      ) : (
        <motion.button
          key="pill"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          onClick={() => setOpen(true)}
          aria-label="Show real sign reveal"
          title="Show real sign reveal"
          className="glass rounded-full pl-3 pr-3.5 py-1.5 flex items-center gap-2 text-xs sm:text-sm text-white/85 hover:text-white active:bg-white/10"
        >
          {tropical && (
            <span className="text-amber-200 text-base leading-none">
              {tropical.symbol}
            </span>
          )}
          <span className="text-white/60">Real sign:</span>
          <span className="text-blue-200 font-medium">{realName}</span>
          <span className="text-white/40 ml-1">›</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

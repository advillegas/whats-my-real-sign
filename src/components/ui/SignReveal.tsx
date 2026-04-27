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
    <AnimatePresence>
      <motion.div
        key={realName}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.6 }}
        className="glass rounded-2xl px-3.5 py-3 sm:px-5 sm:py-4 max-w-md"
      >
        <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.24em] sm:tracking-[0.28em] text-blue-200/70">
          Constellation behind the Sun
        </div>
        <div className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
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
    </AnimatePresence>
  );
}

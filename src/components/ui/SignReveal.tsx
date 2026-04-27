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
import { SwipeDismiss } from "./SwipeDismiss";

const PRECESSION_RATE_ARCSEC_PER_YR = 50.29;
const PRECESSION_PERIOD_YR = 25772;
const YEARS_PER_DEGREE = 3600 / PRECESSION_RATE_ARCSEC_PER_YR;
const BABYLONIAN_REF_YEAR = -500;
const OBLIQUITY_DEG = 23.44;
const EQUATORIAL_BULGE_KM = 21.4;

function fmtYearLabel(jsYear: number): string {
  return jsYear >= 1 ? `${jsYear} CE` : `${1 - jsYear} BCE`;
}

export function SignReveal() {
  const date = useViewer((s) => s.date);
  const [bounds, setBounds] = useState<ConstellationBoundary[] | null>(null);
  const [open, setOpen] = useState(true);
  const [showWhy, setShowWhy] = useState(false);

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

  const userJsYear = date.getFullYear();
  const yearsFromBabylonian = userJsYear - BABYLONIAN_REF_YEAR;
  const cumulativeDriftDeg =
    (yearsFromBabylonian * PRECESSION_RATE_ARCSEC_PER_YR) / 3600;
  const driftAbs = Math.abs(cumulativeDriftDeg);
  const yearsAbs = Math.abs(yearsFromBabylonian);
  const driftMagnitudeLabel =
    driftAbs < 1
      ? "less than a degree"
      : driftAbs < 15
      ? "a fraction of a sign"
      : driftAbs < 30
      ? "almost a full zodiac sign"
      : driftAbs < 60
      ? "more than a full zodiac sign"
      : `${(driftAbs / 30).toFixed(1)} zodiac signs`;

  if (!open) {
    return (
      <button
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
      </button>
    );
  }

  return (
    <SwipeDismiss
      onDismiss={() => setOpen(false)}
      className="glass rounded-2xl px-5 py-4 sm:px-6 sm:py-5 max-w-md relative max-h-[75vh] overflow-y-auto scrollbar-none overscroll-contain"
    >
      <button
        onClick={() => setOpen(false)}
        aria-label="Hide constellation reveal"
        title="Hide for a fuller view of the sky"
        className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 w-7 h-7 sm:w-8 sm:h-8 grid place-items-center rounded-full text-white/55 hover:text-white hover:bg-white/10 active:bg-white/20 transition text-lg leading-none z-10"
      >
        ×
      </button>
      <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.24em] sm:tracking-[0.28em] text-blue-200/70 pr-9">
        Constellation behind the Sun
      </div>
      <div className="mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight text-white pr-9">
        {realName}
      </div>

      <p className="mt-2.5 text-[11px] sm:text-xs text-white/60 leading-relaxed">
        Your real zodiac sign is the constellation positioned directly behind
        the Sun on the day you were born.
      </p>

      <div className="mt-2.5 sm:mt-3 text-[11px] sm:text-xs text-white/70 leading-relaxed">
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

      {!matches && tropical && (
        <button
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          className="mt-3 text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-blue-200/80 hover:text-blue-100 transition flex items-center gap-1 self-start"
        >
          <span>{showWhy ? "Hide the science" : "Why is this different from my horoscope?"}</span>
          <span className={`transition-transform ${showWhy ? "rotate-90" : ""}`}>›</span>
        </button>
      )}

      <AnimatePresence initial={false}>
        {showWhy && tropical && (
          <motion.div
            key="why"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10 text-[11px] sm:text-[12px] text-white/75 leading-relaxed space-y-3">
              <p>
                The 12 zodiac signs were systematized by Babylonian
                astronomers in the 5th–4th century BCE, who divided the
                ecliptic into twelve equal{" "}
                <span className="text-white">30°</span> sectors named for
                the constellations the Sun passed through at that time.
                Today is{" "}
                <span className="text-white">{fmtYearLabel(userJsYear)}</span>
                {" "}—{" "}
                <span className="text-white">
                  ~{yearsAbs.toLocaleString()} years
                </span>{" "}
                {yearsFromBabylonian >= 0 ? "after" : "before"} that
                Babylonian baseline.
              </p>

              <p>
                Earth&apos;s rotational axis is tilted{" "}
                <span className="text-white">{OBLIQUITY_DEG}°</span> from
                its orbital plane, and Earth is slightly oblate — about{" "}
                <span className="text-white">{EQUATORIAL_BULGE_KM} km</span>{" "}
                wider at the equator than between the poles. The Sun and
                Moon pull on this equatorial bulge, applying a torque that
                makes the spin axis trace a slow cone in space. This is
                the <span className="text-amber-200">precession of the equinoxes</span>,
                completing one full revolution every{" "}
                <span className="text-white">
                  {PRECESSION_PERIOD_YR.toLocaleString()} years
                </span>{" "}
                (a &quot;Great Year&quot;).
              </p>

              <p>
                The vernal equinox — the Sun&apos;s position on the first
                day of northern spring — drifts westward along the ecliptic
                at{" "}
                <span className="text-white">
                  {PRECESSION_RATE_ARCSEC_PER_YR}″/year
                </span>
                , or{" "}
                <span className="text-white">
                  1° every {YEARS_PER_DEGREE.toFixed(1)} years
                </span>
                . Over the {yearsAbs.toLocaleString()} years separating
                this date from Babylonian times, that adds up to{" "}
                <span className="text-amber-200">
                  {driftAbs.toFixed(1)}°
                </span>{" "}
                of drift — {driftMagnitudeLabel}.
              </p>

              <p>
                That&apos;s why the Sun is actually in front of{" "}
                <span className="text-blue-200">{realName}</span> on a
                date that horoscopes — using boundaries fixed ~2,500 years
                ago — still call{" "}
                <span className="text-amber-200">{tropical.name}</span>.
                The signs didn&apos;t move; the sky did.
              </p>

              <p className="text-white/45 text-[10px] leading-snug pt-1">
                Polaris is currently Earth&apos;s pole star; in ~12,000 years
                Vega will take over as the axis precesses. The torque
                formula was first worked out by Newton in the{" "}
                <i>Principia</i> (1687); Hipparchus discovered the effect
                observationally around 129 BCE.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SwipeDismiss>
  );
}

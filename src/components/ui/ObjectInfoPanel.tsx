"use client";

/**
 * Object info panel — research-grade.
 *
 * For stars: spectral type, derived effective temperature (Ballesteros), B-V
 * colour, parallax-derived distance (pc + ly), absolute magnitude, variable
 * flag, and cross-IDs (HD / HIP / HR / Bayer / Flamsteed / Gliese).
 *
 * For DSOs: type, Messier / NGC / IC numbers, common names, angular size and
 * orientation, and a DSS / Hubble thumbnail when available
 * (`public/data/dso-thumbs.json`).
 *
 * Both: J2000 RA/Dec; alt/az when an observer is set; Wikipedia summary.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useViewer } from "@/store/viewer-store";
import type { StarRecord, DsoRecord } from "@/lib/catalogs";
import {
  bvToTeff,
  constellationFullName,
  dsoTypeName,
  expandBayerFlamsteed,
  formatDec,
  formatDegMin,
  formatDistance,
  formatRA,
  pcToLightYears,
  wikiCandidates,
} from "@/lib/object-info";
import { raDecToAltAz } from "@/lib/astronomy";

interface WikiSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page?: string } };
}

let dsoThumbsCache: Record<string, string> | null = null;
let dsoThumbsPromise: Promise<Record<string, string>> | null = null;

function loadDsoThumbs(): Promise<Record<string, string>> {
  if (dsoThumbsCache) return Promise.resolve(dsoThumbsCache);
  if (!dsoThumbsPromise) {
    dsoThumbsPromise = fetch("/data/dso-thumbs.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        dsoThumbsCache = d as Record<string, string>;
        return dsoThumbsCache;
      })
      .catch(() => ({}));
  }
  return dsoThumbsPromise;
}

export function ObjectInfoPanel() {
  const selected = useViewer((s) => s.selected);
  const setSelected = useViewer((s) => s.setSelected);
  const tooltipsEnabled = useViewer((s) => s.tooltipsEnabled);
  const observer = useViewer((s) => s.observer);
  const date = useViewer((s) => s.date);
  const [wiki, setWiki] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [dsoThumb, setDsoThumb] = useState<string | null>(null);

  const record = selected?.record;
  const isStar = selected?.kind === "star" && record;
  const isDso = selected?.kind === "dso" && record;
  const star = isStar ? (record as StarRecord) : null;
  const dso = isDso ? (record as DsoRecord) : null;

  useEffect(() => {
    setWiki(null);
    if (!selected || !selected.wikiTitle) return;
    const candidates = wikiCandidates(
      selected.kind,
      selected.wikiTitle,
      selected.record as StarRecord | DsoRecord | null | undefined,
    );
    if (candidates.length === 0) return;
    setLoading(true);
    const ctrl = new AbortController();
    const param = candidates.map(encodeURIComponent).join("|");
    fetch(`/api/wiki?titles=${param}`, { signal: ctrl.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as WikiSummary) : null))
      .then((d) => setWiki(d))
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [selected]);

  useEffect(() => {
    setDsoThumb(null);
    if (!dso) return;
    let alive = true;
    loadDsoThumbs().then((thumbs) => {
      if (!alive) return;
      const keys = [
        dso.m ? `M${dso.m}` : null,
        dso.id,
        dso.ngc,
        dso.ic,
      ].filter(Boolean) as string[];
      for (const k of keys) {
        if (thumbs[k]) {
          setDsoThumb(thumbs[k]);
          return;
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [dso]);

  const altAz = useMemo(() => {
    if (!selected || !observer) return null;
    return raDecToAltAz(
      selected.ra,
      selected.dec,
      observer.lat,
      observer.lon,
      date,
    );
  }, [selected, observer, date]);

  return (
    <AnimatePresence>
      {selected && tooltipsEnabled && (
        <motion.aside
          key={selected.id}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.25 }}
          className="glass fixed inset-x-2 bottom-20 sm:inset-x-auto sm:left-auto sm:right-5 sm:bottom-[8.5rem] sm:top-auto rounded-2xl p-4 sm:max-w-sm sm:w-[22rem] flex flex-col gap-3 z-40 max-h-[60vh] sm:max-h-[60vh] overflow-y-auto scrollbar-none safe-left safe-right shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70">
                {selected.kind}
                {dso && ` • ${dsoTypeName(dso.type)}`}
              </div>
              <div className="text-lg sm:text-xl font-semibold mt-0.5 text-white leading-tight">
                {selected.name}
              </div>
              {dso?.commonNames && dso.commonNames.length > 0 && (
                <div className="text-[11px] text-white/55 mt-0.5 italic">
                  also {dso.commonNames.slice(0, 3).join(", ")}
                </div>
              )}
              {star?.con && (
                <div className="text-[11px] text-white/65 mt-0.5">
                  in {constellationFullName(star.con) ?? star.con}
                </div>
              )}
              {dso?.con && !dso.commonNames?.length && (
                <div className="text-[11px] text-white/65 mt-0.5">
                  in {constellationFullName(dso.con) ?? dso.con}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-white/50 hover:text-white text-2xl leading-none w-9 h-9 grid place-items-center rounded hover:bg-white/10 active:bg-white/20 shrink-0"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono text-white/85 border-t border-white/10 pt-2">
            <div className="text-blue-200/65">α (J2000)</div>
            <div className="text-right">{formatRA(selected.ra)}</div>
            <div className="text-blue-200/65">δ (J2000)</div>
            <div className="text-right">{formatDec(selected.dec)}</div>
            {typeof selected.mag === "number" && (
              <>
                <div className="text-blue-200/65">apparent mag</div>
                <div className="text-right">{selected.mag.toFixed(2)}</div>
              </>
            )}
            {altAz && (
              <>
                <div className="text-blue-200/65">altitude</div>
                <div className="text-right">{formatDegMin(altAz.alt)}</div>
                <div className="text-blue-200/65">azimuth</div>
                <div className="text-right">{formatDegMin(altAz.az)}</div>
              </>
            )}
          </div>

          {/* Star astrophysics */}
          {star && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono text-white/85 border-t border-white/10 pt-2">
              {star.spect && (
                <>
                  <div className="text-blue-200/65">spectral type</div>
                  <div className="text-right">{star.spect}</div>
                </>
              )}
              {Number.isFinite(star.bv) && (
                <>
                  <div className="text-blue-200/65">B-V color</div>
                  <div className="text-right">{star.bv.toFixed(2)}</div>
                  <div className="text-blue-200/65">T<sub>eff</sub> (est.)</div>
                  <div className="text-right">
                    {Math.round(bvToTeff(star.bv))} K
                  </div>
                </>
              )}
              {typeof star.distPc === "number" && (
                <>
                  <div className="text-blue-200/65">distance</div>
                  <div className="text-right">{formatDistance(star.distPc)}</div>
                </>
              )}
              {typeof star.absMag === "number" && (
                <>
                  <div className="text-blue-200/65">absolute mag</div>
                  <div className="text-right">{star.absMag.toFixed(2)}</div>
                </>
              )}
              {star.variable && (
                <>
                  <div className="text-blue-200/65">variable</div>
                  <div className="text-right">yes</div>
                </>
              )}
            </div>
          )}

          {/* Star cross-IDs */}
          {star && (
            <div className="text-[10px] font-mono text-white/55 border-t border-white/10 pt-2 flex flex-wrap gap-x-3 gap-y-1">
              {(() => {
                const { bayer, flamsteed } = expandBayerFlamsteed(star.bf);
                const ids: string[] = [];
                if (bayer) ids.push(bayer);
                if (flamsteed) ids.push(flamsteed);
                if (star.hd) ids.push(`HD ${star.hd}`);
                if (star.hip) ids.push(`HIP ${star.hip}`);
                if (star.hr) ids.push(`HR ${star.hr}`);
                if (star.gl) ids.push(star.gl);
                return ids.map((id) => (
                  <span key={id} className="text-white/65">
                    {id}
                  </span>
                ));
              })()}
            </div>
          )}

          {/* DSO data */}
          {dso && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono text-white/85 border-t border-white/10 pt-2">
              {dso.m && (
                <>
                  <div className="text-blue-200/65">Messier</div>
                  <div className="text-right">M {dso.m}</div>
                </>
              )}
              {dso.size && (
                <>
                  <div className="text-blue-200/65">size</div>
                  <div className="text-right">
                    {dso.size.toFixed(1)}'
                    {dso.sizeMinor && dso.sizeMinor !== dso.size
                      ? ` × ${dso.sizeMinor.toFixed(1)}'`
                      : ""}
                  </div>
                </>
              )}
              {typeof dso.posAngle === "number" && (
                <>
                  <div className="text-blue-200/65">position angle</div>
                  <div className="text-right">{dso.posAngle.toFixed(0)}°</div>
                </>
              )}
            </div>
          )}

          {/* DSO cross-IDs */}
          {dso && (
            <div className="text-[10px] font-mono text-white/55 border-t border-white/10 pt-2 flex flex-wrap gap-x-3 gap-y-1">
              {dso.id && <span className="text-white/65">{dso.id}</span>}
              {dso.ngc && <span className="text-white/65">NGC {dso.ngc}</span>}
              {dso.ic && <span className="text-white/65">IC {dso.ic}</span>}
            </div>
          )}

          {/* DSO thumbnail */}
          {dso && dsoThumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dsoThumb}
              alt={`${selected.name} astronomical image`}
              className="rounded-lg max-h-40 object-cover w-full border border-white/10"
              onError={() => setDsoThumb(null)}
            />
          )}

          {/* Wiki */}
          {!dsoThumb && wiki?.thumbnail?.source && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wiki.thumbnail.source}
              alt=""
              className="rounded-lg max-h-32 object-cover w-full"
            />
          )}
          <div className="text-[12px] sm:text-[13px] text-white/85 leading-relaxed min-h-[1rem] flex flex-col gap-2">
            {loading ? (
              <span className="text-white/55 italic">Looking up Wikipedia summary…</span>
            ) : (
              (wiki?.extract ?? selected.blurb ?? "")
                .split(/\n+/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => <p key={i}>{p}</p>)
            )}
            {!loading && !wiki && !selected.blurb && (
              <span className="text-white/45 italic">
                No Wikipedia summary available.
              </span>
            )}
          </div>
          {wiki?.content_urls?.desktop?.page && (
            <a
              href={wiki.content_urls.desktop.page}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-300 hover:text-blue-200 self-start"
            >
              Read more on Wikipedia →
            </a>
          )}
          {/* Side-info: estimate distance in ly inline for stars */}
          {star && typeof star.distPc === "number" && star.distPc < 1000 && (
            <div className="text-[10px] text-white/45 italic border-t border-white/10 pt-2">
              Light from {star.name ?? star.id} takes ≈
              {pcToLightYears(star.distPc).toFixed(0)} years to reach Earth.
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

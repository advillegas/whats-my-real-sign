"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useViewer } from "@/store/viewer-store";

interface WikiSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page?: string } };
}

export function ObjectInfoPanel() {
  const selected = useViewer((s) => s.selected);
  const setSelected = useViewer((s) => s.setSelected);
  const [wiki, setWiki] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setWiki(null);
    if (!selected?.wikiTitle) return;
    setLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/wiki?title=${encodeURIComponent(selected.wikiTitle)}`, {
      signal: ctrl.signal,
    })
      .then(async (r) => (r.ok ? ((await r.json()) as WikiSummary) : null))
      .then((d) => setWiki(d))
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [selected?.wikiTitle]);

  return (
    <AnimatePresence>
      {selected && (
        <motion.aside
          key={selected.id}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.25 }}
          className="glass fixed inset-x-2 bottom-20 sm:inset-x-auto sm:bottom-auto sm:top-24 sm:right-5 rounded-2xl p-4 sm:max-w-sm sm:w-[22rem] flex flex-col gap-3 z-40 max-h-[55vh] sm:max-h-[70vh] overflow-y-auto scrollbar-none safe-left safe-right shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70">
                {selected.kind}
              </div>
              <div className="text-lg sm:text-xl font-semibold mt-0.5 text-white leading-tight truncate">
                {selected.name}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/55 mt-1 font-mono">
                RA {selected.ra.toFixed(3)}h • Dec {selected.dec.toFixed(2)}°
                {typeof selected.mag === "number" && ` • mag ${selected.mag.toFixed(2)}`}
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-white/50 hover:text-white text-2xl leading-none w-9 h-9 grid place-items-center rounded hover:bg-white/10 active:bg-white/20 shrink-0"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          {selected.blurb && (
            <div className="text-[12px] text-white/75">{selected.blurb}</div>
          )}
          {wiki?.thumbnail?.source && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wiki.thumbnail.source}
              alt=""
              className="rounded-lg max-h-32 sm:max-h-40 object-cover w-full"
            />
          )}
          <div className="text-[12px] sm:text-[13px] text-white/85 leading-relaxed min-h-[1.5rem]">
            {loading
              ? "Looking up Wikipedia summary..."
              : wiki?.extract ?? (selected.wikiTitle ? "No summary available." : "")}
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
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

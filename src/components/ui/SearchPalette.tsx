"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type Fuse from "fuse.js";
import { useViewer } from "@/store/viewer-store";
import { loadStars, loadDeepSky } from "@/lib/catalogs";
import { loadMeta } from "@/lib/constellations";
import { buildSearchIndex, type SearchEntry } from "@/lib/search-index";
import { allBodySky } from "@/lib/astronomy";

export function SearchPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(0);
  const [fuse, setFuse] = useState<Fuse<SearchEntry> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const date = useViewer((s) => s.date);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);

  useEffect(() => {
    Promise.all([loadStars(), loadDeepSky(), loadMeta()]).then(([s, d, m]) => {
      setFuse(buildSearchIndex(s, d, m));
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      } else if (e.key === "/" && document.activeElement === document.body) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setHover(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery("");
    }
  }, [open]);

  const results = useMemo(() => {
    if (!fuse || !query.trim()) return [];
    return fuse.search(query, { limit: 12 }).map((r) => r.item);
  }, [fuse, query]);

  const onPick = (entry: SearchEntry) => {
    let { ra, dec } = entry;
    if (entry.kind === "planet") {
      const all = allBodySky(date);
      const found = all.find((b) => b.id === entry.id);
      if (found) {
        ra = found.ra;
        dec = found.dec;
      }
    }
    setCameraTarget(ra, dec, entry.kind === "constellation" ? 35 : 22);
    setSelected({
      id: entry.id,
      name: entry.name,
      ra,
      dec,
      kind: entry.kind,
      wikiTitle: entry.wikiTitle,
    });
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHover((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHover((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onPick(results[hover]);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="glass rounded-full sm:px-4 sm:py-2 sm:gap-3 px-0 py-0 w-10 h-10 sm:w-auto sm:h-auto text-sm text-white/80 hover:text-white active:bg-white/10 flex items-center justify-center sm:justify-start"
        aria-label="Search the sky"
        title="Search the sky"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sm:w-[14px] sm:h-[14px]">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <span className="hidden sm:inline">Search the sky</span>
        <kbd className="hidden sm:inline-block ml-1 text-[10px] text-white/50 border border-white/15 rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] sm:pt-[16vh] px-2 sm:px-0 safe-top safe-left safe-right"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className="glass rounded-2xl w-full sm:w-[34rem] sm:max-w-[92vw] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search stars, planets, Messier..."
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent text-white px-4 sm:px-5 py-3.5 sm:py-4 outline-none placeholder:text-white/40 text-base"
              />
              {results.length > 0 && (
                <ul className="border-t border-white/10 max-h-[50vh] overflow-auto scrollbar-none">
                  {results.map((r, i) => (
                    <li key={r.id}>
                      <button
                        onMouseEnter={() => setHover(i)}
                        onClick={() => onPick(r)}
                        className={`w-full text-left px-4 sm:px-5 py-3 sm:py-2.5 flex items-center justify-between gap-3 ${
                          i === hover ? "bg-white/10" : "hover:bg-white/5 active:bg-white/10"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-white text-sm truncate">{r.name}</div>
                          <div className="text-[11px] text-white/55 truncate">
                            {r.subtitle}
                          </div>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-blue-200/60 shrink-0">
                          {r.kind}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && results.length === 0 && (
                <div className="border-t border-white/10 px-5 py-4 text-sm text-white/55">
                  No matches for &ldquo;{query}&rdquo;.
                </div>
              )}
              {!query.trim() && (
                <div className="border-t border-white/10 px-5 py-4 text-xs text-white/45">
                  Try {""}
                  <span className="text-white/75">Sirius</span>
                  {", "}
                  <span className="text-white/75">M31</span>
                  {", "}
                  <span className="text-white/75">Orion</span>
                  {", or "}
                  <span className="text-white/75">Saturn</span>
                  .
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Apod {
  title: string;
  date: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video" | string;
  copyright?: string;
}

export function ApodCard() {
  const [data, setData] = useState<Apod | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/apod")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Apod | null) => setData(d))
      .catch(() => {
        /* ignore */
      });
  }, []);

  if (!data || dismissed) return null;
  const isImage = data.media_type === "image";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="glass rounded-2xl overflow-hidden text-left max-w-[18rem] hover:ring-1 hover:ring-blue-300/40 relative"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
          }}
          aria-label="Close NASA APOD"
          className="absolute top-1.5 right-1.5 z-10 w-7 h-7 grid place-items-center rounded-full bg-black/55 hover:bg-black/80 text-white/80 hover:text-white text-base leading-none backdrop-blur-sm shadow-md"
        >
          ×
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="block w-full text-left"
          aria-label={open ? "Collapse NASA APOD" : "Expand NASA APOD"}
        >
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.url}
              alt={data.title}
              className="w-full h-32 object-cover"
            />
          )}
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70">
              NASA APOD • {data.date}
            </div>
            <div className="text-sm text-white mt-0.5 line-clamp-2 pr-6">
              {data.title}
            </div>
            {open && (
              <div className="text-[12px] text-white/70 mt-2 leading-snug max-h-40 overflow-auto scrollbar-none">
                {data.explanation}
              </div>
            )}
          </div>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

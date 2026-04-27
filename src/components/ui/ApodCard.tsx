"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

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

  useEffect(() => {
    fetch("/api/apod")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Apod | null) => setData(d))
      .catch(() => {
        /* ignore */
      });
  }, []);

  if (!data) return null;
  const isImage = data.media_type === "image";

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => setOpen((v) => !v)}
      className="glass rounded-2xl overflow-hidden text-left max-w-[18rem] hover:ring-1 hover:ring-blue-300/40"
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
        <div className="text-sm text-white mt-0.5 line-clamp-2">{data.title}</div>
        {open && (
          <div className="text-[12px] text-white/70 mt-2 leading-snug max-h-40 overflow-auto scrollbar-none">
            {data.explanation}
          </div>
        )}
      </div>
    </motion.button>
  );
}

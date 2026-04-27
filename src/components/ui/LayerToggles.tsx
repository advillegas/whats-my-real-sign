"use client";

import { useState } from "react";
import { useViewer, type LayerToggle } from "@/store/viewer-store";

const ITEMS: { id: LayerToggle; label: string }[] = [
  { id: "stars", label: "Stars" },
  { id: "lines", label: "Constellation lines" },
  { id: "boundaries", label: "Boundaries" },
  { id: "labels", label: "Labels" },
  { id: "milkyway", label: "Milky Way" },
  { id: "planets", label: "Planets" },
  { id: "dso", label: "Deep-sky" },
];

const LayersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

export function LayerToggles() {
  const layers = useViewer((s) => s.layers);
  const toggle = useViewer((s) => s.toggleLayer);
  const tooltipsEnabled = useViewer((s) => s.tooltipsEnabled);
  const toggleTooltips = useViewer((s) => s.toggleTooltips);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Layers"
        aria-label="Toggle layer controls"
        className="glass sm:hidden flex items-center justify-center w-10 h-10 rounded-lg text-white/85 hover:text-white active:bg-white/10 transition shadow-lg"
      >
        <LayersIcon />
      </button>

      <div
        className={`${open ? "flex" : "hidden"} sm:flex absolute sm:static bottom-12 right-0 sm:bottom-auto glass rounded-2xl p-3 flex-col gap-1.5 text-xs min-w-[200px] shadow-xl`}
      >
        <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70 mb-1 px-1">
          Layers
        </div>
        {ITEMS.map((item) => (
          <label
            key={item.id}
            className="flex items-center gap-2 px-1.5 py-2 sm:py-1 rounded hover:bg-white/5 active:bg-white/10 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={layers[item.id]}
              onChange={() => toggle(item.id)}
              className="accent-blue-300 w-4 h-4"
            />
            <span className="text-white/85">{item.label}</span>
          </label>
        ))}

        <div className="border-t border-white/10 mt-2 pt-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70 mb-1 px-1">
            Interaction
          </div>
          <label
            className="flex items-center gap-2 px-1.5 py-2 sm:py-1 rounded hover:bg-white/5 active:bg-white/10 cursor-pointer select-none"
            title="Show floating labels and auto-open the description panel when hovering"
          >
            <input
              type="checkbox"
              checked={tooltipsEnabled}
              onChange={() => toggleTooltips()}
              className="accent-blue-300 w-4 h-4"
            />
            <span className="text-white/85">Hover tooltips</span>
          </label>
        </div>
      </div>
    </div>
  );
}

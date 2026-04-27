"use client";

import { useState } from "react";
import { useViewer, type LayerToggle } from "@/store/viewer-store";

interface ToggleItem {
  id: LayerToggle;
  label: string;
  hint?: string;
}

const SKY_ITEMS: ToggleItem[] = [
  { id: "stars", label: "Stars" },
  { id: "lines", label: "Constellation lines" },
  { id: "boundaries", label: "Boundaries" },
  { id: "labels", label: "Labels" },
  { id: "milkyway", label: "Milky Way" },
  { id: "planets", label: "Planets" },
  { id: "dso", label: "Deep-sky" },
];

const FRAME_ITEMS: ToggleItem[] = [
  { id: "gridEquatorial", label: "Equatorial grid", hint: "RA/Dec hour-circles + parallels" },
  { id: "gridEcliptic", label: "Ecliptic", hint: "Sun's path; J2000 obliquity 23.44°" },
  { id: "gridGalactic", label: "Galactic plane", hint: "Milky Way disk reference" },
  { id: "poles", label: "Celestial poles", hint: "NCP and SCP markers" },
  { id: "horizon", label: "Horizon", hint: "Visible only with an observer location" },
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
        className={`${open ? "flex" : "hidden"} sm:flex absolute sm:static bottom-12 right-0 sm:bottom-auto glass rounded-2xl p-3 flex-col gap-1.5 text-xs min-w-[220px] max-h-[70vh] overflow-y-auto scrollbar-none shadow-xl`}
      >
        <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70 mb-1 px-1">
          Sky
        </div>
        {SKY_ITEMS.map((item) => (
          <ToggleRow
            key={item.id}
            item={item}
            checked={layers[item.id]}
            onChange={() => toggle(item.id)}
          />
        ))}

        <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70 mt-3 mb-1 px-1">
          Reference frames
        </div>
        {FRAME_ITEMS.map((item) => (
          <ToggleRow
            key={item.id}
            item={item}
            checked={layers[item.id]}
            onChange={() => toggle(item.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  item,
  checked,
  onChange,
}: {
  item: ToggleItem;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className="flex items-center gap-2 px-1.5 py-2 sm:py-1 rounded hover:bg-white/5 active:bg-white/10 cursor-pointer select-none"
      title={item.hint ?? item.label}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-blue-300 w-4 h-4"
      />
      <span className="text-white/85">{item.label}</span>
    </label>
  );
}

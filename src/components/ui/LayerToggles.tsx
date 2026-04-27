"use client";

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

export function LayerToggles() {
  const layers = useViewer((s) => s.layers);
  const toggle = useViewer((s) => s.toggleLayer);
  return (
    <div className="glass rounded-2xl p-3 flex flex-col gap-1.5 text-xs">
      <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70 mb-1 px-1">
        Layers
      </div>
      {ITEMS.map((item) => (
        <label
          key={item.id}
          className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white/5 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={layers[item.id]}
            onChange={() => toggle(item.id)}
            className="accent-blue-300"
          />
          <span className="text-white/85">{item.label}</span>
        </label>
      ))}
    </div>
  );
}

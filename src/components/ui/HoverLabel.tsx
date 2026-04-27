"use client";

/**
 * Floating tooltip-style label that follows the cursor and reflects whatever
 * celestial object the Hover ray currently hits. Rendered as plain DOM (not
 * inside the Canvas) so it stays sharp at any DPR and is unaffected by tone
 * mapping or bloom.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useViewer } from "@/store/viewer-store";

const KIND_COLOR: Record<string, string> = {
  star: "rgba(180, 210, 255, 0.95)",
  planet: "rgba(255, 210, 140, 0.95)",
  dso: "rgba(220, 180, 255, 0.95)",
  constellation: "rgba(160, 200, 255, 0.85)",
};

const KIND_DOT: Record<string, string> = {
  star: "#bcd1ff",
  planet: "#ffc97a",
  dso: "#d2a4ff",
  constellation: "#7fb6ff",
};

export function HoverLabel() {
  const hover = useViewer((s) => s.hover);
  const tooltipsEnabled = useViewer((s) => s.tooltipsEnabled);

  return (
    <div className="pointer-events-none fixed inset-0 z-[35]">
      <AnimatePresence>
        {hover && tooltipsEnabled && (
          <motion.div
            key={hover.name + hover.kind}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "absolute",
              left: hover.x + 14,
              top: hover.y + 14,
              maxWidth: 260,
            }}
            className="rounded-md border border-white/15 bg-black/70 px-3 py-1.5 text-xs shadow-lg backdrop-blur-md"
          >
            <div
              className="flex items-center gap-2 font-medium"
              style={{ color: KIND_COLOR[hover.kind] ?? "white" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: KIND_DOT[hover.kind] ?? "white" }}
              />
              {hover.name}
            </div>
            {hover.subtitle && (
              <div className="mt-0.5 text-[11px] text-white/55">
                {hover.subtitle}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

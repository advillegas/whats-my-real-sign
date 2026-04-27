"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function HelpHint() {
  const [show, setShow] = useState(true);
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    }
    const t = setTimeout(() => setShow(false), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-[11px] text-white/45 text-center px-2"
        >
          {isTouch ? (
            <>Drag to look • Pinch to zoom • Tap objects for info</>
          ) : (
            <>
              Drag to look around • Scroll to zoom • Press
              <kbd className="mx-1 border border-white/15 rounded px-1 py-0.5 text-[10px]">⌘K</kbd>
              to search
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

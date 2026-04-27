"use client";

import { useState } from "react";

/**
 * One-shot detection of a touch-first input device.
 *
 * Reads `matchMedia("(pointer: coarse)")` once at mount; we deliberately do
 * not subscribe to changes because the hook drives "should this card be
 * swipe-dismissable?" decisions, and changing that mid-session leads to
 * weirder UX than just locking it in.
 */
export function useIsTouch(): boolean {
  const [touch] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  });
  return touch;
}

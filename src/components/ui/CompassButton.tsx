"use client";

/**
 * Mobile-only "AR" toggle: while on, the device gyro+compass drives the
 * camera so what you see on-screen tracks where the phone is physically
 * pointed.
 *
 * Hidden on desktops or browsers without `DeviceOrientationEvent`. On iOS
 * the very first tap also calls `requestPermission()` which Safari only
 * accepts from inside a user-gesture callback, hence the click-handler
 * gating.
 *
 * If no observer location is set yet, the button opens the supplied
 * Location modal first (compass math is observer-dependent), then auto-
 * enables compass mode once a location lands in the store.
 */

import { useEffect, useRef, useState } from "react";
import { useViewer } from "@/store/viewer-store";
import { requestCompassPermission } from "@/components/StarMap/CompassDriver";

interface Props {
  /** Called when the user taps Compass without an observer set. */
  onNeedObserver: () => void;
}

const CompassIcon = ({ active }: { active: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="9" />
    <polygon points="16 8 12 13 8 16 12 11" fill={active ? "currentColor" : "none"} />
  </svg>
);

function useIsCompassSupported(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof DeviceOrientationEvent === "undefined") return;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    const isNarrow = window.innerWidth < 900;
    setSupported(isCoarse || isNarrow);
  }, []);
  return supported;
}

export function CompassButton({ onNeedObserver }: Props) {
  const supported = useIsCompassSupported();
  const compassMode = useViewer((s) => s.compassMode);
  const observer = useViewer((s) => s.observer);
  const setCompassMode = useViewer((s) => s.setCompassMode);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // If the user opened the location modal because compass needed an
  // observer, we want to auto-enable compass once a location appears.
  const armOnObserver = useRef(false);

  useEffect(() => {
    if (!armOnObserver.current) return;
    if (!observer) return;
    armOnObserver.current = false;
    void enableCompass();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observer]);

  const showHint = (message: string) => {
    setHint(message);
    window.setTimeout(() => setHint(null), 3200);
  };

  const enableCompass = async () => {
    setBusy(true);
    try {
      const ok = await requestCompassPermission();
      if (!ok) {
        showHint("Sensor access denied. Allow Motion & Orientation access in Safari Settings.");
        return;
      }
      setCompassMode(true);
    } finally {
      setBusy(false);
    }
  };

  const onClick = async () => {
    if (compassMode) {
      setCompassMode(false);
      return;
    }
    if (!observer) {
      armOnObserver.current = true;
      onNeedObserver();
      showHint("Set your viewing location first.");
      return;
    }
    await enableCompass();
  };

  if (!supported) return null;

  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={busy}
        className={`glass rounded-full sm:px-3 sm:py-2 px-0 py-0 w-10 h-10 sm:w-auto sm:h-auto text-sm active:bg-white/10 flex items-center justify-center sm:justify-start sm:gap-2 transition ${
          compassMode
            ? "text-emerald-200 ring-1 ring-emerald-300/40"
            : "text-white/80 hover:text-white"
        } disabled:opacity-50`}
        aria-label={compassMode ? "Turn off compass mode" : "Turn on compass mode"}
        aria-pressed={compassMode}
        title={
          compassMode
            ? "AR on — point your phone at the sky"
            : "AR — point your phone at the sky"
        }
      >
        <CompassIcon active={compassMode} />
        <span className="hidden sm:inline">
          {busy ? "..." : compassMode ? "AR on" : "AR"}
        </span>
      </button>
      {hint && (
        <div
          role="status"
          className="absolute right-0 top-full mt-2 w-[16rem] max-w-[80vw] rounded-lg glass px-3 py-2 text-[11px] leading-snug text-white/85 z-50"
        >
          {hint}
        </div>
      )}
    </div>
  );
}

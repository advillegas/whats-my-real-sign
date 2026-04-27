"use client";

import { useEffect, useRef } from "react";
import { useViewer } from "@/store/viewer-store";
import { sunSky } from "@/lib/astronomy";
import { easeInOutCubic, lerp } from "@/lib/tween";

const TWEEN_MS = 1500;

function fmtIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function DateScrubber() {
  const date = useViewer((s) => s.date);
  const requestedDate = useViewer((s) => s.requestedDate);
  const setDate = useViewer((s) => s.setDate);
  const setCurrentJdDate = useViewer((s) => s.setCurrentJdDate);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);

  const tween = useRef<{
    start: number;
    fromMs: number;
    toMs: number;
  } | null>(null);

  // Whenever requestedDate changes, kick off a tween of `date` toward it,
  // and steer the camera to the new Sun position.
  useEffect(() => {
    if (requestedDate.getTime() === date.getTime()) return;
    tween.current = {
      start: performance.now(),
      fromMs: date.getTime(),
      toMs: requestedDate.getTime(),
    };
    const targetSun = sunSky(requestedDate);
    setCameraTarget(targetSun.ra, targetSun.dec);
    let raf = 0;
    const step = () => {
      if (!tween.current) return;
      const t = (performance.now() - tween.current.start) / TWEEN_MS;
      if (t >= 1) {
        setCurrentJdDate(new Date(tween.current.toMs));
        tween.current = null;
        return;
      }
      const e = easeInOutCubic(t);
      const ms = lerp(tween.current.fromMs, tween.current.toMs, e);
      setCurrentJdDate(new Date(ms));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDate]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) return;
    const next = new Date(`${v}T12:00:00`);
    if (Number.isNaN(next.getTime())) return;
    setDate(next);
  };

  const onYearShift = (delta: number) => {
    const next = new Date(requestedDate);
    next.setFullYear(next.getFullYear() + delta);
    setDate(next);
  };

  const today = () => {
    setDate(new Date());
  };

  return (
    <div className="glass rounded-full px-2.5 py-1.5 sm:px-4 sm:py-2 flex items-center gap-1 sm:gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center">
      <button
        onClick={() => onYearShift(-1)}
        title="One year earlier"
        className="text-white/70 hover:text-white px-2 py-1.5 sm:py-1 rounded hover:bg-white/10 active:bg-white/20 transition min-h-[36px]"
      >
        −1y
      </button>
      <input
        type="date"
        value={fmtIso(requestedDate)}
        onChange={onChange}
        className="bg-transparent text-white/90 outline-none [color-scheme:dark] min-w-0 flex-1 sm:flex-none text-center"
      />
      <button
        onClick={() => onYearShift(1)}
        title="One year later"
        className="text-white/70 hover:text-white px-2 py-1.5 sm:py-1 rounded hover:bg-white/10 active:bg-white/20 transition min-h-[36px]"
      >
        +1y
      </button>
      <span className="w-px h-5 bg-white/15 mx-0.5 sm:mx-1" />
      <button
        onClick={today}
        className="text-blue-200 hover:text-blue-100 px-2 py-1.5 sm:py-1 rounded hover:bg-white/10 active:bg-white/20 transition min-h-[36px]"
      >
        Today
      </button>
    </div>
  );
}

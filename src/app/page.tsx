"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { SignReveal } from "@/components/ui/SignReveal";
import { DateScrubber } from "@/components/ui/DateScrubber";
import { LayerToggles } from "@/components/ui/LayerToggles";
import { ObjectInfoPanel } from "@/components/ui/ObjectInfoPanel";
import { SearchPalette } from "@/components/ui/SearchPalette";
import { ApodCard } from "@/components/ui/ApodCard";
import { HelpHint } from "@/components/ui/HelpHint";
import { sunSky } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";

const Scene = dynamic(() => import("@/components/StarMap/Scene").then((m) => m.Scene), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-white/50 text-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white/70 animate-spin" />
        Loading the night sky…
      </div>
    </div>
  ),
});

function AimAtTodaysSun() {
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  useEffect(() => {
    const sun = sunSky(new Date());
    setCameraTarget(sun.ra, sun.dec, 55);
  }, [setCameraTarget]);
  return null;
}

export default function Home() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <Scene />
      <AimAtTodaysSun />

      <header className="absolute top-0 inset-x-0 p-5 flex items-start justify-between gap-4 pointer-events-none z-10">
        <div className="pointer-events-auto">
          <div className="text-[10px] uppercase tracking-[0.32em] text-white/55">
            What&apos;s My Real Sign
          </div>
          <div className="text-white/85 text-sm mt-0.5">
            A scientifically accurate 3D sky.
          </div>
        </div>
        <div className="pointer-events-auto">
          <SearchPalette />
        </div>
      </header>

      <div className="absolute top-24 left-5 max-w-sm pointer-events-auto z-10">
        <SignReveal />
      </div>

      <div className="absolute top-24 right-5 pointer-events-auto z-10 flex flex-col gap-3 items-end">
        <ApodCard />
        <ObjectInfoPanel />
      </div>

      <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 pointer-events-none z-10">
        <div className="pointer-events-auto">
          <DateScrubber />
        </div>
        <div className="pointer-events-auto flex flex-col items-center gap-3">
          <HelpHint />
        </div>
        <div className="pointer-events-auto">
          <LayerToggles />
        </div>
      </div>
    </div>
  );
}

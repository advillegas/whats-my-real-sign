"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { SignReveal } from "@/components/ui/SignReveal";
import { DateScrubber } from "@/components/ui/DateScrubber";
import { LayerToggles } from "@/components/ui/LayerToggles";
import { ObjectInfoPanel } from "@/components/ui/ObjectInfoPanel";
import { TopBar } from "@/components/ui/TopBar";
import { ApodCard } from "@/components/ui/ApodCard";
import { HelpHint } from "@/components/ui/HelpHint";
import { ZoomControls } from "@/components/ui/ZoomControls";
import { CoordinateHUD } from "@/components/ui/CoordinateHUD";
import { UrlStateSync } from "@/components/ui/UrlStateSync";
import { sunSky } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";
import { parseUrl } from "@/lib/url-state";

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
    // If the URL is encoding a deep-link view, don't override it.
    if (typeof window !== "undefined") {
      const v = parseUrl();
      if (typeof v.ra === "number" && typeof v.dec === "number") return;
    }
    const sun = sunSky(new Date());
    setCameraTarget(sun.ra, sun.dec, 55);
  }, [setCameraTarget]);
  return null;
}

function MobileTooltipDefault() {
  useEffect(() => {
    const isMobile =
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    if (isMobile && useViewer.getState().tooltipsEnabled) {
      useViewer.getState().toggleTooltips();
    }
  }, []);
  return null;
}

export default function Home() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <Scene />
      <AimAtTodaysSun />
      <MobileTooltipDefault />
      <UrlStateSync />

      <header className="absolute top-0 inset-x-0 px-3 pt-3 sm:px-5 sm:pt-5 safe-top safe-left safe-right flex items-start justify-between gap-3 pointer-events-none z-10">
        <div className="pointer-events-auto">
          <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.28em] sm:tracking-[0.32em] text-white/55">
            What&apos;s My Real Sign
          </div>
          <div className="text-white/85 text-[11px] sm:text-sm mt-0.5 hidden sm:block">
            A scientifically accurate 3D sky.
          </div>
        </div>
        <div className="pointer-events-auto">
          <TopBar />
        </div>
      </header>

      <CoordinateHUD />

      <div className="absolute top-14 sm:top-24 left-2 right-2 sm:left-5 sm:right-auto sm:max-w-sm pointer-events-auto z-10">
        <SignReveal />
      </div>

      <div className="absolute top-14 sm:top-24 right-2 sm:right-5 pointer-events-auto z-10 flex flex-col gap-3 items-end max-w-[80vw] sm:max-w-sm hidden md:flex">
        <ApodCard />
      </div>

      <ObjectInfoPanel />

      <div className="absolute bottom-2 sm:bottom-5 left-2 right-2 sm:left-5 sm:right-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-end justify-between gap-2 sm:gap-4 pointer-events-none z-10 safe-bottom safe-left safe-right">
        <div className="pointer-events-auto">
          <DateScrubber />
        </div>
        <div className="pointer-events-auto flex flex-col items-center gap-3">
          <HelpHint />
        </div>
        <div className="pointer-events-auto flex flex-row sm:flex-row items-end justify-end gap-2">
          <ZoomControls />
          <LayerToggles />
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 text-center text-[9px] sm:text-[10px] text-white/30 pointer-events-none z-0 hidden md:block px-2 pb-1 safe-bottom">
        <span className="hidden lg:inline">Stars: </span>
        <a
          href="http://www.astronexus.com/hyg"
          className="underline pointer-events-auto"
          target="_blank"
          rel="noreferrer"
        >
          HYG v4.1
        </a>{" · "}
        <span className="hidden lg:inline">DSOs: </span>
        <a
          href="https://github.com/mattiaverga/OpenNGC"
          className="underline pointer-events-auto"
          target="_blank"
          rel="noreferrer"
        >
          OpenNGC
        </a>{" · "}
        <span className="hidden lg:inline">Constellations: </span>
        <a
          href="https://github.com/ofrohn/d3-celestial"
          className="underline pointer-events-auto"
          target="_blank"
          rel="noreferrer"
        >
          d3-celestial
        </a>{" · "}
        <span className="hidden lg:inline">Milky Way: </span>
        <a
          href="https://www.eso.org/public/images/eso0932a/"
          className="underline pointer-events-auto"
          target="_blank"
          rel="noreferrer"
        >
          ESO/S. Brunier
        </a>{" · "}
        <span className="hidden lg:inline">Planet textures: </span>
        <a
          href="https://www.solarsystemscope.com/textures/"
          className="underline pointer-events-auto"
          target="_blank"
          rel="noreferrer"
        >
          Solar System Scope
        </a>{" · DSO images via Wikimedia Commons"}
      </div>
    </div>
  );
}

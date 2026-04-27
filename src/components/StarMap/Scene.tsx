"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import { Stars } from "./Stars";
import { MilkyWay } from "./MilkyWay";
import { ProceduralStars } from "./ProceduralStars";
import { ConstellationLines } from "./ConstellationLines";
import { ConstellationBoundaries } from "./ConstellationBoundaries";
import { ConstellationLabels } from "./ConstellationLabels";
import { ConstellationHighlight } from "./ConstellationHighlight";
import { Sun } from "./Sun";
import { Planets } from "./Planets";
import { DeepSkyObjects } from "./DeepSkyObjects";
import { DsoExtent } from "./DsoExtent";
import { ReferenceFrames } from "./ReferenceFrames";
import { Horizon } from "./Horizon";
import { BrightStarLabels } from "./BrightStarLabels";
import { CameraRig } from "./CameraRig";
import { CompassDriver } from "./CompassDriver";
import { Picker } from "./Picker";
import { CoordinateHUDFeeder } from "@/components/ui/CoordinateHUD";
import {
  loadStars,
  loadStarsBootstrap,
  loadDeepSky,
  type StarRecord,
  type DsoRecord,
} from "@/lib/catalogs";
import { useViewer } from "@/store/viewer-store";

function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(pointer: coarse)").matches) return true;
  if (window.innerWidth < 768) return true;
  return false;
}

export function Scene() {
  const [stars, setStars] = useState<StarRecord[] | null>(null);
  const [dso, setDso] = useState<DsoRecord[] | null>(null);
  const isMobile = useMemo(() => detectMobile(), []);
  const compassMode = useViewer((s) => s.compassMode);

  // Two-stage load: bootstrap (~9k bright stars, ~1.5 MB) lights up the sky
  // immediately, then the deep mag-8.5 catalog (~62k stars, ~9 MB) replaces it.
  useEffect(() => {
    let alive = true;
    let bootstrapDone = false;

    loadStarsBootstrap().then((s) => {
      if (!alive || bootstrapDone) return;
      setStars(s);
    });
    loadStars().then((s) => {
      if (!alive) return;
      bootstrapDone = true;
      setStars(s);
    });
    loadDeepSky().then((d) => {
      if (!alive) return;
      setDso(d);
    });

    return () => {
      alive = false;
    };
  }, []);

  return (
    <Canvas
      gl={{
        antialias: false,
        // alpha:true so the page (and the camera-feed video underneath) shows
        // through whenever we render with a transparent clear colour.
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        outputColorSpace: SRGBColorSpace,
      }}
      camera={{ fov: 55, near: 0.1, far: 5000, position: [0, 0, 0] }}
      dpr={isMobile ? [1, 1.5] : [1, 2]}
      style={{
        position: "fixed",
        inset: 0,
        background: compassMode ? "transparent" : "black",
        touchAction: "none",
        // In AR mode the WebGL layer becomes a translucent overlay so the
        // user can see real sky behind the synthetic stars / labels.
        opacity: compassMode ? 0.55 : 1,
        transition: "opacity 320ms ease",
      }}
    >
      <CameraRig />
      <CompassDriver />
      <CoordinateHUDFeeder />
      {/* Hide the painted Milky Way / procedural starfield in AR mode —
          they'd just smear over the real sky. Real catalog stars +
          constellation lines + labels stay on. */}
      {!compassMode && (
        <Suspense fallback={null}>
          <MilkyWay quality={isMobile ? "low" : "high"} />
        </Suspense>
      )}
      {!isMobile && !compassMode && (
        <Suspense fallback={null}>
          <ProceduralStars />
        </Suspense>
      )}
      {stars && <Stars stars={stars} />}
      <ConstellationBoundaries />
      <ConstellationLines />
      {stars && <ConstellationHighlight stars={stars} />}
      <ConstellationLabels />
      <BrightStarLabels />
      <ReferenceFrames />
      <Horizon />
      <DeepSkyObjects />
      <DsoExtent />
      <Suspense fallback={null}>
        <Sun />
      </Suspense>
      <Suspense fallback={null}>
        <Planets />
      </Suspense>
      {stars && dso && <Picker stars={stars} dso={dso} />}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={compassMode ? 0.25 : isMobile ? 0.45 : 0.55}
          luminanceThreshold={0.95}
          luminanceSmoothing={0.25}
          mipmapBlur
          radius={isMobile ? 0.3 : 0.4}
        />
        <Vignette
          eskil={false}
          offset={0.2}
          darkness={compassMode ? 0 : 0.55}
        />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}

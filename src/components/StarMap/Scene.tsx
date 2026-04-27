"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import { Stars } from "./Stars";
import { MilkyWay } from "./MilkyWay";
import { ConstellationLines } from "./ConstellationLines";
import { ConstellationBoundaries } from "./ConstellationBoundaries";
import { ConstellationLabels } from "./ConstellationLabels";
import { Sun } from "./Sun";
import { Planets } from "./Planets";
import { DeepSkyObjects } from "./DeepSkyObjects";
import { CameraRig } from "./CameraRig";
import { Picker } from "./Picker";
import { loadStars, loadDeepSky, type StarRecord, type DsoRecord } from "@/lib/catalogs";

export function Scene() {
  const [stars, setStars] = useState<StarRecord[] | null>(null);
  const [dso, setDso] = useState<DsoRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadStars(), loadDeepSky()]).then(([s, d]) => {
      if (!alive) return;
      setStars(s);
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
        alpha: false,
        powerPreference: "high-performance",
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        outputColorSpace: SRGBColorSpace,
      }}
      camera={{ fov: 55, near: 0.1, far: 5000, position: [0, 0, 0] }}
      dpr={[1, 2]}
      style={{ position: "fixed", inset: 0, background: "black", touchAction: "none" }}
    >
      <CameraRig />
      <Suspense fallback={null}>
        <MilkyWay />
      </Suspense>
      {stars && <Stars stars={stars} />}
      <ConstellationBoundaries />
      <ConstellationLines />
      <ConstellationLabels />
      <DeepSkyObjects />
      <Suspense fallback={null}>
        <Sun />
      </Suspense>
      <Suspense fallback={null}>
        <Planets />
      </Suspense>
      {stars && dso && <Picker stars={stars} dso={dso} />}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          intensity={1.05}
          luminanceThreshold={0.55}
          luminanceSmoothing={0.4}
          mipmapBlur
          radius={0.78}
        />
        <Vignette eskil={false} offset={0.2} darkness={0.55} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}

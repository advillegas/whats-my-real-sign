"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
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
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ fov: 55, near: 0.1, far: 5000, position: [0, 0, 0] }}
      style={{ position: "fixed", inset: 0, background: "black", touchAction: "none" }}
    >
      <CameraRig />
      <MilkyWay />
      {stars && <Stars stars={stars} />}
      <ConstellationBoundaries />
      <ConstellationLines />
      <ConstellationLabels />
      <DeepSkyObjects />
      <Sun />
      <Planets />
      {stars && dso && <Picker stars={stars} dso={dso} />}
    </Canvas>
  );
}

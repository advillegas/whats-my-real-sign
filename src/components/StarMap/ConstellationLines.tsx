"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from "three";
import { CELESTIAL_RADIUS, raDecDegToVec3 } from "@/lib/coordinates";
import { loadConstellationLines } from "@/lib/catalogs";
import { useViewer } from "@/store/viewer-store";

interface LineFeature {
  id: string;
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
}

export function ConstellationLines() {
  const visible = useViewer((s) => s.layers.lines);
  const [features, setFeatures] = useState<LineFeature[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadConstellationLines().then((f) => {
      if (alive) setFeatures(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  const { geometry, material } = useMemo(() => {
    if (!features) {
      return { geometry: null, material: null };
    }
    const positions: number[] = [];
    const tmp = new Vector3();
    for (const f of features) {
      for (const line of f.geometry.coordinates) {
        for (let i = 0; i < line.length - 1; i++) {
          const [lonA, latA] = line[i];
          const [lonB, latB] = line[i + 1];
          raDecDegToVec3(lonA, latA, CELESTIAL_RADIUS * 0.995, tmp);
          positions.push(tmp.x, tmp.y, tmp.z);
          raDecDegToVec3(lonB, latB, CELESTIAL_RADIUS * 0.995, tmp);
          positions.push(tmp.x, tmp.y, tmp.z);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const mat = new LineBasicMaterial({
      color: 0x4f7fbf,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    return { geometry: geo, material: mat };
  }, [features]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
      material?.dispose();
    };
  }, [geometry, material]);

  if (!geometry || !material) return null;
  return (
    <lineSegments
      args={[geometry, material]}
      visible={visible}
      frustumCulled={false}
    />
  );
}

// Re-export for the JSX intrinsic.
export type _R3FLineSegments = LineSegments;

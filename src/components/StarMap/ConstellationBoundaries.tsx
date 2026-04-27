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
import { loadBoundaries, type ConstellationBoundary } from "@/lib/constellations";
import { useViewer } from "@/store/viewer-store";

export function ConstellationBoundaries() {
  const visible = useViewer((s) => s.layers.boundaries);
  const [bounds, setBounds] = useState<ConstellationBoundary[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadBoundaries().then((b) => {
      if (alive) setBounds(b);
    });
    return () => {
      alive = false;
    };
  }, []);

  const { geometry, material } = useMemo(() => {
    if (!bounds) return { geometry: null, material: null };
    const positions: number[] = [];
    const tmp = new Vector3();
    for (const b of bounds) {
      for (const ring of b.rings) {
        for (let i = 0; i < ring.length; i++) {
          const j = (i + 1) % ring.length;
          const [lonA, latA] = ring[i];
          const [lonB, latB] = ring[j];
          raDecDegToVec3(lonA, latA, CELESTIAL_RADIUS * 0.992, tmp);
          positions.push(tmp.x, tmp.y, tmp.z);
          raDecDegToVec3(lonB, latB, CELESTIAL_RADIUS * 0.992, tmp);
          positions.push(tmp.x, tmp.y, tmp.z);
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const mat = new LineBasicMaterial({
      color: 0x356491,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    return { geometry: geo, material: mat };
  }, [bounds]);

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

export type _R3FLineSegments = LineSegments;

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { useThree } from "@react-three/fiber";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { loadDeepSky, type DsoRecord } from "@/lib/catalogs";
import { useViewer } from "@/store/viewer-store";

const TYPE_COLOR: Record<string, [number, number, number]> = {
  G: [0.85, 0.65, 1.0],
  GPair: [0.85, 0.65, 1.0],
  GTrpl: [0.85, 0.65, 1.0],
  GGroup: [0.85, 0.65, 1.0],
  GCl: [1.0, 0.85, 0.55],
  OCl: [0.6, 0.95, 1.0],
  PN: [0.6, 1.0, 0.7],
  Neb: [1.0, 0.55, 0.7],
  EmN: [1.0, 0.5, 0.55],
  RfN: [0.95, 0.75, 1.0],
  SNR: [1.0, 0.85, 0.55],
  HII: [1.0, 0.55, 0.7],
};

const VS = /* glsl */ `
attribute vec3 dsoColor;
attribute float dsoSize;
varying vec3 vColor;
uniform float uPixelRatio;

void main() {
  vColor = dsoColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = dsoSize * uPixelRatio;
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  // Soft nebulous puff with a slightly brighter core. Bloom does the rest.
  float core = exp(-r * r * 6.0);
  float halo = pow(1.0 - r, 2.5);
  float intensity = core * 1.4 + halo * 0.5;
  gl_FragColor = vec4(vColor * intensity * 0.7, intensity);
}
`;

interface Props {
  /** Optional callback to deliver loaded list to a parent (e.g. for picker / search). */
  onLoaded?: (records: DsoRecord[]) => void;
}

export function DeepSkyObjects({ onLoaded }: Props) {
  const visible = useViewer((s) => s.layers.dso);
  const { gl } = useThree();
  const [records, setRecords] = useState<DsoRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadDeepSky().then((d) => {
      if (alive) {
        setRecords(d);
        onLoaded?.(d);
      }
    });
    return () => {
      alive = false;
    };
  }, [onLoaded]);

  const { geometry, material } = useMemo(() => {
    if (!records) return { geometry: null, material: null };
    const pos = new Float32Array(records.length * 3);
    const col = new Float32Array(records.length * 3);
    const siz = new Float32Array(records.length);
    const tmp = new Vector3();
    for (let i = 0; i < records.length; i++) {
      const d = records[i];
      raDecHoursToVec3(d.ra, d.dec, CELESTIAL_RADIUS * 0.99, tmp);
      pos[i * 3] = tmp.x;
      pos[i * 3 + 1] = tmp.y;
      pos[i * 3 + 2] = tmp.z;
      const c = TYPE_COLOR[d.type] ?? [0.7, 0.85, 1.0];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
      // Messier objects pop a bit larger
      const base = d.m ? 14 : 9;
      siz[i] = Math.max(5, base - d.mag * 0.6);
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("dsoColor", new Float32BufferAttribute(col, 3));
    geo.setAttribute("dsoSize", new Float32BufferAttribute(siz, 1));
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: gl.getPixelRatio() },
      },
    });
    return { geometry: geo, material: mat };
  }, [records, gl]);

  // Suppress unused color import warning by referencing
  void Color;

  useEffect(() => {
    return () => {
      geometry?.dispose();
      material?.dispose();
    };
  }, [geometry, material]);

  if (!geometry || !material) return null;
  return <points args={[geometry, material]} visible={visible} frustumCulled={false} />;
}

export type _R3FPoints = Points;

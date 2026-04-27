"use client";

/**
 * Deep-sky-object renderer.
 *
 * Two modes:
 *  • Point-sprite cloud (this file). Always-clickable instanced points; the
 *    fragment shader picks a glyph per object based on `dsoType` so galaxies,
 *    globulars, open clusters, planetary nebulae, emission nebulae and SNRs
 *    each look distinct at a glance.
 *  • DsoExtent component (separate file). For DSOs whose actual angular size
 *    projects to more than a few pixels at the current FOV, an oriented
 *    primitive is drawn on top so M31, the Veil, the LMC etc. read at their
 *    real size instead of as point sprites.
 *
 * Like the star renderer, this honours a live `uFov` for LOD and an optional
 * `uHorizonEnabled` / `uZenithDir` for below-horizon dimming.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { loadDeepSky, type DsoRecord } from "@/lib/catalogs";
import { useViewer } from "@/store/viewer-store";
import { lmstHours } from "@/lib/astronomy";

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

// Type id passed to the shader. Keep these stable.
const TYPE_ID: Record<string, number> = {
  G: 1,
  GPair: 1,
  GTrpl: 1,
  GGroup: 1,
  GCl: 2,
  OCl: 3,
  PN: 4,
  EmN: 5,
  RfN: 5,
  Neb: 5,
  HII: 5,
  SNR: 6,
};

const VS = /* glsl */ `
attribute vec3 dsoColor;
attribute float dsoSize;
attribute float dsoMag;
attribute float dsoType;
varying vec3 vColor;
varying float vType;
varying float vAltitudeFactor;
uniform float uPixelRatio;
uniform float uFov;
uniform float uVisFloor;
uniform float uHorizonEnabled;
uniform vec3 uZenithDir;

void main() {
  vColor = dsoColor;
  vType = dsoType;

  // Magnitude LOD: only show DSOs brighter than the current floor.
  float visAlpha = smoothstep(uVisFloor + 1.5, uVisFloor, dsoMag);
  if (visAlpha <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAltitudeFactor = 0.0;
    return;
  }

  vec3 dir = normalize(position);
  if (uHorizonEnabled > 0.5) {
    float sinAlt = dot(dir, uZenithDir);
    vAltitudeFactor = smoothstep(-0.05, 0.05, sinAlt);
  } else {
    vAltitudeFactor = 1.0;
  }

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  float fovBoost = clamp(55.0 / max(uFov, 6.0), 0.7, 2.4);
  gl_PointSize = clamp(dsoSize * uPixelRatio * fovBoost * visAlpha, 1.0, 64.0);
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vType;
varying float vAltitudeFactor;

float galaxyGlyph(vec2 c, float r) {
  // Soft elliptical halo, faint core. The point sprite is square so we just
  // give the inner core a stretched profile.
  vec2 ec = vec2(c.x * 0.6, c.y * 1.4);
  float er = length(ec) * 2.0;
  float core = exp(-er * er * 6.0);
  float halo = pow(1.0 - r, 2.0);
  return core * 0.9 + halo * 0.55;
}

float globularGlyph(vec2 c, float r) {
  // Compact bright core with grainy halo.
  float core = exp(-r * r * 14.0);
  float halo = pow(1.0 - r, 1.8);
  return core * 1.5 + halo * 0.4;
}

float openClusterGlyph(vec2 c, float r) {
  // Sparse — render as a dotted ring at radius ~0.55, plus very faint center.
  float ring = smoothstep(0.04, 0.0, abs(r - 0.55));
  // Add four resolved "stars" at cardinal positions.
  vec2 a = abs(c);
  float dot1 = exp(-((a.x - 0.32) * (a.x - 0.32) + a.y * a.y) * 220.0);
  float dot2 = exp(-(a.x * a.x + (a.y - 0.32) * (a.y - 0.32)) * 220.0);
  float pts = max(dot1, dot2);
  return ring * 0.9 + pts * 1.6 + exp(-r * r * 24.0) * 0.4;
}

float planetaryNebulaGlyph(vec2 c, float r) {
  // Thin ring at ~0.5 with bright center spec.
  float ring = smoothstep(0.045, 0.0, abs(r - 0.5));
  float center = exp(-r * r * 60.0);
  return ring * 1.4 + center * 1.1;
}

float nebulaGlyph(vec2 c, float r) {
  // Soft cloud with mild noise. We don't have a noise texture so just smooth.
  float core = exp(-r * r * 4.0);
  float wisp = pow(1.0 - r, 1.4);
  return core * 0.6 + wisp * 0.85;
}

float snrGlyph(vec2 c, float r) {
  // Two thin filaments crossing a soft hollow core.
  float ring = smoothstep(0.06, 0.0, abs(r - 0.6));
  float fil1 = exp(-c.y * c.y * 280.0) * smoothstep(0.7, 0.0, abs(c.x));
  return ring * 0.6 + fil1 * 0.6;
}

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;

  float intensity;
  if (vType < 1.5) {
    intensity = galaxyGlyph(c, r);
  } else if (vType < 2.5) {
    intensity = globularGlyph(c, r);
  } else if (vType < 3.5) {
    intensity = openClusterGlyph(c, r);
  } else if (vType < 4.5) {
    intensity = planetaryNebulaGlyph(c, r);
  } else if (vType < 5.5) {
    intensity = nebulaGlyph(c, r);
  } else {
    intensity = snrGlyph(c, r);
  }

  vec3 col = vColor * intensity * 0.85 * vAltitudeFactor;
  float alpha = clamp(intensity, 0.0, 1.0) * vAltitudeFactor;
  gl_FragColor = vec4(col, alpha);
}
`;

interface Props {
  /** Optional callback to deliver loaded list to a parent (e.g. for picker / search). */
  onLoaded?: (records: DsoRecord[]) => void;
}

const MIN_FOV_REF = 12;
const MAX_FOV_REF = 95;
// DSO mag floor. At FOV=95° only mag<=8 DSOs draw; at FOV=12° everything
// down to mag 12.5 is on screen.
const DSO_FLOOR_AT_MIN_FOV = 12.5;
const DSO_FLOOR_AT_MAX_FOV = 8.0;

export function DeepSkyObjects({ onLoaded }: Props) {
  const visible = useViewer((s) => s.layers.dso);
  const { gl, camera } = useThree();
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
    const mag = new Float32Array(records.length);
    const typ = new Float32Array(records.length);
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
      const base = d.m ? 16 : 11;
      siz[i] = Math.max(5, base - d.mag * 0.55);
      mag[i] = Number.isFinite(d.mag) ? d.mag : 99;
      typ[i] = TYPE_ID[d.type] ?? 1; // default galaxy glyph for unknown
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.setAttribute("dsoColor", new Float32BufferAttribute(col, 3));
    geo.setAttribute("dsoSize", new Float32BufferAttribute(siz, 1));
    geo.setAttribute("dsoMag", new Float32BufferAttribute(mag, 1));
    geo.setAttribute("dsoType", new Float32BufferAttribute(typ, 1));
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: gl.getPixelRatio() },
        uFov: { value: 55 },
        uVisFloor: { value: DSO_FLOOR_AT_MAX_FOV },
        uHorizonEnabled: { value: 0 },
        uZenithDir: { value: new Vector3(0, 1, 0) },
      },
    });
    return { geometry: geo, material: mat };
  }, [records, gl]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
      material?.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    if (!material) return;
    const cam = camera as { fov?: number };
    const fov = cam.fov ?? 55;
    material.uniforms.uFov.value = fov;
    const t = Math.max(0, Math.min(1, (fov - MIN_FOV_REF) / (MAX_FOV_REF - MIN_FOV_REF)));
    material.uniforms.uVisFloor.value =
      DSO_FLOOR_AT_MIN_FOV + (DSO_FLOOR_AT_MAX_FOV - DSO_FLOOR_AT_MIN_FOV) * t;

    const observer = useViewer.getState().observer;
    const horizonEnabled = useViewer.getState().layers.horizon;
    if (observer && horizonEnabled) {
      const date = useViewer.getState().date;
      const lst = lmstHours(date, observer.lon);
      const zenithDir = raDecHoursToVec3(lst, observer.lat, 1, new Vector3());
      material.uniforms.uHorizonEnabled.value = 1;
      material.uniforms.uZenithDir.value.copy(zenithDir);
    } else {
      material.uniforms.uHorizonEnabled.value = 0;
    }
  });

  if (!geometry || !material) return null;
  return <points args={[geometry, material]} visible={visible} frustumCulled={false} />;
}

export type _R3FPoints = Points;

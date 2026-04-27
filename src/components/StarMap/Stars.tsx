"use client";

/**
 * HDR star renderer.
 *
 *  • Each star is a single point sprite with a soft Gaussian-ish halo +
 *    cross-shaped diffraction spikes that grow with apparent magnitude.
 *  • The fragment color is intentionally HDR (>1.0 for bright stars) so the
 *    Bloom pass in the Scene's EffectComposer turns the brightest stars into
 *    proper "stars" rather than flat dots.
 *  • Per-vertex `starSize` controls the on-screen extent and per-vertex
 *    `starColor` carries the B-V indexed RGB (already in linear gamma).
 */

import { useEffect, useMemo, useRef } from "react";
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
import { useViewer } from "@/store/viewer-store";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { bvToColor } from "@/lib/colors";
import type { StarRecord } from "@/lib/catalogs";

const VS = /* glsl */ `
attribute vec3 starColor;
attribute float starSize;
attribute float starBright;
varying vec3 vColor;
varying float vBright;
uniform float uPixelRatio;
uniform float uViewportHeight;
uniform float uSizeScale;

void main() {
  vColor = starColor;
  vBright = starBright;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = starSize * uSizeScale * uPixelRatio * (uViewportHeight / max(dist, 1.0));
  gl_PointSize = clamp(gl_PointSize, 1.0, 96.0);
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vBright;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;

  // Soft Gaussian-style core + halo.
  float core = exp(-r * r * 28.0);
  float halo = pow(1.0 - r, 4.0);

  // Diffraction spikes (cross). Only on bright stars (vBright > ~1.0).
  float ax = abs(c.x);
  float ay = abs(c.y);
  float spike = max(
    exp(-ay * ay * 480.0) * smoothstep(0.5, 0.0, ax),
    exp(-ax * ax * 480.0) * smoothstep(0.5, 0.0, ay)
  );
  float spikeStrength = clamp(vBright - 0.9, 0.0, 1.0);

  float intensity = core * 1.6 + halo * 0.6 + spike * 0.9 * spikeStrength;
  vec3 col = vColor * intensity * vBright;
  // Bright stars push HDR to drive bloom; dim ones stay LDR.
  gl_FragColor = vec4(col, 1.0);
}
`;

interface StarsProps {
  stars: StarRecord[];
}

export function Stars({ stars }: StarsProps) {
  const { gl, size } = useThree();
  const showStars = useViewer((s) => s.layers.stars);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(stars.length * 3);
    const colors = new Float32Array(stars.length * 3);
    const sizes = new Float32Array(stars.length);
    const brights = new Float32Array(stars.length);
    const tmpColor = new Color();
    const tmpVec = new Vector3();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      raDecHoursToVec3(s.ra, s.dec, CELESTIAL_RADIUS, tmpVec);
      positions[i * 3] = tmpVec.x;
      positions[i * 3 + 1] = tmpVec.y;
      positions[i * 3 + 2] = tmpVec.z;
      bvToColor(s.bv, tmpColor);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;

      const m = s.mag;
      // On-screen size (px-ish at unit FOV).
      sizes[i] = Math.max(1.4, Math.pow(10, (1.0 - m) * 0.22) * 1.2);
      // HDR brightness multiplier — Sirius (mag -1.5) → ~5.6, Polaris (~2) → ~0.85,
      // a mag-6 star → ~0.18.
      brights[i] = Math.pow(2.512, (1.5 - m) * 0.5) * 0.55;
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("starColor", new Float32BufferAttribute(colors, 3));
    geo.setAttribute("starSize", new Float32BufferAttribute(sizes, 1));
    geo.setAttribute("starBright", new Float32BufferAttribute(brights, 1));
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: true,
      uniforms: {
        uPixelRatio: { value: gl.getPixelRatio() },
        uViewportHeight: { value: size.height },
        uSizeScale: { value: 0.014 },
      },
    });
    return { geometry: geo, material: mat };
  }, [stars, gl, size.height]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  const pointsRef = useRef<Points>(null);

  useEffect(() => {
    if (pointsRef.current) {
      pointsRef.current.visible = showStars;
    }
  }, [showStars]);

  return <points ref={pointsRef} args={[geometry, material]} frustumCulled={false} />;
}

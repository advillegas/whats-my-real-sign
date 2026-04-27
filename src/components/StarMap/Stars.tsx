"use client";

/**
 * Renders the HYG star catalog as a single THREE.Points mesh with a custom
 * shader. Per-vertex attributes encode RGB color (B-V indexed) and
 * magnitude-derived size. The shader gives stars a soft circular falloff so
 * they look believable instead of "square pixels".
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
varying vec3 vColor;
uniform float uPixelRatio;
uniform float uViewportHeight;
uniform float uSizeScale;

void main() {
  vColor = starColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Scale point size so brightest stars stay visible in wide FOV but don't blow out at narrow FOV.
  float dist = -mv.z;
  gl_PointSize = starSize * uSizeScale * uPixelRatio * (uViewportHeight / max(dist, 1.0));
  gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);
}
`;

const FS = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  // Soft falloff: bright core + halo
  float core = smoothstep(1.0, 0.0, r);
  float halo = pow(1.0 - r, 3.0);
  float a = clamp(core * 0.9 + halo * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(vColor, a);
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
      // Magnitude → size: brightest (mag ~ -1.5) ~ 5.5px, mag 6.5 ~ 0.6px.
      const m = s.mag;
      sizes[i] = Math.max(0.4, Math.pow(10, (1.0 - m) * 0.18));
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("starColor", new Float32BufferAttribute(colors, 3));
    geo.setAttribute("starSize", new Float32BufferAttribute(sizes, 1));
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: gl.getPixelRatio() },
        uViewportHeight: { value: size.height },
        uSizeScale: { value: 0.012 },
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

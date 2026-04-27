"use client";

/**
 * HDR star renderer.
 *
 *  • Each star is a single point sprite with a tight Gaussian core, a fast-decay
 *    halo, and cross-shaped diffraction spikes that grow with apparent magnitude.
 *  • Fragment color is intentionally HDR (>1.0 for bright stars) so the Bloom
 *    pass turns the brightest stars into proper "stars" rather than flat dots.
 *  • Per-vertex `starSize` controls on-screen extent; `starColor` is the B-V
 *    indexed RGB (linear gamma); `starBright` is the HDR brightness multiplier.
 *  • A live `uFov` uniform drives a magnitude-dependent visibility floor and
 *    a size scaling factor: when zoomed in, more dim stars appear and bright
 *    stars sharpen; when zoomed out, only the brighter stars draw.
 *  • An optional `uHorizonDarken` (used when an observer location is set)
 *    scales sky brightness by altitude so stars near/below the horizon fade.
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
import { useFrame, useThree } from "@react-three/fiber";
import { useViewer } from "@/store/viewer-store";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { bvToColor } from "@/lib/colors";
import { lmstHours } from "@/lib/astronomy";
import type { StarRecord } from "@/lib/catalogs";

const VS = /* glsl */ `
attribute vec3 starColor;
attribute float starSize;
attribute float starBright;
attribute float starMag;
varying vec3 vColor;
varying float vBright;
varying float vAltitudeFactor;
uniform float uPixelRatio;
uniform float uViewportHeight;
uniform float uSizeScale;
uniform float uFov;
uniform float uVisFloor;
uniform float uVisCeil;
uniform float uHorizonEnabled;
uniform vec3 uZenithDir;

void main() {
  vColor = starColor;
  vBright = starBright;

  // Magnitude-driven LOD reveal. uVisFloor / uVisCeil bracket the magnitude
  // range we cull below at the current FOV. Smooth fade across a 1-mag window.
  float visAlpha = smoothstep(uVisFloor + 1.0, uVisFloor, starMag);
  if (visAlpha <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // off-screen NDC
    gl_PointSize = 0.0;
    vAltitudeFactor = 0.0;
    return;
  }

  // Horizon altitude factor (0 at and below horizon, 1 at zenith).
  vec3 dir = normalize(position);
  if (uHorizonEnabled > 0.5) {
    float sinAlt = dot(dir, uZenithDir);
    // Hard cull deep below horizon; smooth fade across +/-3 deg of horizon.
    vAltitudeFactor = smoothstep(-0.05, 0.05, sinAlt);
  } else {
    vAltitudeFactor = 1.0;
  }

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;

  // FOV-driven size: grow stars as the user zooms in (smaller FOV → bigger
  // sprite). 55° is rest FOV, 12° is closest zoom. Uncapped on the upper end
  // so deep zoom genuinely resolves the star sprite into pixels — otherwise
  // every star is a 1-px bloom blob, which reads as "blurry" at any zoom.
  float fovSizeBoost = clamp(pow(55.0 / max(uFov, 6.0), 1.15), 0.7, 6.0);
  float sz = starSize * uSizeScale * fovSizeBoost * uPixelRatio
             * (uViewportHeight / max(dist, 1.0));
  sz *= visAlpha;
  gl_PointSize = clamp(sz, 1.0, 256.0);
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vBright;
varying float vAltitudeFactor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c) * 2.0;
  if (r > 1.0) discard;

  // Tighter Gaussian core; faster halo decay so dense fields don't smear.
  float core = exp(-r * r * 38.0);
  float halo = pow(1.0 - r, 5.0);

  // Diffraction spikes grow with brightness. Only Sirius-class stars get long
  // crosses; fainter named stars get short hairs; everything else, none.
  float ax = abs(c.x);
  float ay = abs(c.y);
  float spike = max(
    exp(-ay * ay * 520.0) * smoothstep(0.5, 0.0, ax),
    exp(-ax * ax * 520.0) * smoothstep(0.5, 0.0, ay)
  );
  float spikeStrength = clamp(vBright - 1.5, 0.0, 1.6);

  float intensity = core * 1.7 + halo * 0.45 + spike * 0.85 * spikeStrength;
  vec3 col = vColor * intensity * vBright * vAltitudeFactor;
  gl_FragColor = vec4(col, 1.0);
}
`;

interface StarsProps {
  stars: StarRecord[];
}

const MIN_FOV_REF = 12;
const MAX_FOV_REF = 95;
// Magnitude visibility curve: at FOV=95° only mag<=4.5 stars draw; at FOV=12° we
// reveal everything down to mag 8.5. The catalog itself caps at 8.5 (mag-9 file).
const VIS_FLOOR_AT_MIN_FOV = 8.6;
const VIS_FLOOR_AT_MAX_FOV = 4.6;

export function Stars({ stars }: StarsProps) {
  const { gl, camera, size } = useThree();
  const showStars = useViewer((s) => s.layers.stars);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(stars.length * 3);
    const colors = new Float32Array(stars.length * 3);
    const sizes = new Float32Array(stars.length);
    const brights = new Float32Array(stars.length);
    const mags = new Float32Array(stars.length);
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
      mags[i] = m;
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
    geo.setAttribute("starMag", new Float32BufferAttribute(mags, 1));
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
        uSizeScale: { value: 0.022 },
        uFov: { value: 55 },
        uVisFloor: { value: VIS_FLOOR_AT_MAX_FOV },
        uVisCeil: { value: VIS_FLOOR_AT_MIN_FOV },
        uHorizonEnabled: { value: 0 },
        uZenithDir: { value: new Vector3(0, 1, 0) },
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

  // Per-frame: refresh FOV-driven LOD and (when set) the zenith direction for
  // horizon dimming.
  useFrame(() => {
    const cam = camera as { fov?: number };
    const fov = cam.fov ?? 55;
    material.uniforms.uFov.value = fov;
    const t = Math.max(0, Math.min(1, (fov - MIN_FOV_REF) / (MAX_FOV_REF - MIN_FOV_REF)));
    // mag floor: when FOV is small (zoomed in) → high mag (more stars);
    //            when FOV is large (zoomed out) → low mag (only bright stars).
    material.uniforms.uVisFloor.value =
      VIS_FLOOR_AT_MIN_FOV + (VIS_FLOOR_AT_MAX_FOV - VIS_FLOOR_AT_MIN_FOV) * t;

    const observer = useViewer.getState().observer;
    const horizonEnabled = useViewer.getState().layers.horizon;
    if (observer && horizonEnabled) {
      const date = useViewer.getState().date;
      const lst = lmstHours(date, observer.lon);
      // The zenith RA/Dec at observer (lat, lon) at this time:
      //   RA_zenith = LST (in hours), Dec_zenith = lat.
      const zenithDir = raDecHoursToVec3(lst, observer.lat, 1, new Vector3());
      material.uniforms.uHorizonEnabled.value = 1;
      material.uniforms.uZenithDir.value.copy(zenithDir);
    } else {
      material.uniforms.uHorizonEnabled.value = 0;
    }
  });

  return <points ref={pointsRef} args={[geometry, material]} frustumCulled={false} />;
}

"use client";

/**
 * Planets are tiny on the sky (sub-arcsecond at typical viewing FOVs), so
 * "realistic" here means "a small luminous shaded disc that looks like a real
 * planet through binoculars" rather than a 1:1 sphere. We render each planet
 * as:
 *   • A camera-facing circular billboard with a procedural shader that
 *     simulates a phase-lit sphere using the body→Sun direction in J2000.
 *     The terminator is anti-aliased and the limb has a subtle Lambert dim.
 *   • A faint HDR halo to engage bloom and give the brighter planets the
 *     "headlight" feel they have through optics.
 *   • Saturn additionally gets a thin disk for its ring.
 *
 * Sizes are exaggerated for visibility (real planets at this distance would be
 * sub-pixel). They scale roughly with apparent magnitude.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  DoubleSide,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { allBodySky, type PlanetId } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";

interface PlanetStyle {
  base: [number, number, number];
  highlight: [number, number, number];
  size: number;
  hasRing?: boolean;
  ringColor?: [number, number, number];
}

const PLANET_STYLE: Record<PlanetId, PlanetStyle> = {
  Sun: { base: [1, 0.85, 0.55], highlight: [1, 0.95, 0.8], size: 14 },
  Moon: { base: [0.78, 0.82, 0.9], highlight: [1, 1, 1], size: 9 },
  Mercury: { base: [0.55, 0.5, 0.45], highlight: [0.85, 0.8, 0.7], size: 4.2 },
  Venus: { base: [0.95, 0.9, 0.7], highlight: [1, 1, 0.92], size: 6.2 },
  Mars: { base: [0.65, 0.27, 0.15], highlight: [1, 0.55, 0.35], size: 5.0 },
  Jupiter: { base: [0.78, 0.65, 0.5], highlight: [1, 0.9, 0.78], size: 8.5 },
  Saturn: {
    base: [0.78, 0.7, 0.5],
    highlight: [1, 0.93, 0.75],
    size: 7.4,
    hasRing: true,
    ringColor: [0.95, 0.86, 0.65],
  },
  Uranus: { base: [0.55, 0.78, 0.85], highlight: [0.85, 0.97, 1.0], size: 5.4 },
  Neptune: { base: [0.32, 0.45, 0.85], highlight: [0.55, 0.7, 1.0], size: 5.2 },
};

const VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec3 uBase;
uniform vec3 uHigh;
uniform vec2 uLightDir; // 2D projected direction toward the Sun in the billboard plane
uniform float uPhase;   // 0=new, 1=full

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (r2 > 1.0) discard;

  // Reconstruct sphere normal from billboard uv (orthographic projection of unit sphere).
  vec3 n = vec3(p, sqrt(max(0.0, 1.0 - r2)));

  // Lambert with light direction in screen space.
  vec3 L = normalize(vec3(uLightDir, 0.4));
  float ndl = max(dot(n, L), 0.0);
  // Phase-bias the lighting so we don't see a fully lit disc when phase is small.
  ndl = mix(ndl * 0.15, ndl, smoothstep(0.0, 1.0, uPhase));

  // Limb darkening.
  float limb = pow(n.z, 0.45);

  // Surface mottling so it isn't a flat colored disc.
  float mottle = vnoise(vUv * 9.0) * 0.5 + vnoise(vUv * 24.0) * 0.5;
  vec3 albedo = mix(uBase, uHigh, mottle);

  vec3 col = albedo * (0.05 + ndl * 0.95) * limb;

  // Anti-aliased disc edge.
  float edge = smoothstep(1.0, 0.96, sqrt(r2));
  gl_FragColor = vec4(col, edge);
}
`;

const RING_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  // Saturn-ish ring shape.
  float a = smoothstep(0.55, 0.6, r) * smoothstep(1.0, 0.95, r);
  // Cassini-ish gap.
  a *= smoothstep(0.78, 0.79, abs(r - 0.79));
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * 1.4, a);
}
`;

interface PlanetProps {
  id: PlanetId;
  ra: number;
  dec: number;
  dist: number;
  vec: Vector3;
  sunVec: Vector3;
  style: PlanetStyle;
  onPick: (id: PlanetId, ra: number, dec: number, dist: number) => void;
}

function Planet({ id, ra, dec, dist, vec, sunVec, style, onPick }: PlanetProps) {
  const groupRef = useRef<Group>(null);
  const { material, ringMaterial } = useMemo(() => {
    // Sun direction relative to planet, then projected to camera space inside <useFrame>.
    const sunDir = sunVec.clone().sub(vec).normalize();
    // Phase: how much of the planet's facing hemisphere is illuminated, from
    // the camera at origin. cos(phase angle) where phase angle is (planet→Sun)·(planet→Earth).
    const toEarth = vec.clone().multiplyScalar(-1).normalize();
    const ph = Math.max(0, sunDir.dot(toEarth)) * 0.5 + 0.5;
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      toneMapped: true,
      uniforms: {
        uBase: { value: new Color(...style.base) },
        uHigh: { value: new Color(...style.highlight) },
        uLightDir: { value: [1, 0] },
        uPhase: { value: ph },
      },
    });
    let ringMat: ShaderMaterial | null = null;
    if (style.hasRing) {
      ringMat = new ShaderMaterial({
        vertexShader: VS,
        fragmentShader: RING_FS,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: DoubleSide,
        toneMapped: true,
        uniforms: {
          uColor: { value: new Color(...(style.ringColor ?? [1, 1, 1])) },
        },
      });
    }
    return { material: mat, ringMaterial: ringMat };
  }, [vec, sunVec, style]);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.lookAt(state.camera.position);
    // Project the world Sun-direction into the billboard's local x/y so the
    // shader can light the disc consistently as the camera moves.
    const sunDir = sunVec.clone().sub(vec).normalize();
    const cam = state.camera;
    const right = new Vector3();
    const up = new Vector3();
    cam.matrixWorld.extractBasis(right, up, new Vector3());
    const lx = sunDir.dot(right);
    const ly = sunDir.dot(up);
    material.uniforms.uLightDir.value = [lx, ly];
  });

  return (
    <group
      ref={groupRef}
      position={[vec.x, vec.y, vec.z]}
      onClick={(e) => {
        e.stopPropagation();
        onPick(id, ra, dec, dist);
      }}
    >
      {ringMaterial && (
        <mesh rotation={[Math.PI * 0.18, 0.4, 0]} renderOrder={2}>
          <planeGeometry args={[style.size * 4.4, style.size * 4.4]} />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      )}
      <mesh renderOrder={3}>
        <planeGeometry args={[style.size * 2.4, style.size * 2.4]} />
        <primitive object={material} attach="material" />
      </mesh>
      {/* Subtle HDR halo for the brighter planets so bloom kisses them. */}
      <mesh renderOrder={1}>
        <planeGeometry args={[style.size * 6, style.size * 6]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped
          uniforms={{
            uTint: {
              value: new Color(style.highlight[0], style.highlight[1], style.highlight[2]),
            },
          }}
          vertexShader={VS}
          fragmentShader={`precision highp float;\nvarying vec2 vUv;\nuniform vec3 uTint;\nvoid main(){vec2 p=vUv*2.0-1.0;float r=length(p);if(r>1.0)discard;float a=pow(1.0-r,4.0)*0.45;gl_FragColor=vec4(uTint*1.6, a);}`}
        />
      </mesh>
    </group>
  );
}

export function Planets() {
  const date = useViewer((s) => s.date);
  const visible = useViewer((s) => s.layers.planets);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);

  const { positions, sunVec } = useMemo(() => {
    const all = allBodySky(date);
    const sun = all.find((b) => b.id === "Sun");
    const sv = sun
      ? raDecHoursToVec3(sun.ra, sun.dec, CELESTIAL_RADIUS * 0.94, new Vector3())
      : new Vector3(1, 0, 0);
    const planets = all
      .filter((b) => b.id !== "Sun")
      .map((b) => ({
        ...b,
        vec: raDecHoursToVec3(b.ra, b.dec, CELESTIAL_RADIUS * 0.93, new Vector3()),
      }));
    return { positions: planets, sunVec: sv };
  }, [date]);

  if (!visible) return null;

  const onPick = (id: PlanetId, ra: number, dec: number, dist: number) => {
    setCameraTarget(ra, dec, 22);
    setSelected({
      id,
      name: id,
      ra,
      dec,
      kind: "planet",
      wikiTitle: id,
      blurb: `Distance ${dist.toFixed(3)} AU from Earth.`,
    });
  };

  return (
    <group>
      {positions.map((p) => (
        <Planet
          key={p.id}
          id={p.id}
          ra={p.ra}
          dec={p.dec}
          dist={p.dist}
          vec={p.vec}
          sunVec={sunVec}
          style={PLANET_STYLE[p.id]}
          onPick={onPick}
        />
      ))}
    </group>
  );
}

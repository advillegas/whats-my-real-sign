"use client";

/**
 * Sun rendered as:
 *   • A small HDR core sphere (color > 1.0 so the bloom pass turns it into the
 *     dominant light source of the scene).
 *   • A camera-facing quad with a procedural shader for the corona (smooth
 *     radial falloff, multi-octave noise streaks, chromatic warm/cool tint).
 *
 * No more concentric hard-edged spheres. Everything is one continuous
 * volumetric-feeling glow once bloom kicks in.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, ShaderMaterial, Vector3, type Mesh } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { sunSky } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";

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
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv - 0.5;
  float r = length(uv) * 2.0;
  if (r > 1.0) discard;

  // Core: very tight, very bright (HDR > 1).
  float core = smoothstep(0.18, 0.0, r);
  // Inner halo: warm yellow-white.
  float inner = pow(smoothstep(0.55, 0.0, r), 1.6);
  // Outer corona: orange streaky falloff.
  float outer = pow(smoothstep(1.0, 0.0, r), 2.0);

  // Streaks rotating slowly — adds the "alive star" feel.
  float ang = atan(uv.y, uv.x);
  float swirl = fbm(vec2(ang * 4.0 + uTime * 0.15, r * 6.0));
  outer *= 0.6 + 0.7 * swirl;

  vec3 cCore = vec3(20.0, 18.5, 14.5);     // HDR white-yellow
  vec3 cInner = vec3(2.6, 1.9, 0.8);
  vec3 cOuter = vec3(1.1, 0.55, 0.15);

  vec3 col = cCore * core + cInner * inner + cOuter * outer;

  float a = clamp(core + inner + outer, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

export function Sun() {
  const date = useViewer((s) => s.date);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const billboardRef = useRef<Mesh>(null);

  const { sky, vec, material, coreColor } = useMemo(() => {
    const sk = sunSky(date);
    const v = raDecHoursToVec3(sk.ra, sk.dec, CELESTIAL_RADIUS * 0.94, new Vector3());
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      toneMapped: true,
      uniforms: { uTime: { value: 0 } },
    });
    const cc = new Color(8, 7, 4); // strong HDR core
    return { sky: sk, vec: v, material: mat, coreColor: cc };
  }, [date]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (billboardRef.current) {
      billboardRef.current.lookAt(state.camera.position);
    }
  });

  const onPick = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    setCameraTarget(sky.ra, sky.dec, 28);
    setSelected({
      id: "SUN",
      name: "Sun",
      ra: sky.ra,
      dec: sky.dec,
      kind: "planet",
      mag: -26.7,
      wikiTitle: "Sun",
      blurb: `Our G2V main-sequence star. Distance ${sky.dist.toFixed(3)} AU.`,
    });
  };

  return (
    <group position={[vec.x, vec.y, vec.z]} onClick={onPick}>
      <mesh>
        <sphereGeometry args={[7, 32, 32]} />
        <meshBasicMaterial color={coreColor} toneMapped={false} />
      </mesh>
      <mesh ref={billboardRef} renderOrder={5}>
        <planeGeometry args={[140, 140]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}

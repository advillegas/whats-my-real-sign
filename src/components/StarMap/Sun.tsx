"use client";

/**
 * The Sun — a textured photosphere sphere (Solar System Scope 2K, CC BY 4.0)
 * combined with a billboard corona quad. The photosphere texture is sampled
 * with HDR multiplier so bloom turns it incandescent; the corona shader adds
 * animated streaks and a soft outer falloff.
 */

import { useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  Color,
  DoubleSide,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Mesh,
} from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { sunSky } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";
import { useLabelTap } from "@/lib/use-label-tap";

const SUN_RADIUS = 8;
const CORONA_SCALE = 3.0;

const SURFACE_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SURFACE_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform float uIntensity;

void main() {
  // Subtle UV drift to suggest convection without animating the texture.
  vec2 uv = vUv + vec2(uTime * 0.0015, 0.0);
  vec3 col = texture2D(uTex, uv).rgb;
  // Bias toward yellow-white & boost into HDR (kept moderate so bloom doesn't blanket the screen).
  vec3 tint = vec3(1.25, 1.10, 0.85);
  col = pow(col, vec3(0.85)) * tint * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

const CORONA_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CORONA_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv - 0.5;
  float r = length(uv) * 2.0;
  if (r > 1.0) discard;

  // Photosphere occupies 1/CORONA_SCALE of the half-quad. CORONA_SCALE = 3.0
  // → photoR = 1/3 ≈ 0.333.
  float photoR = 0.333;
  float coreCutoff = smoothstep(photoR, photoR + 0.015, r);
  float ang = atan(uv.y, uv.x);
  float swirl = fbm(vec2(ang * 6.0 + uTime * 0.10, r * 10.0));
  float ridges = fbm(vec2(ang * 14.0 - uTime * 0.06, r * 18.0));
  float streaks = 0.55 + 0.45 * (swirl * 0.7 + ridges * 0.3);

  // Steeper falloff than before so the corona stays close to the disc.
  float falloff = pow(smoothstep(1.0, photoR, r), 4.0);
  float corona = falloff * streaks * coreCutoff * 0.85;

  vec3 cInner = vec3(2.8, 2.0, 0.85);
  vec3 cOuter = vec3(1.4, 0.6, 0.2);
  vec3 col = mix(cInner, cOuter, smoothstep(photoR, 1.0, r)) * corona;

  float rim = pow(smoothstep(photoR + 0.03, photoR, r), 6.0) * coreCutoff;
  col += vec3(3.2, 2.4, 1.3) * rim;

  gl_FragColor = vec4(col, clamp(corona + rim, 0.0, 1.0));
}
`;

export function Sun() {
  const date = useViewer((s) => s.date);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const markInteracted = useViewer((s) => s.markInteracted);
  const sunTex = useLoader(TextureLoader, "/textures/sun.jpg");
  const surfaceRef = useRef<Mesh>(null);
  const coronaRef = useRef<Mesh>(null);
  const [hot, setHot] = useState(false);

  const { sky, vec, surfaceMat, coronaMat } = useMemo(() => {
    const sk = sunSky(date);
    const v = raDecHoursToVec3(sk.ra, sk.dec, CELESTIAL_RADIUS * 0.94, new Vector3());
    sunTex.colorSpace = SRGBColorSpace;
    sunTex.anisotropy = 8;
    const sMat = new ShaderMaterial({
      vertexShader: SURFACE_VS,
      fragmentShader: SURFACE_FS,
      uniforms: {
        uTex: { value: sunTex },
        uTime: { value: 0 },
        uIntensity: { value: 5.5 },
      },
      toneMapped: false,
    });
    const cMat = new ShaderMaterial({
      vertexShader: CORONA_VS,
      fragmentShader: CORONA_FS,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      toneMapped: false,
      uniforms: { uTime: { value: 0 } },
    });
    return { sky: sk, vec: v, surfaceMat: sMat, coronaMat: cMat };
  }, [date, sunTex]);

  useFrame((state) => {
    surfaceMat.uniforms.uTime.value = state.clock.elapsedTime;
    coronaMat.uniforms.uTime.value = state.clock.elapsedTime;
    if (surfaceRef.current) {
      surfaceRef.current.rotation.y = state.clock.elapsedTime * 0.02;
    }
    if (coronaRef.current) {
      coronaRef.current.lookAt(state.camera.position);
    }
  });

  const onTap = () => {
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
    markInteracted();
  };
  const labelTap = useLabelTap({ onTap });

  void Color;

  return (
    <group position={[vec.x, vec.y, vec.z]}>
      <mesh ref={surfaceRef}>
        <sphereGeometry args={[SUN_RADIUS, 64, 64]} />
        <primitive object={surfaceMat} attach="material" />
      </mesh>
      <mesh ref={coronaRef} renderOrder={5}>
        <planeGeometry args={[SUN_RADIUS * CORONA_SCALE, SUN_RADIUS * CORONA_SCALE]} />
        <primitive object={coronaMat} attach="material" />
      </mesh>
      <Html
        position={[0, SUN_RADIUS * 1.7, 0]}
        center
        zIndexRange={[8, 0]}
        style={{ pointerEvents: "auto" }}
      >
        <button
          onPointerDown={labelTap.onPointerDown}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setHot(true);
          }}
          onPointerLeave={() => setHot(false)}
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: 11,
            fontWeight: hot ? 700 : 600,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: hot
              ? "rgba(255, 255, 230, 1)"
              : "rgba(255, 230, 180, 0.95)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
            textShadow: hot
              ? "0 0 14px rgba(255, 220, 120, 0.9), 0 0 6px rgba(0,0,0,0.9)"
              : "0 0 8px rgba(0,0,0,0.9), 0 0 14px rgba(255, 180, 80, 0.55)",
            whiteSpace: "nowrap",
            userSelect: "none",
            touchAction: "none",
            transition: "color 120ms ease, text-shadow 120ms ease",
          }}
        >
          SUN
        </button>
      </Html>
    </group>
  );
}

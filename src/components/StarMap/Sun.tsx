"use client";

/**
 * The Sun — a textured photosphere sphere (Solar System Scope 2K, CC BY 4.0)
 * combined with a billboard corona quad. The photosphere texture is sampled
 * with HDR multiplier so bloom turns it incandescent; the corona shader adds
 * animated streaks and a soft outer falloff.
 */

import { useMemo, useRef } from "react";
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
  vec3 tint = vec3(1.18, 1.05, 0.82);
  col = pow(col, vec3(0.9)) * tint * uIntensity;
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

  vec3 cInner = vec3(2.0, 1.5, 0.65);
  vec3 cOuter = vec3(1.0, 0.45, 0.15);
  vec3 col = mix(cInner, cOuter, smoothstep(photoR, 1.0, r)) * corona;

  // Bright chromosphere rim right at the photosphere edge.
  float rim = pow(smoothstep(photoR + 0.03, photoR, r), 6.0) * coreCutoff;
  col += vec3(2.4, 1.8, 1.0) * rim;

  gl_FragColor = vec4(col, clamp(corona + rim, 0.0, 1.0));
}
`;

export function Sun() {
  const date = useViewer((s) => s.date);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const setHover = useViewer((s) => s.setHover);
  const sunTex = useLoader(TextureLoader, "/textures/sun.jpg");
  const surfaceRef = useRef<Mesh>(null);
  const coronaRef = useRef<Mesh>(null);

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
        uIntensity: { value: 2.6 },
      },
      toneMapped: true,
    });
    const cMat = new ShaderMaterial({
      vertexShader: CORONA_VS,
      fragmentShader: CORONA_FS,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      toneMapped: true,
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

  const selectSun = () => {
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

  const onPick = (e: { stopPropagation(): void }) => {
    e.stopPropagation();
    setCameraTarget(sky.ra, sky.dec, 28);
    selectSun();
  };

  const onHoverIn = (e: {
    clientX: number;
    clientY: number;
    pointerType?: string;
    stopPropagation(): void;
  }) => {
    e.stopPropagation();
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    setHover({
      name: "Sun",
      subtitle: `${sky.dist.toFixed(3)} AU away`,
      kind: "planet",
      x: e.clientX,
      y: e.clientY,
    });
    document.body.style.cursor = "pointer";
  };
  const onHoverOut = () => {
    setHover(null);
    document.body.style.cursor = "";
  };

  // Used to silence an unused-import warning if Color isn't referenced elsewhere.
  void Color;

  return (
    <group
      position={[vec.x, vec.y, vec.z]}
      onClick={onPick}
      onPointerOver={onHoverIn}
      onPointerMove={onHoverIn}
      onPointerOut={onHoverOut}
    >
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
          onClick={(e) => {
            e.stopPropagation();
            setCameraTarget(sky.ra, sky.dec, 28);
            selectSun();
          }}
          onPointerEnter={() => selectSun()}
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(255, 230, 180, 0.95)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
            textShadow:
              "0 0 8px rgba(0,0,0,0.9), 0 0 14px rgba(255, 180, 80, 0.55)",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          SUN
        </button>
      </Html>
    </group>
  );
}

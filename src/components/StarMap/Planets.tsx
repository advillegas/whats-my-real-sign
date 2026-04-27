"use client";

/**
 * Planets rendered as real textured spheres with phase-correct Lambert lighting.
 * Textures: Solar System Scope 2K maps (CC BY 4.0). The shader uses the
 * world-space direction toward the Sun so the lit hemisphere always points
 * Sunward, regardless of where the camera is looking.
 *
 * Saturn additionally renders a textured ring disc with the actual axial tilt.
 */

import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { allBodySky, type PlanetId } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";

interface PlanetStyle {
  texture: string;
  size: number;
  /** Axial tilt in degrees. */
  tilt: number;
  /** Rotation rate (rad/sec, exaggerated for visibility). */
  spin: number;
  /** Whether this body has a luminous atmosphere we should rim-light. */
  atmosphere?: [number, number, number];
  /** Additive emissive boost so the lit side stays visible. */
  emissive?: number;
  /** Saturn ring data. */
  ring?: {
    innerScale: number;
    outerScale: number;
    texture: string;
  };
}

const PLANET_STYLE: Record<Exclude<PlanetId, "Sun">, PlanetStyle> = {
  Moon: { texture: "/textures/moon.jpg", size: 9, tilt: 6.7, spin: 0.05 },
  Mercury: { texture: "/textures/mercury.jpg", size: 4.5, tilt: 0.03, spin: 0.06 },
  Venus: {
    texture: "/textures/venus.jpg",
    size: 6.5,
    tilt: 177.4,
    spin: -0.04,
    atmosphere: [1.0, 0.95, 0.78],
  },
  Mars: { texture: "/textures/mars.jpg", size: 5.4, tilt: 25.2, spin: 0.09 },
  Jupiter: {
    texture: "/textures/jupiter.jpg",
    size: 9.0,
    tilt: 3.1,
    spin: 0.18,
    atmosphere: [1.0, 0.85, 0.65],
  },
  Saturn: {
    texture: "/textures/saturn.jpg",
    size: 8.0,
    tilt: 26.7,
    spin: 0.16,
    atmosphere: [1.0, 0.9, 0.65],
    ring: {
      innerScale: 1.35,
      outerScale: 2.3,
      texture: "/textures/saturn_rings.jpg",
    },
  },
  Uranus: {
    texture: "/textures/uranus.jpg",
    size: 6.2,
    tilt: 97.8,
    spin: 0.12,
    atmosphere: [0.7, 0.95, 1.0],
  },
  Neptune: {
    texture: "/textures/neptune.jpg",
    size: 6.0,
    tilt: 28.3,
    spin: 0.13,
    atmosphere: [0.5, 0.7, 1.0],
  },
};

const VS = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;

uniform sampler2D uTex;
uniform vec3 uSunWorld;
uniform vec3 uAtmo;
uniform float uHasAtmo;
uniform float uEmissive;

void main() {
  vec3 albedo = texture2D(uTex, vUv).rgb;
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uSunWorld - vWorldPos);

  float ndl = max(dot(N, L), 0.0);
  // Wrapped Lambert so the terminator isn't pitch black.
  float wrap = (ndl + 0.15) / 1.15;
  wrap = clamp(wrap, 0.0, 1.0);

  vec3 lit = albedo * (wrap * 1.05 + uEmissive);

  // Rim: soft blue/atmospheric halo on the day side limb.
  if (uHasAtmo > 0.5) {
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(dot(V, N), 0.0), 2.5);
    float lobe = pow(max(dot(N, L), 0.0), 0.5);
    lit += uAtmo * fres * lobe * 0.6;
  }

  gl_FragColor = vec4(lit, 1.0);
}
`;

const RING_VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const RING_FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vWorldPos;
uniform sampler2D uTex;
uniform vec3 uSunWorld;
uniform vec3 uPlanetWorld;
uniform float uInner;
uniform float uOuter;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ringT = (r - uInner) / (uOuter - uInner);
  if (ringT < 0.0 || ringT > 1.0) discard;
  vec4 t = texture2D(uTex, vec2(ringT, 0.5));
  // Lighting: dim the side of the ring that the planet shadows from the Sun.
  vec3 sunDir = normalize(uSunWorld - uPlanetWorld);
  vec3 ringPoint = vWorldPos - uPlanetWorld;
  float side = dot(normalize(ringPoint), sunDir);
  float shade = mix(0.45, 1.0, smoothstep(-0.2, 0.2, side));
  gl_FragColor = vec4(t.rgb * shade, t.a * 0.95);
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
  onHoverIn: (id: PlanetId, dist: number, x: number, y: number) => void;
  onHoverOut: () => void;
}

function Planet({ id, ra, dec, dist, vec, sunVec, style, onPick, onHoverIn, onHoverOut }: PlanetProps) {
  const groupRef = useRef<Group>(null);
  const sphereRef = useRef<Mesh>(null);
  const tex = useLoader(TextureLoader, style.texture);
  const ringTex = useLoader(TextureLoader, style.ring?.texture ?? "/textures/saturn_rings.jpg");

  const { material, ringMaterial } = useMemo(() => {
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 8;
    if (style.ring) {
      ringTex.colorSpace = SRGBColorSpace;
      ringTex.wrapS = RepeatWrapping;
      ringTex.wrapT = RepeatWrapping;
      ringTex.anisotropy = 8;
    }
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uTex: { value: tex },
        uSunWorld: { value: sunVec.clone() },
        uAtmo: {
          value: style.atmosphere
            ? new Color(style.atmosphere[0], style.atmosphere[1], style.atmosphere[2])
            : new Color(0, 0, 0),
        },
        uHasAtmo: { value: style.atmosphere ? 1 : 0 },
        uEmissive: { value: style.emissive ?? 0.0 },
      },
      toneMapped: true,
    });
    let rMat: ShaderMaterial | null = null;
    if (style.ring) {
      rMat = new ShaderMaterial({
        vertexShader: RING_VS,
        fragmentShader: RING_FS,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: true,
        uniforms: {
          uTex: { value: ringTex },
          uSunWorld: { value: sunVec.clone() },
          uPlanetWorld: { value: vec.clone() },
          uInner: { value: 0.45 },
          uOuter: { value: 1.0 },
        },
      });
    }
    return { material: mat, ringMaterial: rMat };
  }, [tex, ringTex, style, sunVec, vec]);

  useFrame((state) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y += style.spin * (1 / 60);
    }
    material.uniforms.uSunWorld.value = sunVec;
    if (ringMaterial) {
      ringMaterial.uniforms.uSunWorld.value = sunVec;
      ringMaterial.uniforms.uPlanetWorld.value = vec;
    }
    void state;
  });

  return (
    <group
      ref={groupRef}
      position={[vec.x, vec.y, vec.z]}
      rotation={[0, 0, (style.tilt * Math.PI) / 180]}
      onClick={(e) => {
        e.stopPropagation();
        onPick(id, ra, dec, dist);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverIn(id, dist, e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHoverIn(id, dist, e.clientX, e.clientY);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverOut();
      }}
    >
      <mesh ref={sphereRef}>
        <sphereGeometry args={[style.size, 64, 64]} />
        <primitive object={material} attach="material" />
      </mesh>
      {style.ring && ringMaterial && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[style.size * style.ring.innerScale, style.size * style.ring.outerScale, 96]} />
          <primitive object={ringMaterial} attach="material" />
        </mesh>
      )}
      {style.atmosphere && (
        <mesh>
          <sphereGeometry args={[style.size * 1.06, 32, 32]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped
            uniforms={{
              uAtmo: {
                value: new Color(style.atmosphere[0], style.atmosphere[1], style.atmosphere[2]),
              },
            }}
            vertexShader={`varying vec3 vN; varying vec3 vW; void main(){vN=normalize(normalMatrix*normal); vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp;}`}
            fragmentShader={`precision highp float; varying vec3 vN; varying vec3 vW; uniform vec3 uAtmo; void main(){ vec3 V=normalize(cameraPosition-vW); float f=pow(1.0-max(dot(V,vN),0.0),3.0); gl_FragColor=vec4(uAtmo*f*1.6,f);} `}
          />
        </mesh>
      )}
    </group>
  );
}

export function Planets() {
  const date = useViewer((s) => s.date);
  const visible = useViewer((s) => s.layers.planets);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const setHover = useViewer((s) => s.setHover);

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

  const onHoverIn = (id: PlanetId, dist: number, x: number, y: number) => {
    setHover({
      name: id,
      subtitle: `${dist.toFixed(3)} AU away`,
      kind: "planet",
      x,
      y,
    });
    document.body.style.cursor = "pointer";
  };
  const onHoverOut = () => {
    setHover(null);
    document.body.style.cursor = "";
  };

  return (
    <group>
      {positions.map((p) => {
        const style = PLANET_STYLE[p.id as Exclude<PlanetId, "Sun">];
        if (!style) return null;
        return (
          <Planet
            key={p.id}
            id={p.id}
            ra={p.ra}
            dec={p.dec}
            dist={p.dist}
            vec={p.vec}
            sunVec={sunVec}
            style={style}
            onPick={onPick}
            onHoverIn={onHoverIn}
            onHoverOut={onHoverOut}
          />
        );
      })}
    </group>
  );
}

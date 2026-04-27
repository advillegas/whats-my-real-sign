"use client";

/**
 * Real ESO/S. Brunier Milky Way panorama (eso0932a, CC BY 4.0), sampled in
 * galactic coordinates so the disk lines up with the actual sky regardless of
 * J2000 rotation. The sphere is viewed from the inside (BackSide) and the
 * fragment shader transforms each direction into the galactic frame, then
 * indexes the equirectangular texture.
 *
 * The ESO panorama is centered on the Galactic Centre with longitude 0 at the
 * middle, latitude 0 along the horizontal midline. After accounting for the
 * inside-viewing flip we get a one-to-one match against the J2000 sphere.
 */

import { useMemo } from "react";
import {
  BackSide,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipMapLinearFilter,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  SRGBColorSpace,
} from "three";
import { useLoader, useThree } from "@react-three/fiber";
import { useViewer } from "@/store/viewer-store";
import { CELESTIAL_RADIUS } from "@/lib/coordinates";

// J2000 → galactic rotation rows.
const GAL_X = [-0.0548755604, -0.8734370902, -0.4838350155];
const GAL_Y = [0.4941094279, -0.4448296300, 0.7469822445];
const GAL_Z = [-0.8676661490, -0.1980763734, 0.4559837762];

const VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/*
 * The fragment shader does the texture lookup in galactic coordinates with
 * mipmap+anisotropic filtering, plus a small high-frequency procedural
 * "dust grain" perturbation that keeps the panorama from going visibly
 * smooth/blurry when the user zooms in past the texture's native angular
 * resolution. The grain is amplitude-modulated by local panorama luminance
 * so it lives in the bright Milky Way regions and disappears in dark sky.
 */
const FS = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform sampler2D uTex;
uniform vec3 uGalX;
uniform vec3 uGalY;
uniform vec3 uGalZ;
uniform float uIntensity;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

void main() {
  vec3 d = normalize(vDir);
  vec3 g = vec3(dot(uGalX, d), dot(uGalY, d), dot(uGalZ, d));
  float lon = atan(g.y, g.x);          // -π..π
  float lat = asin(clamp(g.z, -1.0, 1.0));  // -π/2..π/2
  // ESO panorama: galactic centre at u=0.5, latitude 0 at v=0.5.
  // We flip u because the sphere is BackSide (inside view).
  float u = 0.5 - lon / 6.2831853;
  float v = 0.5 + lat / 3.1415927;
  vec3 col = texture2D(uTex, vec2(u, v)).rgb;
  col = pow(col, vec3(1.15));

  // High-frequency procedural grain so the texture doesn't look smooth at
  // close zooms. Two octaves of value noise sampled in 3D so it tiles
  // seamlessly across the sphere.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float grain = 0.0;
  grain += (vnoise(d * 800.0) - 0.5) * 0.15;
  grain += (vnoise(d * 2400.0) - 0.5) * 0.10;
  // Modulate grain by luminance so dark sky stays dark.
  col += vec3(grain) * smoothstep(0.05, 0.45, lum);

  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

interface MilkyWayProps {
  quality?: "low" | "high";
}

export function MilkyWay({ quality = "high" }: MilkyWayProps) {
  const visible = useViewer((s) => s.layers.milkyway);
  const tex = useLoader(TextureLoader, "/textures/eso_milkyway.jpg");
  const { gl } = useThree();

  const { geometry, material } = useMemo(() => {
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearMipMapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.generateMipmaps = true;
    // Anisotropic filtering keeps the panorama crisp at glancing angles
    // (i.e. when the user zooms in close to the galactic plane).
    const maxAniso = gl.capabilities.getMaxAnisotropy?.() ?? 8;
    tex.anisotropy = quality === "low" ? Math.min(8, maxAniso) : Math.min(16, maxAniso);
    tex.needsUpdate = true;
    const segW = quality === "low" ? 64 : 128;
    const segH = quality === "low" ? 32 : 64;
    const geo = new SphereGeometry(CELESTIAL_RADIUS * 0.99, segW, segH);
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      side: BackSide,
      depthWrite: false,
      toneMapped: true,
      uniforms: {
        uTex: { value: tex },
        uGalX: { value: GAL_X },
        uGalY: { value: GAL_Y },
        uGalZ: { value: GAL_Z },
        uIntensity: { value: 0.85 },
      },
    });
    return { geometry: geo, material: mat };
  }, [tex, quality, gl]);

  return (
    <mesh
      geometry={geometry}
      material={material}
      visible={visible}
      renderOrder={-10}
      frustumCulled={false}
    />
  );
}

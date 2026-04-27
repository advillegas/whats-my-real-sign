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
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  SRGBColorSpace,
} from "three";
import { useLoader } from "@react-three/fiber";
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

const FS = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform sampler2D uTex;
uniform vec3 uGalX;
uniform vec3 uGalY;
uniform vec3 uGalZ;
uniform float uIntensity;

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
  // Slight contrast lift + vignette so it feels deep.
  col = pow(col, vec3(1.15));
  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

export function MilkyWay() {
  const visible = useViewer((s) => s.layers.milkyway);
  const tex = useLoader(TextureLoader, "/textures/eso_milkyway.jpg");

  const { geometry, material } = useMemo(() => {
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.anisotropy = 8;
    const geo = new SphereGeometry(CELESTIAL_RADIUS * 0.99, 96, 48);
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
  }, [tex]);

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

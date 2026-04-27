"use client";

/**
 * Procedural Milky Way + deep-space background, drawn on the inside of a sphere
 * surrounding the camera. The shader concentrates a soft warm glow along the
 * galactic plane (defined by the J2000 galactic-pole direction) and adds a
 * subtle blue nebula gradient so the sky never looks pure black.
 *
 * No texture asset required — keeps the bundle tiny and looks pleasingly
 * "starmap-y" without faking a NASA photo we don't license.
 */

import { useMemo } from "react";
import { BackSide, ShaderMaterial, SphereGeometry } from "three";
import { useViewer } from "@/store/viewer-store";
import { CELESTIAL_RADIUS } from "@/lib/coordinates";

// J2000 direction of the north galactic pole (RA 12h 51m 26s, Dec +27.13°).
const GAL_POLE_X = -0.054876;
const GAL_POLE_Y = 0.494109;
const GAL_POLE_Z = -0.867666;

const VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FS = /* glsl */ `
varying vec3 vDir;
uniform vec3 uGalPole;
uniform float uIntensity;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
  return n;
}

void main() {
  vec3 d = normalize(vDir);
  float galLat = abs(dot(d, normalize(uGalPole)));
  // distance to galactic plane in [0..1]; small near plane.
  float planeProx = pow(1.0 - galLat, 4.0);

  // Multiscale noise to add structure to the bulge / dust lanes.
  float n1 = noise(d * 6.0);
  float n2 = noise(d * 22.0);
  float n3 = noise(d * 70.0);
  float band = planeProx * (0.55 + 0.6 * n1 + 0.3 * n2 + 0.18 * n3);

  // Bulge (toward galactic center, which is at gal lon = 0, lat = 0;
  // direction in equatorial J2000 ≈ Sgr A*: RA 17h45m, Dec -28.93°).
  vec3 galCenter = normalize(vec3(-0.054876, -0.873437, -0.483835));
  float center = pow(max(0.0, dot(d, galCenter)), 8.0);

  vec3 milky = vec3(1.0, 0.92, 0.78);
  vec3 lane = vec3(0.18, 0.10, 0.05);
  vec3 bg = mix(vec3(0.005, 0.008, 0.02), vec3(0.02, 0.025, 0.06), 0.5 + 0.5 * d.y);

  vec3 col = bg;
  col += milky * band * 0.18 * uIntensity;
  col += milky * center * 0.45 * uIntensity;
  col -= lane * planeProx * (1.0 - n2) * 0.12 * uIntensity;
  col = max(col, vec3(0.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function MilkyWay() {
  const visible = useViewer((s) => s.layers.milkyway);
  const { geometry, material } = useMemo(() => {
    const geo = new SphereGeometry(CELESTIAL_RADIUS * 0.99, 64, 32);
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uGalPole: { value: [GAL_POLE_X, GAL_POLE_Y, GAL_POLE_Z] },
        uIntensity: { value: 1.0 },
      },
    });
    return { geometry: geo, material: mat };
  }, []);
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

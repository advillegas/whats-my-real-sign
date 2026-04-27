"use client";

/**
 * Procedural Milky Way + deep-space background, drawn on the inside of a sphere
 * surrounding the camera.
 *
 * The shader works in galactic coordinates: it transforms the equatorial
 * direction into the galactic frame, then builds the brightness field as:
 *
 *   - A Gaussian-fall-off "disk" centered on the galactic plane.
 *   - A bulge concentrated near the galactic center (+ a thinner halo outward).
 *   - Multi-octave fbm noise modulating disk thickness + intensity to suggest
 *     star fields and clumps.
 *   - A "dust lane" mask carved out of the disk near the plane to give it the
 *     classic dark spine.
 *   - A subtle blue ambient gradient + faint warm Zodiacal glow toward the sun.
 *
 * No textures required, but the result is a believable galaxy stripe rather
 * than blotchy noise. Bloom further bumps the brightest fluctuations.
 */

import { useMemo } from "react";
import { BackSide, ShaderMaterial, SphereGeometry } from "three";
import { useViewer } from "@/store/viewer-store";
import { CELESTIAL_RADIUS } from "@/lib/coordinates";

// J2000 → galactic rotation (rows = X', Y', Z' in J2000 components).
// From: https://en.wikipedia.org/wiki/Galactic_coordinate_system#Conversion_between_equatorial_and_galactic_coordinates
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

uniform vec3 uGalX;
uniform vec3 uGalY;
uniform vec3 uGalZ;
uniform float uIntensity;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
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
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * vnoise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);

  // Equatorial → galactic frame.
  vec3 g = vec3(dot(uGalX, d), dot(uGalY, d), dot(uGalZ, d));

  float galLat = asin(clamp(g.z, -1.0, 1.0));        // -π/2..π/2
  float galLon = atan(g.y, g.x);                      // -π..π

  // Disk profile: Gaussian falloff in latitude. Use a wider profile near
  // the galactic center and tighter further out.
  float distGC = length(vec2(galLon, 0.0));
  float diskThickness = 0.07 + 0.03 * smoothstep(3.14, 0.0, distGC);
  float disk = exp(-(galLat * galLat) / (2.0 * diskThickness * diskThickness));

  // Bulge near galactic center.
  float angDistGC = acos(clamp(g.x, -1.0, 1.0));
  float bulge = exp(-pow(angDistGC / 0.55, 2.0)) * 0.9;
  // Subtle far-side bulge (anti-center) for symmetry.
  float anti = exp(-pow((3.14159 - angDistGC) / 1.6, 2.0)) * 0.06;

  // Multi-octave noise for star clumps and clouds. Use galactic xy + lat
  // so structure stays anchored to the disk.
  float n1 = fbm(vec3(galLon * 1.4, galLat * 8.0, 1.7));
  float n2 = fbm(vec3(galLon * 4.0, galLat * 22.0, 4.3));
  float n3 = fbm(vec3(galLon * 12.0, galLat * 60.0, 9.1));
  float clumps = 0.45 + 0.55 * (n1 * 0.55 + n2 * 0.3 + n3 * 0.15);

  // Dust lane: a darker stripe near the plane modulated by noise.
  float laneCore = exp(-(galLat * galLat) / 0.0008);
  float laneNoise = fbm(vec3(galLon * 3.5, galLat * 50.0, 7.7));
  float dust = laneCore * smoothstep(0.4, 0.85, laneNoise);

  // Color mixes.
  vec3 milkyCool = vec3(0.55, 0.70, 1.00);   // outer arms, blue
  vec3 milkyWarm = vec3(1.00, 0.90, 0.78);   // disk core
  vec3 bulgeCol  = vec3(1.10, 0.85, 0.55);   // central bulge yellow-orange
  vec3 laneCol   = vec3(0.10, 0.05, 0.02);

  // Ambient sky: dark blue with a slight gradient.
  float skyGrad = 0.5 + 0.5 * d.y;
  vec3 sky = mix(vec3(0.004, 0.006, 0.018), vec3(0.012, 0.018, 0.045), skyGrad);

  vec3 col = sky;
  // Disk = warm core fading to cool outer + clumpy structure.
  vec3 diskCol = mix(milkyCool, milkyWarm, smoothstep(2.5, 0.0, distGC));
  col += diskCol * disk * clumps * 0.55 * uIntensity;
  col += bulgeCol * bulge * 0.95 * uIntensity;
  col += milkyCool * anti * uIntensity;
  // Carve out dust.
  col -= laneCol * dust * 0.9;
  // Tiny background "field star" twinkle so the off-plane sky isn't dead.
  float dust2 = smoothstep(0.85, 1.0, fbm(d * 95.0));
  col += vec3(0.6, 0.7, 0.9) * dust2 * 0.05;

  col = max(col, vec3(0.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function MilkyWay() {
  const visible = useViewer((s) => s.layers.milkyway);
  const { geometry, material } = useMemo(() => {
    const geo = new SphereGeometry(CELESTIAL_RADIUS * 0.99, 96, 48);
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      side: BackSide,
      depthWrite: false,
      toneMapped: true,
      uniforms: {
        uGalX: { value: GAL_X },
        uGalY: { value: GAL_Y },
        uGalZ: { value: GAL_Z },
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

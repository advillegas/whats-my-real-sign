"use client";

/**
 * Per-pixel procedural deep-zoom starfield.
 *
 * Rendered as an inside-out sphere whose fragment shader synthesizes ~5–10
 * million sub-magnitude stars on the celestial sphere via three octaves of
 * deterministic 3D hashing. The procedural function is evaluated per pixel
 * (independent of mesh tessellation), so stars stay pixel-sharp at any zoom
 * — this is what gives the "forever zoom" feel: each cell only resolves into
 * a visible star once the camera has enough angular resolution to make it
 * larger than a pixel, so new detail keeps emerging as the user zooms in.
 *
 * Density is modulated by the Milky Way panorama luminance so the galactic
 * plane is dense and high-galactic-latitude regions are sparse, matching the
 * real distribution.
 *
 * Visibility ramps in below FOV 50° (≈ "constellation view") and is full at
 * FOV 25° and tighter, so all-sky views aren't cluttered with synthetic
 * dust competing with real bright stars.
 *
 * The sphere is rendered behind the real-star Points cloud (renderOrder = -8)
 * but in front of the Milky Way texture (-10) and uses additive blending so
 * synthetic stars sit on top of the panorama luminance like real stars do.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipMapLinearFilter,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
  type Texture,
} from "three";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useViewer } from "@/store/viewer-store";
import { CELESTIAL_RADIUS } from "@/lib/coordinates";

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

/**
 * Each octave checks the 3×3 cell neighborhood around the fragment so star
 * Gaussians don't get clipped at cell boundaries. Per-cell hash decides
 * whether a star exists, jitter position, brightness (Pareto-ish), and
 * colour (cool/warm). Star spatial radius is ~0.35 cells so they comfortably
 * span 2–4 pixels at the FOVs where each octave is meant to dominate.
 */
const FS = /* glsl */ `
precision highp float;
varying vec3 vDir;

uniform sampler2D uMilkyTex;
uniform vec3 uGalX;
uniform vec3 uGalY;
uniform vec3 uGalZ;
uniform float uFov;
uniform float uHasMilky;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Cube projection: pick the dominant axis face and use the other two as 2D
// coords. This keeps cell areas roughly uniform across the sphere — much
// closer to equal-area than naive lon/lat which pinches at the poles.
void cubeProject(vec3 d, out vec2 uv, out float faceId) {
  vec3 absD = abs(d);
  float maxC = max(absD.x, max(absD.y, absD.z));
  if (absD.x >= maxC - 1e-5) {
    uv = d.yz / max(absD.x, 1e-4);
    faceId = d.x > 0.0 ? 1.0 : 2.0;
  } else if (absD.y >= maxC - 1e-5) {
    uv = d.xz / max(absD.y, 1e-4);
    faceId = d.y > 0.0 ? 3.0 : 4.0;
  } else {
    uv = d.xy / max(absD.z, 1e-4);
    faceId = d.z > 0.0 ? 5.0 : 6.0;
  }
}

vec3 octave(vec2 uv, float faceId, float cells, float densityProb, float radius, float bias, float milky, float seed) {
  vec2 cellPos = uv * cells;
  vec2 baseCell = floor(cellPos);

  vec3 acc = vec3(0.0);
  for (float dy = -1.0; dy <= 1.0; dy += 1.0) {
    for (float dx = -1.0; dx <= 1.0; dx += 1.0) {
      vec2 cell = baseCell + vec2(dx, dy);
      vec3 seedV = vec3(cell, faceId * 19.0 + seed);
      float r1 = hash13(seedV);
      if (r1 > densityProb) continue;

      // Random star position within its cell (fully inside, not jittered to edges).
      vec2 starOff = vec2(hash13(seedV + 7.0), hash13(seedV + 13.0));
      vec2 starPos = cell + starOff * 0.7 + vec2(0.15);
      float dist = length(cellPos - starPos);

      // Brightness Pareto: most are mid, a few stand out. Exponent 4 ≫ 7 in
      // the previous version so far more stars are perceptibly bright.
      float power = pow(hash13(seedV + 19.0), 4.0);

      float t = hash13(seedV + 23.0);
      vec3 color = mix(vec3(0.78, 0.92, 1.18), vec3(1.20, 0.95, 0.72), t);

      // Soft Gaussian core + sharper inner peak for crisp "dot" feel.
      float r2 = (dist / radius);
      r2 = r2 * r2;
      float core = exp(-r2 * 4.5);
      float peak = exp(-r2 * 18.0);
      float falloff = core * 0.55 + peak * 0.85;

      float density = bias + (1.0 - bias) * milky;
      acc += color * falloff * power * density;
    }
  }
  return acc;
}

void main() {
  vec3 d = normalize(vDir);

  // Visibility ramp: starts fading in at 80° FOV (very modest zoom), fully
  // present by 25°. Above 80° we discard to save fill.
  float zoomFade = smoothstep(80.0, 25.0, uFov);
  if (zoomFade <= 0.001) discard;

  // Galactic plane luminance from Milky Way panorama (normalised 0..1).
  float milky = 0.0;
  if (uHasMilky > 0.5) {
    vec3 g = vec3(dot(uGalX, d), dot(uGalY, d), dot(uGalZ, d));
    float lon = atan(g.y, g.x);
    float lat = asin(clamp(g.z, -1.0, 1.0));
    float u = 0.5 - lon / 6.2831853;
    float v = 0.5 + lat / 3.1415927;
    vec3 c = texture2D(uMilkyTex, vec2(u, v)).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    milky = clamp(pow(l * 1.6, 1.3), 0.0, 1.0);
  }

  vec2 uv;
  float faceId;
  cubeProject(d, uv, faceId);

  // Per-octave brightness ramps so each tier dominates at its target zoom:
  //  - coarse stars are visible from 80° FOV down (already strong by 50°)
  //  - mid stars come in around 50° → 25°
  //  - fine deep field comes in around 30° → 12°
  float coarseFade = smoothstep(80.0, 40.0, uFov);
  float midFade    = smoothstep(55.0, 25.0, uFov);
  float fineFade   = smoothstep(35.0, 12.0, uFov);

  vec3 acc = vec3(0.0);
  // Coarse: ~9k cells/face × 6 faces × 0.07 prob ≈ 38k bright "extras".
  acc += octave(uv, faceId,  300.0, 0.07, 0.30, 0.45, milky, 1.0) * 1.8 * coarseFade;
  // Mid: ~810k cells × 0.05 prob ≈ 240k mid-bright stars.
  acc += octave(uv, faceId,  900.0, 0.05, 0.32, 0.35, milky, 2.0) * 1.5 * midFade;
  // Fine: ~22M cells × 0.04 prob ≈ 5.3M fine "deep field" stars.
  acc += octave(uv, faceId, 3000.0, 0.04, 0.34, 0.30, milky, 3.0) * 1.2 * fineFade;
  // Ultra: ~140M cells × 0.03 prob ≈ 25M faint micro-stars at extreme zoom.
  acc += octave(uv, faceId, 7500.0, 0.03, 0.36, 0.25, milky, 4.0) * 0.9
         * smoothstep(22.0, 12.0, uFov);

  gl_FragColor = vec4(acc * zoomFade, 1.0);
}
`;

interface CameraWithFov {
  fov?: number;
}

export function ProceduralStars() {
  const visible = useViewer((s) => s.layers.stars && s.layers.milkyway);
  const tex = useLoader(TextureLoader, "/textures/eso_milkyway.jpg") as Texture;
  const { camera, gl } = useThree();
  const matRef = useRef<ShaderMaterial>(null);

  const { geometry, material } = useMemo(() => {
    tex.minFilter = LinearMipMapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy?.() ?? 8);
    tex.generateMipmaps = true;
    tex.needsUpdate = true;

    const geo = new SphereGeometry(CELESTIAL_RADIUS * 0.995, 64, 32);
    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      blending: AdditiveBlending,
      toneMapped: true,
      uniforms: {
        uMilkyTex: { value: tex },
        uGalX: { value: GAL_X },
        uGalY: { value: GAL_Y },
        uGalZ: { value: GAL_Z },
        uFov: { value: 55 },
        uHasMilky: { value: 1.0 },
      },
    });
    return { geometry: geo, material: mat };
  }, [tex, gl]);

  useEffect(() => {
    matRef.current = material;
  }, [material]);

  useFrame(() => {
    if (!matRef.current) return;
    const fov = (camera as unknown as CameraWithFov).fov ?? 55;
    matRef.current.uniforms.uFov.value = fov;
  });

  if (!visible) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      visible={visible}
      renderOrder={-8}
      frustumCulled={false}
    />
  );
}

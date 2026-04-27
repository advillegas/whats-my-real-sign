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
 * Three-hash GLSL pseudo-random functions (Dave Hoskins style). Quality is
 * good enough that we get no obvious banding/regularity at any zoom.
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

vec3 octave(vec3 d, float cells, float densityProb, float gauss, float bias, float milky, float seed) {
  // Cube projection: pick the dominant axis face and use the other two as 2D
  // coords. This keeps cell areas roughly uniform across the sphere (much
  // closer to equal-area than naive lon/lat which pinches at the poles).
  vec3 absD = abs(d);
  float maxC = max(absD.x, max(absD.y, absD.z));
  vec2 uv;
  float faceId;
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

  vec2 cell = floor(uv * cells);
  vec2 frac = uv * cells - cell - 0.5;

  vec3 seedV = vec3(cell, faceId * 19.0 + seed);
  float r1 = hash13(seedV);
  if (r1 > densityProb) return vec3(0.0);

  vec2 jitter = vec2(hash13(seedV + 7.0), hash13(seedV + 13.0)) - 0.5;
  vec2 dPos = frac - jitter * 0.7;
  float r2 = dot(dPos, dPos);

  // Brightness Pareto-distributed: most are very faint, a few stand out.
  float power = pow(hash13(seedV + 19.0), 7.0);

  // Color tint along blackbody-ish axis (cool→hot)
  float t = hash13(seedV + 23.0);
  vec3 color = mix(vec3(0.85, 0.95, 1.10), vec3(1.10, 0.95, 0.78), t);

  // Density modulation by galactic plane brightness.
  float density = bias + (1.0 - bias) * milky;

  return color * exp(-r2 * gauss) * power * density;
}

void main() {
  vec3 d = normalize(vDir);

  // Visibility ramp: all-sky → constellation → close. Starts fading in at
  // 60° FOV, fully visible by 25°. Fully discarded above 60° to save fill.
  float zoomFade = smoothstep(60.0, 25.0, uFov);
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
    milky = clamp(pow(l * 1.5, 1.4), 0.0, 1.0);
  }

  vec3 acc = vec3(0.0);
  // Coarse octave: brighter, sparser, ~tens of thousands of stars across sky.
  acc += octave(d, 1000.0, 0.045, 280.0, 0.45, milky, 1.0);
  // Mid octave: ~hundreds of thousands of fainter stars.
  acc += octave(d, 2500.0, 0.030, 600.0, 0.35, milky, 2.0);
  // Fine octave: ~millions of barely-visible micro-stars; the "deep field" feel.
  acc += octave(d, 6000.0, 0.022, 1300.0, 0.25, milky, 3.0);

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

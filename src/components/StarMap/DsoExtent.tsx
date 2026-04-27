"use client";

/**
 * Renders large deep-sky objects at their actual angular size on the celestial
 * sphere, with type-aware glyphs (oriented galaxy ellipses, fuzzy globular
 * disks, planetary-nebula rings, nebula clouds, SNR filaments).
 *
 * The point-sprite cloud in `DeepSkyObjects` keeps rendering all DSOs (so
 * they're always clickable as a fallback). This component overlays geometry
 * for the visually-large ones (size >= ~3 arcmin) so M31, the Pleiades,
 * the Veil, the LMC etc. read at their real footprint instead of as dots.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { loadDeepSky, type DsoRecord } from "@/lib/catalogs";
import { useViewer } from "@/store/viewer-store";
import { lmstHours } from "@/lib/astronomy";

const TYPE_COLOR: Record<string, [number, number, number]> = {
  G: [0.9, 0.78, 1.0],
  GPair: [0.9, 0.78, 1.0],
  GTrpl: [0.9, 0.78, 1.0],
  GGroup: [0.9, 0.78, 1.0],
  GCl: [1.0, 0.9, 0.65],
  OCl: [0.7, 0.95, 1.0],
  PN: [0.6, 1.0, 0.85],
  EmN: [1.0, 0.6, 0.7],
  RfN: [0.85, 0.8, 1.0],
  Neb: [1.0, 0.65, 0.85],
  HII: [1.0, 0.6, 0.7],
  SNR: [1.0, 0.85, 0.65],
};

const TYPE_ID: Record<string, number> = {
  G: 1, GPair: 1, GTrpl: 1, GGroup: 1,
  GCl: 2,
  OCl: 3,
  PN: 4,
  EmN: 5, RfN: 5, Neb: 5, HII: 5,
  SNR: 6,
};

const VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vWorldPos;
uniform vec3 uColor;
uniform float uType;
uniform float uMag;
uniform float uHorizonEnabled;
uniform vec3 uZenithDir;

float galaxy(vec2 c, float r) {
  float core = exp(-r * r * 8.0);
  float halo = pow(1.0 - clamp(r, 0.0, 1.0), 2.2);
  return core * 1.4 + halo * 0.5;
}
float globular(vec2 c, float r) {
  float core = exp(-r * r * 16.0);
  float halo = pow(1.0 - clamp(r, 0.0, 1.0), 1.6);
  return core * 1.8 + halo * 0.45;
}
float openCluster(vec2 c, float r) {
  // Sparse stippled disk; just a soft halo here, the small "stars" come from
  // the underlying point cloud.
  float halo = pow(1.0 - clamp(r, 0.0, 1.0), 1.0) * 0.5;
  return halo;
}
float planetaryNebula(vec2 c, float r) {
  // Thin ring at r ≈ 0.85 with bright central star spec.
  float ring = smoothstep(0.04, 0.0, abs(r - 0.85));
  float center = exp(-r * r * 110.0);
  return ring * 1.4 + center * 1.2;
}
float nebula(vec2 c, float r) {
  float core = exp(-r * r * 3.0);
  return core * 0.9 + (1.0 - clamp(r, 0.0, 1.0)) * 0.5;
}
float snr(vec2 c, float r) {
  float ring = smoothstep(0.06, 0.0, abs(r - 0.78)) * 0.7;
  float fil = exp(-c.y * c.y * 220.0) * smoothstep(0.85, 0.0, abs(c.x)) * 0.5;
  return ring + fil;
}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r = length(c);
  if (r > 1.05) discard;

  float intensity;
  if (uType < 1.5) intensity = galaxy(c, r);
  else if (uType < 2.5) intensity = globular(c, r);
  else if (uType < 3.5) intensity = openCluster(c, r);
  else if (uType < 4.5) intensity = planetaryNebula(c, r);
  else if (uType < 5.5) intensity = nebula(c, r);
  else intensity = snr(c, r);

  // Horizon dimming.
  float altFactor = 1.0;
  if (uHorizonEnabled > 0.5) {
    float sinAlt = dot(normalize(vWorldPos), uZenithDir);
    altFactor = smoothstep(-0.05, 0.05, sinAlt);
  }

  // Brighter objects glow more.
  float magBoost = clamp((10.0 - uMag) / 10.0, 0.25, 1.4);
  intensity *= magBoost * altFactor;
  vec3 col = uColor * intensity;
  gl_FragColor = vec4(col, clamp(intensity, 0.0, 1.0));
}
`;

const ARCMIN_TO_RAD = Math.PI / (180 * 60);
const DSO_RADIUS_MULT = 0.992;
const MIN_ARCMIN = 3; // only render objects this big as extent

interface ExtendedRecord extends DsoRecord {
  size: number;
}

function isExtended(d: DsoRecord): d is ExtendedRecord {
  return typeof d.size === "number" && d.size >= MIN_ARCMIN;
}

interface DsoMeshProps {
  d: ExtendedRecord;
  baseGeometry: PlaneGeometry;
}

function DsoMesh({ d, baseGeometry }: DsoMeshProps) {
  const horizonEnabled = useViewer((s) => s.layers.horizon);
  const { camera } = useThree();

  const { mesh, material } = useMemo(() => {
    const tint = TYPE_COLOR[d.type] ?? [0.85, 0.85, 1.0];
    const tid = TYPE_ID[d.type] ?? 1;
    const major = (d.size ?? 0) * 0.5; // arcmin radius
    const minor = (d.sizeMinor ?? d.size ?? 0) * 0.5;
    const majorRad = major * ARCMIN_TO_RAD;
    const minorRad = minor * ARCMIN_TO_RAD;

    // World-space radius on the sphere of CELESTIAL_RADIUS·0.992.
    const r = CELESTIAL_RADIUS * DSO_RADIUS_MULT;
    const sx = majorRad * r;
    const sy = minorRad * r;

    const center = raDecHoursToVec3(d.ra, d.dec, r, new Vector3());
    const pa = ((d.posAngle ?? 0) * Math.PI) / 180;

    const mat = new ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uColor: { value: new Color(tint[0], tint[1], tint[2]) },
        uType: { value: tid },
        uMag: { value: Number.isFinite(d.mag) ? d.mag : 8 },
        uHorizonEnabled: { value: 0 },
        uZenithDir: { value: new Vector3(0, 1, 0) },
      },
    });
    const m = new Mesh(baseGeometry, mat);

    // Orient the plane: -Z axis pointing inward (toward origin) so the front
    // face faces the camera. Then rotate around the local Z (now the radial
    // axis) by the position angle. PA is measured east of north; "north" is
    // the projection of the celestial north pole onto the tangent plane.
    const lookM = new Matrix4().lookAt(center, new Vector3(0, 0, 0), new Vector3(0, 1, 0));
    m.position.copy(center);
    m.quaternion.setFromRotationMatrix(lookM);
    m.rotateZ(-pa); // negative because PA increases east (clockwise looking out)
    m.scale.set(sx, sy, 1);
    return { mesh: m, material: mat };
  }, [d, baseGeometry]);

  useEffect(() => {
    return () => {
      material.dispose();
      mesh.geometry = baseGeometry; // shared, don't dispose
    };
  }, [material, mesh, baseGeometry]);

  useFrame(() => {
    if (horizonEnabled) {
      const observer = useViewer.getState().observer;
      if (observer) {
        const date = useViewer.getState().date;
        const lst = lmstHours(date, observer.lon);
        const zenith = raDecHoursToVec3(lst, observer.lat, 1, new Vector3());
        material.uniforms.uHorizonEnabled.value = 1;
        material.uniforms.uZenithDir.value.copy(zenith);
        return;
      }
    }
    material.uniforms.uHorizonEnabled.value = 0;
    void camera;
  });

  return <primitive object={mesh} />;
}

export function DsoExtent() {
  const visible = useViewer((s) => s.layers.dso);
  const [records, setRecords] = useState<DsoRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadDeepSky().then((d) => {
      if (alive) setRecords(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  // One shared geometry; meshes apply per-instance scale + transform.
  const baseGeometry = useMemo(() => new PlaneGeometry(2, 2, 1, 1), []);
  useEffect(() => {
    return () => {
      baseGeometry.dispose();
    };
  }, [baseGeometry]);

  if (!records || !visible) return null;
  const extended = records.filter(isExtended);
  return (
    <group>
      {extended.map((d) => (
        <DsoMesh key={d.id} d={d} baseGeometry={baseGeometry} />
      ))}
    </group>
  );
}

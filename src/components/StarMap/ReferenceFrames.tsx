"use client";

/**
 * Toggleable celestial reference frames:
 *   • Equatorial RA/Dec grid — 24 hour-circles + 17 parallels (every 10°)
 *     with labels at the equator and along RA=0h.
 *   • Ecliptic — great circle inclined 23.4393° to the equator (J2000 mean
 *     obliquity), with the north and south ecliptic poles marked.
 *   • Galactic plane — great circle through the north galactic pole at
 *     (RA 12h 51m 26s, Dec +27° 07' 42", J2000), with NGP/SGP marked.
 *   • Celestial poles — small cross markers at NCP (Dec +90°) and SCP.
 *
 * All grids sit on a sphere of radius CELESTIAL_RADIUS·0.992 so they sit
 * just inside the star sphere without z-fighting it.
 */

import { useMemo } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from "three";
import { Html } from "@react-three/drei";
import {
  CELESTIAL_RADIUS,
  raDecHoursToVec3,
  raDecDegToVec3,
} from "@/lib/coordinates";
import { useViewer } from "@/store/viewer-store";

const GRID_RADIUS = CELESTIAL_RADIUS * 0.992;

const J2000_OBLIQUITY_DEG = 23.4392911;

// Galactic north pole in J2000 (Reid & Brunthaler 2004 / standard IAU value).
const GALACTIC_NORTH_RA_HRS = 12 + 51 / 60 + 26.282 / 3600;
const GALACTIC_NORTH_DEC_DEG = 27 + 7 / 60 + 42.01 / 3600;

interface GreatCircleGeometryOpts {
  /** Function that maps angle θ ∈ [0, 2π) → unit vector on the great circle. */
  point: (theta: number) => Vector3;
  /** Number of segments. 360 ≈ 1° per segment is plenty. */
  segments?: number;
}

function buildGreatCircle({
  point,
  segments = 360,
}: GreatCircleGeometryOpts): BufferGeometry {
  const positions: number[] = [];
  const v = new Vector3();
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    v.copy(point(a)).multiplyScalar(GRID_RADIUS);
    positions.push(v.x, v.y, v.z);
    v.copy(point(b)).multiplyScalar(GRID_RADIUS);
    positions.push(v.x, v.y, v.z);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

/** Equatorial grid: hour-circles (RA constant) + parallels (Dec constant). */
function buildEquatorialGrid(): BufferGeometry {
  const positions: number[] = [];
  const v = new Vector3();
  const decSegments = 180; // 1° per segment along each hour-circle
  const raSegments = 360; // 1° per segment along each parallel

  // 24 hour-circles
  for (let h = 0; h < 24; h++) {
    for (let i = 0; i < decSegments; i++) {
      const dec1 = -90 + (i / decSegments) * 180;
      const dec2 = -90 + ((i + 1) / decSegments) * 180;
      // Skip a tiny gap near the poles to keep them clean.
      if (Math.abs(dec1) > 89.5 || Math.abs(dec2) > 89.5) continue;
      raDecHoursToVec3(h, dec1, GRID_RADIUS, v);
      positions.push(v.x, v.y, v.z);
      raDecHoursToVec3(h, dec2, GRID_RADIUS, v);
      positions.push(v.x, v.y, v.z);
    }
  }
  // 17 parallels (every 10°: -80..+80)
  for (let dec = -80; dec <= 80; dec += 10) {
    for (let i = 0; i < raSegments; i++) {
      const ra1 = (i / raSegments) * 24;
      const ra2 = ((i + 1) / raSegments) * 24;
      raDecHoursToVec3(ra1, dec, GRID_RADIUS, v);
      positions.push(v.x, v.y, v.z);
      raDecHoursToVec3(ra2, dec, GRID_RADIUS, v);
      positions.push(v.x, v.y, v.z);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

/** Ecliptic great circle: inclined to the equator by the J2000 mean obliquity. */
function buildEclipticCircle(): BufferGeometry {
  const eps = (J2000_OBLIQUITY_DEG * Math.PI) / 180;
  const cosE = Math.cos(eps);
  const sinE = Math.sin(eps);
  return buildGreatCircle({
    point: (theta) => {
      // Parameterise the ecliptic by ecliptic longitude λ → equatorial x,y,z.
      // Standard rotation about the +X axis by the obliquity.
      const x = Math.cos(theta);
      const y = Math.sin(theta) * cosE; // becomes Dec component
      const z = Math.sin(theta) * sinE; // contributes to RA
      // Our scene convention: +X = RA 0 Dec 0, +Y = NCP, +Z = RA 6h Dec 0.
      // Equatorial → scene: x_scene = x_eq, y_scene = z_eq, z_scene = y_eq.
      return new Vector3(x, z, y);
    },
  });
}

/** Galactic plane great circle: orthogonal to the galactic-pole vector. */
function buildGalacticCircle(): BufferGeometry {
  const ngp = raDecHoursToVec3(
    GALACTIC_NORTH_RA_HRS,
    GALACTIC_NORTH_DEC_DEG,
    1,
    new Vector3(),
  );
  // Build an orthonormal basis (u, v) in the plane perpendicular to NGP.
  const upGuess = Math.abs(ngp.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(upGuess, ngp).normalize();
  const v = new Vector3().crossVectors(ngp, u).normalize();
  return buildGreatCircle({
    point: (theta) => {
      return new Vector3()
        .addScaledVector(u, Math.cos(theta))
        .addScaledVector(v, Math.sin(theta));
    },
  });
}

/** Two short crosses at the celestial poles. */
function buildPoles(): BufferGeometry {
  const positions: number[] = [];
  const v = new Vector3();
  const armLen = 0.04; // angular radius in radians (~2.3°)
  for (const decSign of [1, -1]) {
    // North/south pole; draw four short arcs along Dec = ±(90 - armLen) at
    // RA = 0, 6, 12, 18.
    const polarDec = decSign * 90;
    const ringDec = decSign * (90 - armLen * (180 / Math.PI));
    for (const ra of [0, 6, 12, 18]) {
      raDecHoursToVec3(ra, polarDec, GRID_RADIUS, v);
      positions.push(v.x, v.y, v.z);
      raDecHoursToVec3(ra, ringDec, GRID_RADIUS, v);
      positions.push(v.x, v.y, v.z);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

const eqMaterial = (): LineBasicMaterial =>
  new LineBasicMaterial({
    color: 0x66a3ff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
const eclMaterial = (): LineBasicMaterial =>
  new LineBasicMaterial({
    color: 0xffd07a,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
const galMaterial = (): LineBasicMaterial =>
  new LineBasicMaterial({
    color: 0xff8fb1,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
const poleMaterial = (): LineBasicMaterial =>
  new LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

// Hour labels along the equator: RA in hours, Dec = 0.
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => ({ h, label: `${h}h` }));
// Dec labels along RA = 0h.
const DEC_LABELS = [-60, -30, 30, 60];

function FrameLabel({
  pos,
  text,
  tone,
}: {
  pos: [number, number, number];
  text: string;
  tone: string;
}) {
  return (
    <group position={pos}>
      <Html center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
        <span
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 9,
            color: tone,
            textShadow: "0 0 4px rgba(0,0,0,0.95)",
            whiteSpace: "nowrap",
            opacity: 0.85,
            letterSpacing: "0.04em",
          }}
        >
          {text}
        </span>
      </Html>
    </group>
  );
}

export function ReferenceFrames() {
  const layers = useViewer((s) => s.layers);

  const eqGeo = useMemo(() => buildEquatorialGrid(), []);
  const eclGeo = useMemo(() => buildEclipticCircle(), []);
  const galGeo = useMemo(() => buildGalacticCircle(), []);
  const polGeo = useMemo(() => buildPoles(), []);

  const tmp = new Vector3();

  return (
    <group>
      {layers.gridEquatorial && (
        <>
          <lineSegments
            args={[eqGeo, eqMaterial()]}
            frustumCulled={false}
          />
          {HOUR_LABELS.map(({ h, label }) => {
            raDecHoursToVec3(h, 0, GRID_RADIUS * 1.001, tmp);
            return (
              <FrameLabel
                key={`ra-${h}`}
                pos={[tmp.x, tmp.y, tmp.z]}
                text={label}
                tone="rgba(150, 200, 255, 0.95)"
              />
            );
          })}
          {DEC_LABELS.map((d) => {
            raDecHoursToVec3(0, d, GRID_RADIUS * 1.001, tmp);
            return (
              <FrameLabel
                key={`dec-${d}`}
                pos={[tmp.x, tmp.y, tmp.z]}
                text={`${d > 0 ? "+" : ""}${d}°`}
                tone="rgba(150, 200, 255, 0.85)"
              />
            );
          })}
        </>
      )}
      {layers.gridEcliptic && (
        <>
          <lineSegments
            args={[eclGeo, eclMaterial()]}
            frustumCulled={false}
          />
          {/* Ecliptic poles */}
          <FrameLabel
            pos={poleVec(true, J2000_OBLIQUITY_DEG, "ecl", tmp)}
            text="NEP"
            tone="rgba(255, 200, 130, 0.95)"
          />
          <FrameLabel
            pos={poleVec(false, J2000_OBLIQUITY_DEG, "ecl", tmp)}
            text="SEP"
            tone="rgba(255, 200, 130, 0.95)"
          />
        </>
      )}
      {layers.gridGalactic && (
        <>
          <lineSegments
            args={[galGeo, galMaterial()]}
            frustumCulled={false}
          />
          <FrameLabel
            pos={galPoleVec(true, tmp)}
            text="NGP"
            tone="rgba(255, 170, 200, 0.95)"
          />
          <FrameLabel
            pos={galPoleVec(false, tmp)}
            text="SGP"
            tone="rgba(255, 170, 200, 0.95)"
          />
        </>
      )}
      {layers.poles && (
        <>
          <lineSegments
            args={[polGeo, poleMaterial()]}
            frustumCulled={false}
          />
          <FrameLabel
            pos={ncpVec(true, tmp)}
            text="NCP"
            tone="rgba(255, 255, 255, 0.95)"
          />
          <FrameLabel
            pos={ncpVec(false, tmp)}
            text="SCP"
            tone="rgba(255, 255, 255, 0.95)"
          />
        </>
      )}
    </group>
  );
}

function poleVec(
  north: boolean,
  obliqDeg: number,
  kind: "ecl",
  tmp: Vector3,
): [number, number, number] {
  if (kind === "ecl") {
    // Ecliptic poles in equatorial coords: NEP at RA=18h, Dec=+(90-ε); SEP opposite.
    const dec = (north ? 1 : -1) * (90 - obliqDeg);
    const ra = north ? 18 : 6;
    raDecHoursToVec3(ra, dec, GRID_RADIUS * 1.01, tmp);
    return [tmp.x, tmp.y, tmp.z];
  }
  return [0, 0, 0];
}

function galPoleVec(north: boolean, tmp: Vector3): [number, number, number] {
  const ra = north
    ? GALACTIC_NORTH_RA_HRS
    : (GALACTIC_NORTH_RA_HRS + 12) % 24;
  const dec = (north ? 1 : -1) * GALACTIC_NORTH_DEC_DEG;
  raDecHoursToVec3(ra, dec, GRID_RADIUS * 1.01, tmp);
  return [tmp.x, tmp.y, tmp.z];
}

function ncpVec(north: boolean, tmp: Vector3): [number, number, number] {
  raDecHoursToVec3(0, north ? 89.7 : -89.7, GRID_RADIUS * 1.005, tmp);
  return [tmp.x, tmp.y, tmp.z];
}

void raDecDegToVec3; // re-exported for parity with other components
export type _LineSegments = LineSegments;

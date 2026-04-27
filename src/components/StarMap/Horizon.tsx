"use client";

/**
 * When an observer location is set, render the local horizon: a thin great
 * circle around the celestial sphere at altitude 0°, plus four cardinal
 * markers (N / E / S / W) and a faint translucent "ground" disk below the
 * horizon. Stars and DSOs receive their own below-horizon dimming via the
 * `uHorizonEnabled` shader uniform on those materials; this component only
 * draws the visible reference.
 *
 * The horizon great circle is the locus of points perpendicular to the local
 * zenith vector. The zenith vector is the J2000 unit vector pointing toward
 * RA=LST, Dec=lat at the active date.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useViewer } from "@/store/viewer-store";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { lmstHours } from "@/lib/astronomy";

const HORIZON_RADIUS = CELESTIAL_RADIUS * 0.99;

/** Build a circle in the plane perpendicular to `zenith`, scaled to `radius`. */
function buildHorizonCircle(): BufferGeometry {
  const segments = 360;
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    // We'll position at the origin and rotate the line into place via a frame
    // basis at render time. Two unit vectors `u`, `v` will be uploaded as
    // attributes effectively via per-frame mesh transform.
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    positions.push(Math.cos(a), 0, Math.sin(a));
    positions.push(Math.cos(b), 0, Math.sin(b));
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geo;
}

/** Compute the four cardinal-direction unit vectors given a zenith (J2000). */
function cardinalDirs(zenith: Vector3): {
  n: Vector3;
  e: Vector3;
  s: Vector3;
  w: Vector3;
} {
  // North on the horizon = projection of NCP onto the horizon plane.
  const ncp = new Vector3(0, 1, 0);
  // n = ncp - (ncp·zenith)·zenith, then normalise. (Gram-Schmidt.)
  const n = ncp.clone().addScaledVector(zenith, -ncp.dot(zenith)).normalize();
  // East = zenith × north (right-handed).
  const e = new Vector3().crossVectors(zenith, n).normalize();
  const s = n.clone().multiplyScalar(-1);
  const w = e.clone().multiplyScalar(-1);
  return { n, e, s, w };
}

function CardinalLabel({
  pos,
  text,
}: {
  pos: [number, number, number];
  text: string;
}) {
  return (
    <group position={pos}>
      <Html center zIndexRange={[1, 0]} style={{ pointerEvents: "none" }}>
        <span
          style={{
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 11,
            color: "rgba(255, 230, 180, 0.9)",
            textShadow: "0 0 6px rgba(0,0,0,0.95)",
            fontWeight: 600,
            letterSpacing: "0.16em",
          }}
        >
          {text}
        </span>
      </Html>
    </group>
  );
}

export function Horizon() {
  const observer = useViewer((s) => s.observer);
  const horizonOn = useViewer((s) => s.layers.horizon);

  const lineGeo = useMemo(() => buildHorizonCircle(), []);
  const groundGeo = useMemo(() => new CircleGeometry(HORIZON_RADIUS * 0.999, 96), []);

  const lineMat = useMemo(
    () =>
      new LineBasicMaterial({
        color: new Color(0xffd28a),
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    [],
  );
  const groundMat = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color(0x14110a),
        transparent: true,
        opacity: 0.65,
        side: DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  const ringRef = useRef<LineSegments>(null);
  const groundRef = useRef<Mesh>(null);

  useEffect(() => {
    return () => {
      lineGeo.dispose();
      groundGeo.dispose();
      lineMat.dispose();
      groundMat.dispose();
    };
  }, [lineGeo, groundGeo, lineMat, groundMat]);

  // Track current cardinal positions for the labels (refresh every frame).
  const cardinalRef = useRef<{
    n: [number, number, number];
    e: [number, number, number];
    s: [number, number, number];
    w: [number, number, number];
  } | null>(null);

  useFrame(() => {
    if (!observer || !horizonOn) {
      if (ringRef.current) ringRef.current.visible = false;
      if (groundRef.current) groundRef.current.visible = false;
      return;
    }
    const date = useViewer.getState().date;
    const lst = lmstHours(date, observer.lon);
    const zenith = raDecHoursToVec3(lst, observer.lat, 1, new Vector3());
    const nadir = zenith.clone().multiplyScalar(-1);

    // Build a basis for the horizon plane (perpendicular to zenith).
    const guess = Math.abs(zenith.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const u = new Vector3().crossVectors(guess, zenith).normalize();
    const v = new Vector3().crossVectors(zenith, u).normalize();

    if (ringRef.current) {
      ringRef.current.visible = true;
      // Set ring orientation: align local +X with u, local +Z with v, scaled
      // up to HORIZON_RADIUS.
      ringRef.current.matrixAutoUpdate = false;
      const m = ringRef.current.matrix;
      m.makeBasis(
        u.clone().multiplyScalar(HORIZON_RADIUS),
        zenith.clone(),
        v.clone().multiplyScalar(HORIZON_RADIUS),
      );
      m.setPosition(0, 0, 0);
      ringRef.current.matrixWorldNeedsUpdate = true;
    }
    if (groundRef.current) {
      groundRef.current.visible = true;
      groundRef.current.matrixAutoUpdate = false;
      // Position the disk just below the horizon plane (slightly toward nadir).
      const m = groundRef.current.matrix;
      const offset = nadir.clone().multiplyScalar(0.5);
      m.makeBasis(u.clone(), v.clone(), zenith.clone().multiplyScalar(-1));
      m.setPosition(offset.x, offset.y, offset.z);
      groundRef.current.matrixWorldNeedsUpdate = true;
    }

    const dirs = cardinalDirs(zenith);
    cardinalRef.current = {
      n: scaled(dirs.n, HORIZON_RADIUS * 1.01),
      e: scaled(dirs.e, HORIZON_RADIUS * 1.01),
      s: scaled(dirs.s, HORIZON_RADIUS * 1.01),
      w: scaled(dirs.w, HORIZON_RADIUS * 1.01),
    };
  });

  if (!observer || !horizonOn) return null;

  return (
    <group>
      <lineSegments ref={ringRef} args={[lineGeo, lineMat]} frustumCulled={false} />
      <mesh ref={groundRef} args={[groundGeo, groundMat]} frustumCulled={false} />
      {cardinalRef.current && (
        <>
          <CardinalLabel pos={cardinalRef.current.n} text="N" />
          <CardinalLabel pos={cardinalRef.current.e} text="E" />
          <CardinalLabel pos={cardinalRef.current.s} text="S" />
          <CardinalLabel pos={cardinalRef.current.w} text="W" />
        </>
      )}
    </group>
  );
}

function scaled(v: Vector3, r: number): [number, number, number] {
  return [v.x * r, v.y * r, v.z * r];
}

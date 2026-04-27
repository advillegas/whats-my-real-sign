"use client";

/**
 * Detects what celestial object the cursor is hovering over and publishes a
 * HoverInfo to the viewer store. The store-backed approach keeps the floating
 * label rendered as plain DOM (outside the canvas) so it stays crisp and
 * doesn't fight the WebGL pipeline.
 *
 * Hover priority:
 *   1) Sun and Planets — handled directly via R3F onPointerOver in those
 *      components (more reliable than raycasting tiny billboards).
 *   2) Stars Points cloud — closest star within angular threshold.
 *   3) Deep-sky Points cloud — closest DSO within angular threshold.
 *   4) Otherwise, fall back to whichever IAU constellation the cursor
 *      direction lies inside.
 */

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3, type Object3D } from "three";
import { raDecHoursToVec3 } from "@/lib/coordinates";
import {
  loadBoundaries,
  loadMeta,
  type ConstellationBoundary,
  type ConstellationMeta,
} from "@/lib/constellations";
import { constellationAt } from "@/lib/constellations";
import { useViewer } from "@/store/viewer-store";
import type { StarRecord, DsoRecord } from "@/lib/catalogs";

interface Props {
  stars: StarRecord[];
  dso: DsoRecord[];
}

const HOVER_THROTTLE_MS = 35;

export function Hover({ stars, dso }: Props) {
  const { gl, camera, scene } = useThree();
  const setHover = useViewer((s) => s.setHover);
  const lastFire = useRef(0);
  const boundsRef = useRef<ConstellationBoundary[] | null>(null);
  const metaRef = useRef<ConstellationMeta[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadBoundaries(), loadMeta()]).then(([b, m]) => {
      if (!alive) return;
      boundsRef.current = b;
      metaRef.current = m;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const dom = gl.domElement;

    const onMove = (e: PointerEvent) => {
      // Hover labels only make sense for an actual hovering pointer (mouse /
      // pen). On touch the pointer is "down" while moving which would just
      // flicker labels during a drag.
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const now = performance.now();
      if (now - lastFire.current < HOVER_THROTTLE_MS) return;
      lastFire.current = now;

      const rect = dom.getBoundingClientRect();
      const ndc = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      const raycaster = new Raycaster();
      raycaster.setFromCamera(ndc, camera);
      raycaster.params.Points = { threshold: 5 };

      const targets: Object3D[] = [];
      scene.traverse((o) => {
        if ((o as { isPoints?: boolean }).isPoints) targets.push(o);
      });

      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const v = hit.point.clone().normalize();
        const bestStar = nearest(v, stars);
        const bestDso = nearest(v, dso);
        const useStar =
          bestStar && (!bestDso || bestStar.angle < bestDso.angle);
        if (useStar && bestStar && bestStar.angle < 0.012) {
          const s = bestStar.record;
          setHover({
            name: s.name ?? s.bf ?? s.id,
            subtitle: starSubtitle(s),
            kind: "star",
            x: e.clientX,
            y: e.clientY,
          });
          return;
        }
        if (bestDso && bestDso.angle < 0.018) {
          const d = bestDso.record;
          setHover({
            name: d.name ?? d.id,
            subtitle: dsoSubtitle(d),
            kind: "dso",
            x: e.clientX,
            y: e.clientY,
          });
          return;
        }
      }

      // Fallback: which constellation are we pointing at?
      const bounds = boundsRef.current;
      const meta = metaRef.current;
      if (bounds && meta) {
        const dir = raycaster.ray.direction.clone().normalize();
        const raDec = vecToRaDec(dir);
        const con = constellationAt(raDec.ra, raDec.dec, bounds);
        if (con) {
          const m = meta.find((x) => x.desig === con.desig);
          setHover({
            name: m?.name ?? con.desig,
            subtitle: `IAU ${con.desig}`,
            kind: "constellation",
            conDesig: con.desig,
            x: e.clientX,
            y: e.clientY,
          });
          return;
        }
      }
      setHover(null);
    };

    const onLeave = () => setHover(null);

    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", onLeave);
    return () => {
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerleave", onLeave);
    };
  }, [gl, camera, scene, stars, dso, setHover]);

  return null;
}

function nearest<T extends { ra: number; dec: number }>(
  hitDir: Vector3,
  records: T[],
): { record: T; angle: number } | null {
  if (!records || records.length === 0) return null;
  let best: T | null = null;
  let bestDot = -1;
  const tmp = new Vector3();
  for (const r of records) {
    raDecHoursToVec3(r.ra, r.dec, 1, tmp);
    const dot = tmp.dot(hitDir);
    if (dot > bestDot) {
      bestDot = dot;
      best = r;
    }
  }
  if (!best) return null;
  return { record: best, angle: Math.acos(Math.max(-1, Math.min(1, bestDot))) };
}

function vecToRaDec(v: Vector3): { ra: number; dec: number } {
  const n = v.clone().normalize();
  const dec = (Math.asin(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;
  let raRad = Math.atan2(n.z, n.x);
  if (raRad < 0) raRad += Math.PI * 2;
  return { ra: (raRad * 180) / Math.PI / 15, dec };
}

function starSubtitle(s: StarRecord): string {
  const parts: string[] = [];
  if (s.bf) parts.push(s.bf);
  if (s.con) parts.push(`in ${s.con}`);
  parts.push(`mag ${s.mag.toFixed(2)}`);
  return parts.join(" • ");
}

function dsoSubtitle(d: DsoRecord): string {
  const parts: string[] = [];
  if (d.m) parts.push(`Messier ${d.m}`);
  if (d.con) parts.push(`in ${d.con}`);
  if (Number.isFinite(d.mag)) parts.push(`mag ${d.mag.toFixed(2)}`);
  return parts.join(" • ");
}

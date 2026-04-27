"use client";

/**
 * Click-to-select handler. Performs ray casting against the stars Points cloud
 * (and any deep-sky-object cloud passed in as a prop) and dispatches the
 * matching record to the viewer store. Sun/planets handle their own clicks via
 * R3F event handlers on their meshes.
 */

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3, type Object3D } from "three";
import { raDecHoursToVec3 } from "@/lib/coordinates";
import { useViewer } from "@/store/viewer-store";
import type { StarRecord, DsoRecord } from "@/lib/catalogs";
import {
  constellationAt,
  loadBoundaries,
  loadMeta,
  type ConstellationBoundary,
  type ConstellationMeta,
} from "@/lib/constellations";

interface Props {
  stars: StarRecord[];
  dso: DsoRecord[];
}

export function Picker({ stars, dso }: Props) {
  const { gl, camera, scene } = useThree();
  const downPos = useRef<{ x: number; y: number; t: number } | null>(null);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
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
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      downPos.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const start = downPos.current;
      downPos.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dt = performance.now() - start.t;
      // Treat as click only if barely moved and under 350 ms.
      if (dx * dx + dy * dy > 9 || dt > 350) return;
      const rect = dom.getBoundingClientRect();
      const ndc = new Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      const raycaster = new Raycaster();
      raycaster.setFromCamera(ndc, camera);
      // Generous threshold for Points
      raycaster.params.Points = { threshold: 6 };
      const targets: Object3D[] = [];
      scene.traverse((o) => {
        if ((o as { isPoints?: boolean }).isPoints) targets.push(o);
      });
      const hits = raycaster.intersectObjects(targets, false);

      // 1) Try to land on a star or DSO point.
      if (hits.length > 0) {
        const hit = hits[0];
        const v: Vector3 = hit.point.clone().normalize();
        const bestStar = nearest(v, stars);
        const bestDso = nearest(v, dso);
        const useStar =
          bestStar && (!bestDso || bestStar.angle < bestDso.angle);
        if (useStar && bestStar && bestStar.angle < 0.012) {
          const s = bestStar.record;
          setCameraTarget(s.ra, s.dec, 25);
          setSelected({
            id: s.id,
            name: s.name ?? s.bf ?? s.id,
            ra: s.ra,
            dec: s.dec,
            kind: "star",
            mag: s.mag,
            wikiTitle: s.name,
            blurb: starBlurb(s),
          });
          return;
        }
        if (bestDso && bestDso.angle < 0.018) {
          const d = bestDso.record;
          setCameraTarget(d.ra, d.dec, 18);
          setSelected({
            id: d.id,
            name: d.name ?? d.id,
            ra: d.ra,
            dec: d.dec,
            kind: "dso",
            mag: d.mag,
            wikiTitle: d.m ? `Messier ${d.m}` : d.id,
            blurb: dsoBlurb(d),
          });
          return;
        }
      }

      // 2) Fall through to constellation: which IAU constellation contains
      //    the click direction? This is essential on touch where hover
      //    doesn't fire and there's no precise point to aim at.
      const bounds = boundsRef.current;
      const meta = metaRef.current;
      if (!bounds || !meta) return;
      const dir = raycaster.ray.direction.clone().normalize();
      const raDec = vecToRaDec(dir);
      const con = constellationAt(raDec.ra, raDec.dec, bounds);
      if (!con) return;
      const conMeta = meta.find((m) => m.desig === con.desig);
      const name = conMeta?.name ?? con.desig;
      setSelected({
        id: `CON_${con.desig}`,
        name,
        ra: conMeta?.ra ?? raDec.ra,
        dec: conMeta?.dec ?? raDec.dec,
        kind: "constellation",
        blurb: `IAU constellation ${con.desig}.`,
        wikiTitle: name,
      });
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, scene, stars, dso, setSelected, setCameraTarget]);

  return null;
}

function vecToRaDec(v: Vector3): { ra: number; dec: number } {
  const n = v.clone().normalize();
  const dec = (Math.asin(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;
  let raRad = Math.atan2(n.z, n.x);
  if (raRad < 0) raRad += Math.PI * 2;
  return { ra: (raRad * 180) / Math.PI / 15, dec };
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

function starBlurb(s: StarRecord): string {
  const parts: string[] = [];
  if (s.bf) parts.push(s.bf);
  if (s.con) parts.push(`in ${s.con}`);
  parts.push(`magnitude ${s.mag.toFixed(2)}`);
  return parts.join(" • ");
}

function dsoBlurb(d: DsoRecord): string {
  const parts: string[] = [];
  if (d.m) parts.push(`Messier ${d.m}`);
  parts.push(typeName(d.type));
  if (d.con) parts.push(`in ${d.con}`);
  if (Number.isFinite(d.mag)) parts.push(`mag ${d.mag.toFixed(2)}`);
  return parts.join(" • ");
}

function typeName(t: string): string {
  switch (t) {
    case "G":
      return "Galaxy";
    case "GPair":
      return "Galaxy pair";
    case "GTrpl":
      return "Galaxy triplet";
    case "GGroup":
      return "Galaxy group";
    case "GCl":
      return "Globular cluster";
    case "OCl":
      return "Open cluster";
    case "PN":
      return "Planetary nebula";
    case "EmN":
      return "Emission nebula";
    case "RfN":
      return "Reflection nebula";
    case "SNR":
      return "Supernova remnant";
    case "HII":
      return "HII region";
    case "Neb":
      return "Nebula";
    default:
      return t;
  }
}

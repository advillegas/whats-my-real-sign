"use client";

/**
 * Click-to-select handler. Performs ray casting against the stars Points cloud
 * (and any deep-sky-object cloud passed in as a prop) and dispatches the
 * matching record to the viewer store. Sun/planets handle their own clicks via
 * R3F event handlers on their meshes.
 *
 * Selection tolerances scale with the camera FOV: a "click within ~0.5° of a
 * star" feels right when zoomed in to 12°, but at the all-sky 95° view we
 * want the tolerance to relax to a couple of degrees so users can grab dim
 * stars without surgical aim. The Raycaster `Points` threshold scales the
 * same way.
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
import { starBlurb, dsoBlurb } from "@/lib/object-info";

interface Props {
  stars: StarRecord[];
  dso: DsoRecord[];
}

const STAR_TOL_AT_55 = 0.012; // radians, ~0.69°
const DSO_TOL_AT_55 = 0.018; // ~1.03°
const POINTS_THRESH_AT_55 = 6; // raycaster threshold, units (= world-units on a 1000R sphere ~ 0.34°)

export function Picker({ stars, dso }: Props) {
  const { gl, camera, scene } = useThree();
  const downPos = useRef<{ x: number; y: number; t: number } | null>(null);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const tooltipsEnabledRef = useRef(true);
  useEffect(() => {
    return useViewer.subscribe((s) => {
      tooltipsEnabledRef.current = s.tooltipsEnabled;
    });
  }, []);
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

      const cam = camera as { fov?: number };
      const fov = cam.fov ?? 55;
      const fovScale = fov / 55;
      const starTol = STAR_TOL_AT_55 * fovScale;
      const dsoTol = DSO_TOL_AT_55 * fovScale;
      const pointsThresh = POINTS_THRESH_AT_55 * fovScale;

      const raycaster = new Raycaster();
      raycaster.setFromCamera(ndc, camera);
      raycaster.params.Points = { threshold: pointsThresh };
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
        if (useStar && bestStar && bestStar.angle < starTol) {
          const s = bestStar.record;
          setCameraTarget(s.ra, s.dec, Math.min(fov, 25));
          if (tooltipsEnabledRef.current) {
            setSelected({
              id: s.id,
              name: s.name ?? s.bf ?? s.id,
              ra: s.ra,
              dec: s.dec,
              kind: "star",
              mag: s.mag,
              wikiTitle: s.name,
              blurb: starBlurb(s),
              record: s,
            });
          }
          return;
        }
        if (bestDso && bestDso.angle < dsoTol) {
          const d = bestDso.record;
          setCameraTarget(d.ra, d.dec, Math.min(fov, 18));
          if (tooltipsEnabledRef.current) {
            setSelected({
              id: d.id,
              name: d.name ?? d.id,
              ra: d.ra,
              dec: d.dec,
              kind: "dso",
              mag: d.mag,
              wikiTitle: d.m ? `Messier ${d.m}` : d.name ?? d.id,
              blurb: dsoBlurb(d),
              record: d,
            });
          }
          return;
        }
      }

      // 2) Fall through to constellation.
      const bounds = boundsRef.current;
      const meta = metaRef.current;
      if (!bounds || !meta) return;
      const dir = raycaster.ray.direction.clone().normalize();
      const raDec = vecToRaDec(dir);
      const con = constellationAt(raDec.ra, raDec.dec, bounds);
      if (!con) return;
      if (!tooltipsEnabledRef.current) return;
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

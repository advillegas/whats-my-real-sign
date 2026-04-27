"use client";

import { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { Vector3 } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { loadMeta, type ConstellationMeta } from "@/lib/constellations";
import { useViewer } from "@/store/viewer-store";

function ConstellationLabel({
  m,
  position,
}: {
  m: ConstellationMeta;
  position: [number, number, number];
}) {
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const setHover = useViewer((s) => s.setHover);
  const markInteracted = useViewer((s) => s.markInteracted);
  const [hot, setHot] = useState(false);
  const fontSize = m.rank === "1" ? 14 : m.rank === "2" ? 12 : 10.5;
  const baseOpacity = m.rank === "1" ? 0.95 : m.rank === "2" ? 0.78 : 0.55;
  const opacity = hot ? 1 : baseOpacity;
  const color = hot ? "rgba(255, 240, 195, 1)" : `rgba(180,210,255,${opacity})`;

  return (
    <group position={position}>
      <Html
        center
        distanceFactor={undefined}
        zIndexRange={[5, 0]}
        style={{ pointerEvents: "auto" }}
      >
        <button
          onPointerEnter={(e) => {
            setHot(true);
            setHover({
              name: m.name,
              subtitle: `IAU ${m.desig}`,
              kind: "constellation",
              conDesig: m.desig,
              x: e.clientX,
              y: e.clientY,
            });
            setSelected({
              id: `CON_${m.desig}`,
              name: m.name,
              ra: m.ra,
              dec: m.dec,
              kind: "constellation",
              blurb: `IAU constellation ${m.desig}.`,
              wikiTitle: m.name,
            });
            document.body.style.cursor = "pointer";
          }}
          onPointerMove={(e) => {
            setHover({
              name: m.name,
              subtitle: `IAU ${m.desig}`,
              kind: "constellation",
              conDesig: m.desig,
              x: e.clientX,
              y: e.clientY,
            });
          }}
          onPointerLeave={() => {
            setHot(false);
            setHover(null);
            document.body.style.cursor = "";
          }}
          onClick={() => {
            setCameraTarget(m.ra, m.dec);
            setSelected({
              id: `CON_${m.desig}`,
              name: m.name,
              ra: m.ra,
              dec: m.dec,
              kind: "constellation",
              blurb: `IAU constellation ${m.desig}.`,
              wikiTitle: m.name,
            });
            markInteracted();
          }}
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize,
            fontWeight: hot ? 600 : 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color,
            background: "transparent",
            border: "none",
            textShadow: hot
              ? "0 0 12px rgba(255, 220, 150, 0.8), 0 0 4px rgba(0,0,0,0.85)"
              : "0 0 6px rgba(0,0,0,0.85)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            pointerEvents: "auto",
            transition: "color 120ms ease, text-shadow 120ms ease",
          }}
        >
          {m.name}
        </button>
      </Html>
    </group>
  );
}

export function ConstellationLabels() {
  const visible = useViewer((s) => s.layers.labels);
  const [meta, setMeta] = useState<ConstellationMeta[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadMeta().then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!meta || !visible) return null;
  const tmp = new Vector3();
  return (
    <group>
      {meta.map((m) => {
        raDecHoursToVec3(m.ra, m.dec, CELESTIAL_RADIUS * 0.97, tmp);
        return (
          <ConstellationLabel
            key={m.desig + m.ra}
            m={m}
            position={[tmp.x, tmp.y, tmp.z]}
          />
        );
      })}
    </group>
  );
}

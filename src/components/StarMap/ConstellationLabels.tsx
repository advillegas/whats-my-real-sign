"use client";

import { useEffect, useState } from "react";
import { Html } from "@react-three/drei";
import { Vector3 } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { loadMeta, type ConstellationMeta } from "@/lib/constellations";
import { useViewer } from "@/store/viewer-store";

export function ConstellationLabels() {
  const visible = useViewer((s) => s.layers.labels);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
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
        const fontSize =
          m.rank === "1" ? 14 : m.rank === "2" ? 12 : 10.5;
        const opacity = m.rank === "1" ? 0.95 : m.rank === "2" ? 0.78 : 0.55;
        return (
          <group key={m.desig + m.ra} position={[tmp.x, tmp.y, tmp.z]}>
            <Html
              center
              distanceFactor={undefined}
              zIndexRange={[5, 0]}
              style={{ pointerEvents: "auto" }}
            >
              <button
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
                }}
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize,
                  fontWeight: 500,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: `rgba(180,210,255,${opacity})`,
                  background: "transparent",
                  border: "none",
                  textShadow: "0 0 6px rgba(0,0,0,0.85)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  pointerEvents: "auto",
                }}
              >
                {m.name}
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

"use client";

import { useMemo } from "react";
import { Vector3 } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { allBodySky, type PlanetId } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";

const PLANET_STYLE: Record<PlanetId, { color: string; size: number; halo: number }> = {
  Sun: { color: "#ffd27a", size: 14, halo: 0.4 },
  Moon: { color: "#e9eef8", size: 10, halo: 0.2 },
  Mercury: { color: "#c2c2c0", size: 4, halo: 0.0 },
  Venus: { color: "#fff0c8", size: 6, halo: 0.0 },
  Mars: { color: "#ff8552", size: 5, halo: 0.0 },
  Jupiter: { color: "#f1d3a3", size: 8, halo: 0.0 },
  Saturn: { color: "#e8d8a4", size: 7, halo: 0.0 },
  Uranus: { color: "#9ad2e6", size: 5, halo: 0.0 },
  Neptune: { color: "#6f8edd", size: 5, halo: 0.0 },
};

export function Planets() {
  const date = useViewer((s) => s.date);
  const visible = useViewer((s) => s.layers.planets);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);

  const positions = useMemo(() => {
    const all = allBodySky(date).filter((b) => b.id !== "Sun");
    return all.map((b) => ({
      ...b,
      vec: raDecHoursToVec3(b.ra, b.dec, CELESTIAL_RADIUS * 0.93, new Vector3()),
    }));
  }, [date]);

  if (!visible) return null;

  return (
    <group>
      {positions.map((p) => {
        const style = PLANET_STYLE[p.id];
        return (
          <group key={p.id} position={[p.vec.x, p.vec.y, p.vec.z]}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                setCameraTarget(p.ra, p.dec);
                setSelected({
                  id: p.id,
                  name: p.id,
                  ra: p.ra,
                  dec: p.dec,
                  kind: "planet",
                  wikiTitle: p.id,
                  blurb: `Distance ${p.dist.toFixed(3)} AU from Earth.`,
                });
              }}
            >
              <sphereGeometry args={[style.size, 16, 16]} />
              <meshBasicMaterial color={style.color} toneMapped={false} />
            </mesh>
            {style.halo > 0 && (
              <mesh>
                <sphereGeometry args={[style.size * 2.2, 16, 16]} />
                <meshBasicMaterial
                  color={style.color}
                  transparent
                  opacity={style.halo}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

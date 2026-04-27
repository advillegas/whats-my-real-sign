"use client";

import { useMemo } from "react";
import { Vector3 } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { sunSky } from "@/lib/astronomy";
import { useViewer } from "@/store/viewer-store";

export function Sun() {
  const date = useViewer((s) => s.date);
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);

  const pos = useMemo(() => {
    const sky = sunSky(date);
    return { ...sky, vec: raDecHoursToVec3(sky.ra, sky.dec, CELESTIAL_RADIUS * 0.94, new Vector3()) };
  }, [date]);

  return (
    <group position={[pos.vec.x, pos.vec.y, pos.vec.z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          setCameraTarget(pos.ra, pos.dec);
          setSelected({
            id: "SUN",
            name: "Sun",
            ra: pos.ra,
            dec: pos.dec,
            kind: "planet",
            mag: -26.7,
            wikiTitle: "Sun",
            blurb: `The Sun, our star. Distance ${pos.dist.toFixed(3)} AU.`,
          });
        }}
      >
        <sphereGeometry args={[12, 32, 32]} />
        <meshBasicMaterial color={"#ffd27a"} toneMapped={false} />
      </mesh>
      {/* Glow */}
      <mesh>
        <sphereGeometry args={[28, 32, 32]} />
        <meshBasicMaterial color={"#ffb14a"} transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[60, 32, 32]} />
        <meshBasicMaterial color={"#ff8a3d"} transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

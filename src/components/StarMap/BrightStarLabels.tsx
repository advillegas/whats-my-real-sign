"use client";

/**
 * Always-on labels for the ~100 brightest named stars (Sirius, Vega, etc.).
 *
 * Labels are billboarded `drei/Html` buttons that fade in as the camera
 * zooms from "all sky" toward "constellation view" (FOV ≲ 50°). At very
 * tight zoom (FOV < 18°) they fade in their Bayer designation as a small
 * subscript so the chart reads scientifically. Hovering or tapping a label
 * highlights it in place and (when tooltips are enabled) opens the panel.
 */

import { useEffect, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { CELESTIAL_RADIUS, raDecHoursToVec3 } from "@/lib/coordinates";
import { loadStars, type StarRecord } from "@/lib/catalogs";
import { useViewer } from "@/store/viewer-store";
import { starBlurb } from "@/lib/object-info";
import { useLabelTap } from "@/lib/use-label-tap";

const BRIGHT_MAG_LIMIT = 2.6;
const FADE_IN_FOV = 70;
const FADE_OUT_FOV = 18;
/**
 * A few named stars sit just outside the BRIGHT_MAG_LIMIT cut but are
 * navigationally / culturally critical (Polaris, Mira, etc.). We pin them to
 * the label set explicitly.
 */
const ALWAYS_LABEL_NAMES = new Set<string>([
  "Polaris",
  "Mira",
  "Thuban",
  "Albireo",
  "Alcor",
  "Alcyone",
  "Sheliak",
  "Etamin",
  "Megrez",
]);

interface LabelProps {
  star: StarRecord;
  position: [number, number, number];
}

function StarLabel({ star, position }: LabelProps) {
  const setSelected = useViewer((s) => s.setSelected);
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const markInteracted = useViewer((s) => s.markInteracted);
  const [hot, setHot] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const { camera } = useThree();
  const displayName = star.name ?? star.bf ?? star.id;
  const labelTap = useLabelTap({
    onTap: () => {
      setCameraTarget(star.ra, star.dec, 18);
      setSelected({
        id: star.id,
        name: displayName,
        ra: star.ra,
        dec: star.dec,
        kind: "star",
        mag: star.mag,
        wikiTitle: star.name,
        blurb: starBlurb(star),
        record: star,
      });
      markInteracted();
    },
  });

  useFrame(() => {
    if (!ref.current) return;
    const cam = camera as { fov?: number };
    const fov = cam.fov ?? 55;
    // 0 → fully visible, 1 → invisible
    const fade =
      fov >= FADE_IN_FOV ? 1 : fov <= FADE_OUT_FOV ? 0 : (fov - FADE_OUT_FOV) / (FADE_IN_FOV - FADE_OUT_FOV);
    const opacity = (1 - fade) * (hot ? 1 : 0.78);
    ref.current.style.opacity = String(opacity);
    if (subRef.current) {
      // Bayer fades in only at very tight zoom.
      const subOpacity = fov <= 26 ? Math.max(0, (26 - fov) / 14) : 0;
      subRef.current.style.opacity = String(Math.min(0.85, subOpacity) * (hot ? 1 : 0.7));
    }
  });

  const bayer = star.bf;

  return (
    <group position={position}>
      <Html
        center
        zIndexRange={[4, 0]}
        style={{ pointerEvents: "auto" }}
      >
        <button
          ref={ref}
          onPointerDown={labelTap.onPointerDown}
          onPointerEnter={(e) => {
            if (e.pointerType !== "mouse") return;
            setHot(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerLeave={() => {
            setHot(false);
            document.body.style.cursor = "";
          }}
          style={{
            fontFamily: "var(--font-sans, system-ui)",
            fontSize: 11,
            fontWeight: hot ? 700 : 500,
            letterSpacing: "0.06em",
            color: hot ? "rgba(255, 245, 220, 1)" : "rgba(220, 235, 255, 0.9)",
            background: "transparent",
            border: "none",
            padding: "1px 4px",
            textShadow: hot
              ? "0 0 12px rgba(255, 220, 150, 0.85), 0 0 4px rgba(0,0,0,0.95)"
              : "0 0 6px rgba(0,0,0,0.9)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            touchAction: "none",
            transition: "color 120ms ease, text-shadow 120ms ease, opacity 200ms ease",
            transform: "translate(8px, 0)",
          }}
        >
          {displayName}
          {bayer && bayer !== displayName && (
            <span
              ref={subRef}
              style={{
                marginLeft: 5,
                fontSize: 9,
                color: "rgba(170, 200, 240, 0.85)",
                fontWeight: 400,
                letterSpacing: "0.03em",
                opacity: 0,
                transition: "opacity 220ms ease",
              }}
            >
              {bayer}
            </span>
          )}
        </button>
      </Html>
    </group>
  );
}

export function BrightStarLabels() {
  const visible = useViewer((s) => s.layers.labels);
  const [stars, setStars] = useState<StarRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadStars().then((s) => {
      if (alive) setStars(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!stars || !visible) return null;

  const named = stars.filter(
    (s) =>
      !!s.name &&
      (s.mag <= BRIGHT_MAG_LIMIT || ALWAYS_LABEL_NAMES.has(s.name)),
  );
  const tmp = new Vector3();
  return (
    <group>
      {named.map((s) => {
        raDecHoursToVec3(s.ra, s.dec, CELESTIAL_RADIUS * 0.985, tmp);
        return (
          <StarLabel
            key={s.id}
            star={s}
            position={[tmp.x, tmp.y, tmp.z]}
          />
        );
      })}
    </group>
  );
}

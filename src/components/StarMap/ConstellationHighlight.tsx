"use client";

/**
 * Renders a "detailed representation" of whichever constellation is currently
 * being highlighted via hover or selection:
 *
 *   1) The canonical IAU stick figure, drawn thick and bright gold.
 *   2) The constellation's IAU boundary, drawn as a dashed cyan polygon.
 *   3) Markers + labels for the major named stars in that constellation.
 *
 * Appears as an additive overlay on top of the dim base layers, so the rest
 * of the sky stays visible. Fades smoothly when the highlight changes.
 */

import { useEffect, useMemo, useState } from "react";
import { Html, Line } from "@react-three/drei";
import { Vector3 } from "three";
import {
  CELESTIAL_RADIUS,
  raDecDegToVec3,
  raDecHoursToVec3,
} from "@/lib/coordinates";
import {
  loadBoundaries,
  loadMeta,
  type ConstellationBoundary,
  type ConstellationMeta,
} from "@/lib/constellations";
import { loadConstellationLines, type StarRecord } from "@/lib/catalogs";
import { useViewer, selectHighlightedConDesig } from "@/store/viewer-store";

interface LineFeature {
  id: string;
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
}

interface Props {
  stars: StarRecord[];
}

/** Greek letter spellings → glyphs for compact star labels. */
const GREEK: Record<string, string> = {
  alf: "α",
  bet: "β",
  gam: "γ",
  del: "δ",
  eps: "ε",
  zet: "ζ",
  eta: "η",
  the: "θ",
  iot: "ι",
  kap: "κ",
  lam: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omi: "ο",
  pi: "π",
  rho: "ρ",
  sig: "σ",
  tau: "τ",
  ups: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  ome: "ω",
};

function formatBayer(bf: string | undefined): string | null {
  if (!bf) return null;
  // Bayer-Flamsteed format from HYG: e.g. "58Alp Ori", "Alp UMa", "21    Ori".
  const trimmed = bf.trim();
  const greekMatch = trimmed.match(/([A-Za-z]{2,3})(\d*)\s+([A-Za-z]{3})/);
  if (greekMatch) {
    const key = greekMatch[1].slice(0, 3).toLowerCase();
    const sup = greekMatch[2];
    const glyph = GREEK[key] ?? greekMatch[1];
    return sup ? `${glyph}${toSuperscript(sup)}` : glyph;
  }
  return null;
}

function toSuperscript(d: string): string {
  const map: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  return d
    .split("")
    .map((c) => map[c] ?? c)
    .join("");
}

/** Drei Line wants Vector3 tuples, not raw [x,y,z]. */
type Pt = [number, number, number];

const HIGHLIGHT_R = CELESTIAL_RADIUS * 0.9955;
const BOUNDARY_R = CELESTIAL_RADIUS * 0.991;

export function ConstellationHighlight({ stars }: Props) {
  const desig = useViewer(selectHighlightedConDesig);

  const [lines, setLines] = useState<LineFeature[] | null>(null);
  const [bounds, setBounds] = useState<ConstellationBoundary[] | null>(null);
  const [meta, setMeta] = useState<ConstellationMeta[] | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadConstellationLines(), loadBoundaries(), loadMeta()]).then(
      ([l, b, m]) => {
        if (!alive) return;
        setLines(l);
        setBounds(b);
        setMeta(m);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  const highlight = useMemo(() => {
    if (!desig || !lines || !bounds) return null;
    const lineFeat = lines.find((f) => f.id === desig);
    const boundary = bounds.find((b) => b.desig === desig);
    if (!lineFeat && !boundary) return null;

    const tmp = new Vector3();
    const linePolylines: Pt[][] = [];
    if (lineFeat) {
      for (const polyline of lineFeat.geometry.coordinates) {
        const pts: Pt[] = [];
        for (const [lon, lat] of polyline) {
          raDecDegToVec3(lon, lat, HIGHLIGHT_R, tmp);
          pts.push([tmp.x, tmp.y, tmp.z]);
        }
        if (pts.length >= 2) linePolylines.push(pts);
      }
    }

    const boundaryRings: Pt[][] = [];
    if (boundary) {
      for (const ring of boundary.rings) {
        const pts: Pt[] = [];
        // Densify so wide gaps along a great circle don't look chunky.
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const lon1 = a[0];
          let lon2 = b[0];
          // Avoid wrap-around segments that would draw across the sky.
          while (lon2 - lon1 > 180) lon2 -= 360;
          while (lon2 - lon1 < -180) lon2 += 360;
          const subdiv = 6;
          for (let s = 0; s < subdiv; s++) {
            const t = s / subdiv;
            const lon = lon1 + (lon2 - lon1) * t;
            const lat = a[1] + (b[1] - a[1]) * t;
            raDecDegToVec3(lon, lat, BOUNDARY_R, tmp);
            pts.push([tmp.x, tmp.y, tmp.z]);
          }
        }
        if (pts.length > 0) {
          // Close the ring.
          pts.push(pts[0]);
          boundaryRings.push(pts);
        }
      }
    }

    return { linePolylines, boundaryRings };
  }, [desig, lines, bounds]);

  const namedStars = useMemo(() => {
    if (!desig || !stars) return [];
    const list = stars.filter(
      (s) =>
        s.con === desig &&
        (s.name || formatBayer(s.bf)) &&
        s.mag <= 4.5,
    );
    list.sort((a, b) => a.mag - b.mag);
    return list.slice(0, 14);
  }, [desig, stars]);

  const conName = useMemo(() => {
    if (!desig || !meta) return null;
    return meta.find((m) => m.desig === desig)?.name ?? desig;
  }, [desig, meta]);

  if (!highlight) return null;

  return (
    <group renderOrder={20}>
      {/* Stick figure (canonical IAU lines) — bright gold, thick */}
      {highlight.linePolylines.map((poly, i) => (
        <Line
          key={`line-${i}`}
          points={poly}
          color="#ffd27a"
          lineWidth={2.6}
          transparent
          opacity={0.95}
          depthTest={false}
          dashed={false}
        />
      ))}

      {/* Soft outer glow on the stick figure */}
      {highlight.linePolylines.map((poly, i) => (
        <Line
          key={`glow-${i}`}
          points={poly}
          color="#ffe1a8"
          lineWidth={6}
          transparent
          opacity={0.18}
          depthTest={false}
          dashed={false}
        />
      ))}

      {/* IAU boundary — dashed cyan outline */}
      {highlight.boundaryRings.map((ring, i) => (
        <Line
          key={`bound-${i}`}
          points={ring}
          color="#7fd6ff"
          lineWidth={1.4}
          transparent
          opacity={0.55}
          depthTest={false}
          dashed
          dashSize={0.5}
          gapSize={0.25}
        />
      ))}

      {/* Named-star markers + labels */}
      {namedStars.map((s) => {
        const pos = raDecHoursToVec3(s.ra, s.dec, CELESTIAL_RADIUS * 0.99, new Vector3());
        const label =
          s.name ?? formatBayer(s.bf) ?? s.bf?.split(/\s+/)[0] ?? s.id;
        return (
          <group key={s.id} position={[pos.x, pos.y, pos.z]}>
            <mesh>
              <ringGeometry args={[2.0, 2.6, 32]} />
              <meshBasicMaterial
                color="#ffd27a"
                transparent
                opacity={0.85}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
            <Html
              center
              distanceFactor={undefined}
              zIndexRange={[6, 0]}
              style={{ pointerEvents: "none", transform: "translate(0, -14px)" }}
            >
              <div
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.04em",
                  color: "rgba(255, 230, 180, 0.95)",
                  textShadow: "0 0 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,1)",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}
              >
                {label}
              </div>
            </Html>
          </group>
        );
      })}

      {/* Constellation name banner */}
      {conName && meta && (() => {
        const m = meta.find((x) => x.desig === desig);
        if (!m) return null;
        const pos = raDecHoursToVec3(m.ra, m.dec, CELESTIAL_RADIUS * 0.965, new Vector3());
        return (
          <group position={[pos.x, pos.y, pos.z]}>
            <Html
              center
              zIndexRange={[7, 0]}
              style={{ pointerEvents: "none", transform: "translate(0, 18px)" }}
            >
              <div
                style={{
                  fontFamily: "var(--font-sans, system-ui)",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: "rgba(255, 240, 200, 0.95)",
                  textShadow:
                    "0 0 12px rgba(255, 200, 120, 0.7), 0 0 4px rgba(0,0,0,0.95)",
                  background: "rgba(20, 14, 6, 0.45)",
                  border: "1px solid rgba(255, 210, 130, 0.35)",
                  borderRadius: 999,
                  padding: "3px 12px",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  backdropFilter: "blur(6px)",
                  WebkitBackdropFilter: "blur(6px)",
                }}
              >
                {conName}
              </div>
            </Html>
          </group>
        );
      })()}
    </group>
  );
}

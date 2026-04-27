/**
 * Map a star's B-V color index to a perceived RGB color, following the
 * standard temperature lookup table used by Stellarium / Cartes du Ciel.
 * B-V ≈ -0.4 (very blue O/B types) → +2.0 (very red M/L types).
 */

import { Color } from "three";

const TABLE: { bv: number; r: number; g: number; b: number }[] = [
  { bv: -0.4, r: 155, g: 176, b: 255 },
  { bv: -0.3, r: 162, g: 184, b: 255 },
  { bv: -0.2, r: 167, g: 191, b: 255 },
  { bv: -0.1, r: 191, g: 211, b: 255 },
  { bv: 0.0, r: 202, g: 215, b: 255 },
  { bv: 0.1, r: 226, g: 233, b: 255 },
  { bv: 0.2, r: 248, g: 247, b: 255 },
  { bv: 0.3, r: 255, g: 245, b: 236 },
  { bv: 0.4, r: 255, g: 238, b: 217 },
  { bv: 0.5, r: 255, g: 232, b: 200 },
  { bv: 0.6, r: 255, g: 226, b: 182 },
  { bv: 0.7, r: 255, g: 219, b: 168 },
  { bv: 0.8, r: 255, g: 211, b: 155 },
  { bv: 0.9, r: 255, g: 203, b: 144 },
  { bv: 1.0, r: 255, g: 195, b: 134 },
  { bv: 1.2, r: 255, g: 178, b: 110 },
  { bv: 1.4, r: 255, g: 161, b: 90 },
  { bv: 1.7, r: 255, g: 137, b: 65 },
  { bv: 2.0, r: 255, g: 112, b: 50 },
];

export function bvToColor(bv: number, out?: Color): Color {
  const c = out ?? new Color();
  if (!Number.isFinite(bv)) {
    c.setRGB(1, 1, 1);
    return c;
  }
  if (bv <= TABLE[0].bv) {
    c.setRGB(TABLE[0].r / 255, TABLE[0].g / 255, TABLE[0].b / 255);
    return c;
  }
  const last = TABLE[TABLE.length - 1];
  if (bv >= last.bv) {
    c.setRGB(last.r / 255, last.g / 255, last.b / 255);
    return c;
  }
  for (let i = 0; i < TABLE.length - 1; i++) {
    const a = TABLE[i];
    const b = TABLE[i + 1];
    if (bv >= a.bv && bv <= b.bv) {
      const t = (bv - a.bv) / (b.bv - a.bv);
      c.setRGB(
        ((a.r + (b.r - a.r) * t) / 255),
        ((a.g + (b.g - a.g) * t) / 255),
        ((a.b + (b.b - a.b) * t) / 255),
      );
      return c;
    }
  }
  c.setRGB(1, 1, 1);
  return c;
}

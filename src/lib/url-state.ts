/**
 * URL state encoding for deep-linkable views.
 *
 * Query parameters:
 *   d   ISO-ish date (YYYY-MM-DD or full ISO 8601 incl BC). Supports negative
 *       astronomical years e.g. `-0044-03-15` for the Ides of March, 44 BC.
 *   ra  RA in hours, decimal.
 *   dec Dec in degrees, decimal.
 *   fov FOV in degrees, decimal.
 *   l   Layer flags as a compact bitmask. Bit order matches LAYER_ORDER below.
 *   o   Observer location encoded as "lat,lon,elev[,name]"; absent = geocentric.
 *
 * Reading and writing the URL is debounced — we don't want to thrash
 * window.history on every camera frame.
 */

import type { LayerToggle, ObserverLocation } from "@/store/viewer-store";

export const LAYER_ORDER: LayerToggle[] = [
  "stars",
  "lines",
  "boundaries",
  "labels",
  "milkyway",
  "planets",
  "dso",
  "gridEquatorial",
  "gridEcliptic",
  "gridGalactic",
  "poles",
  "horizon",
];

export interface ViewState {
  date?: Date;
  ra?: number;
  dec?: number;
  fov?: number;
  layers?: Partial<Record<LayerToggle, boolean>>;
  observer?: ObserverLocation | null;
}

export function encodeLayers(
  layers: Record<LayerToggle, boolean>,
): string {
  let bits = 0;
  for (let i = 0; i < LAYER_ORDER.length; i++) {
    if (layers[LAYER_ORDER[i]]) bits |= 1 << i;
  }
  return bits.toString(36);
}

export function decodeLayers(
  s: string,
): Partial<Record<LayerToggle, boolean>> {
  const bits = parseInt(s, 36);
  if (!Number.isFinite(bits)) return {};
  const out: Partial<Record<LayerToggle, boolean>> = {};
  for (let i = 0; i < LAYER_ORDER.length; i++) {
    out[LAYER_ORDER[i]] = (bits & (1 << i)) !== 0;
  }
  return out;
}

/** ISO date that supports negative astronomical years. */
export function encodeDate(d: Date): string {
  const year = d.getFullYear();
  const sign = year < 0 ? "-" : "";
  const yy = Math.abs(year).toString().padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${sign}${yy}-${mm}-${dd}`;
}

export function decodeDate(s: string): Date | null {
  // Accept "-0044-03-15", "2025-01-01", or full ISO.
  const match = s.match(/^(-?)(\d{1,6})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  const [, neg, y, m, day] = match;
  const year = parseInt((neg ?? "") + y, 10);
  const month = parseInt(m, 10) - 1;
  const dayN = parseInt(day, 10);
  const d = new Date(0);
  d.setFullYear(year, month, dayN);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function encodeObserver(o: ObserverLocation | null): string | null {
  if (!o) return null;
  const parts = [
    o.lat.toFixed(4),
    o.lon.toFixed(4),
    Math.round(o.elevationM).toString(),
  ];
  if (o.name) parts.push(encodeURIComponent(o.name));
  return parts.join(",");
}

export function decodeObserver(s: string): ObserverLocation | null {
  const parts = s.split(",");
  if (parts.length < 3) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  const elev = parseFloat(parts[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const obs: ObserverLocation = {
    lat,
    lon,
    elevationM: Number.isFinite(elev) ? elev : 0,
  };
  if (parts[3]) {
    try {
      obs.name = decodeURIComponent(parts[3]);
    } catch {
      /* noop */
    }
  }
  return obs;
}

export function buildUrl(view: ViewState, base?: string): string {
  const url = new URL(base ?? (typeof window !== "undefined" ? window.location.href : "https://example.org/"));
  if (view.date) url.searchParams.set("d", encodeDate(view.date));
  if (typeof view.ra === "number") url.searchParams.set("ra", view.ra.toFixed(3));
  if (typeof view.dec === "number") url.searchParams.set("dec", view.dec.toFixed(2));
  if (typeof view.fov === "number") url.searchParams.set("fov", view.fov.toFixed(1));
  if (view.layers) {
    const all = view.layers as Record<LayerToggle, boolean>;
    url.searchParams.set("l", encodeLayers(all));
  }
  if (view.observer) {
    const enc = encodeObserver(view.observer);
    if (enc) url.searchParams.set("o", enc);
  } else {
    url.searchParams.delete("o");
  }
  return url.toString();
}

export function parseUrl(href?: string): ViewState {
  const url = new URL(href ?? (typeof window !== "undefined" ? window.location.href : "https://example.org/"));
  const out: ViewState = {};
  const d = url.searchParams.get("d");
  if (d) {
    const dt = decodeDate(d);
    if (dt) out.date = dt;
  }
  const ra = url.searchParams.get("ra");
  if (ra) out.ra = parseFloat(ra);
  const dec = url.searchParams.get("dec");
  if (dec) out.dec = parseFloat(dec);
  const fov = url.searchParams.get("fov");
  if (fov) out.fov = parseFloat(fov);
  const l = url.searchParams.get("l");
  if (l) out.layers = decodeLayers(l);
  const o = url.searchParams.get("o");
  if (o) out.observer = decodeObserver(o);
  return out;
}

/**
 * Builds a fuzzy-search index across all catalog objects + planets +
 * constellations. The index is built once on the client and reused for the
 * Cmd+K palette.
 */

import Fuse from "fuse.js";
import type { StarRecord, DsoRecord } from "./catalogs";
import type { ConstellationMeta } from "./constellations";
import { VISIBLE_PLANETS } from "./astronomy";

export interface SearchEntry {
  id: string;
  name: string;
  /** Disambiguating subtitle, e.g. "Star • Cyg" or "Galaxy • Messier 31". */
  subtitle: string;
  ra: number;
  dec: number;
  kind: "star" | "planet" | "dso" | "constellation";
  /** Wikipedia title to use for the info panel. */
  wikiTitle?: string;
}

export function buildSearchIndex(
  stars: StarRecord[],
  dso: DsoRecord[],
  meta: ConstellationMeta[],
): Fuse<SearchEntry> {
  const entries: SearchEntry[] = [];

  // Planets — RA/Dec are placeholders; the actual position is recomputed at fly-to time.
  for (const p of VISIBLE_PLANETS) {
    entries.push({
      id: p,
      name: p,
      subtitle: "Planet",
      ra: 0,
      dec: 0,
      kind: "planet",
      wikiTitle: p,
    });
  }
  entries.push({
    id: "Sun",
    name: "Sun",
    subtitle: "Our star",
    ra: 0,
    dec: 0,
    kind: "planet",
    wikiTitle: "Sun",
  });

  for (const m of meta) {
    entries.push({
      id: `CON_${m.desig}`,
      name: m.name,
      subtitle: `Constellation • ${m.desig}`,
      ra: m.ra,
      dec: m.dec,
      kind: "constellation",
      wikiTitle: m.name,
    });
  }

  for (const s of stars) {
    if (!s.name && !s.bf) continue; // Only named/Bayer stars in search
    entries.push({
      id: s.id,
      name: s.name ?? s.bf!,
      subtitle: `Star${s.con ? ` • ${s.con}` : ""} • mag ${s.mag.toFixed(2)}`,
      ra: s.ra,
      dec: s.dec,
      kind: "star",
      wikiTitle: s.name,
    });
  }

  for (const d of dso) {
    entries.push({
      id: d.id,
      name: d.name ?? d.id,
      subtitle: d.m
        ? `Messier ${d.m} • ${d.id}`
        : `${d.type}${d.con ? ` • ${d.con}` : ""}`,
      ra: d.ra,
      dec: d.dec,
      kind: "dso",
      wikiTitle: d.m ? `Messier ${d.m}` : d.name ?? d.id,
    });
  }

  return new Fuse(entries, {
    keys: [
      { name: "name", weight: 0.7 },
      { name: "id", weight: 0.2 },
      { name: "subtitle", weight: 0.1 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

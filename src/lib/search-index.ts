/**
 * Builds a fuzzy-search index across all catalog objects + planets +
 * constellations. Each entry carries a list of *aliases* — Greek-letter Bayer
 * forms ("α And"), Latinised abbreviations ("Alp And"), Flamsteed numbers,
 * HD/HIP/HR/Gliese/Messier/NGC/IC IDs, and constellation common names — so
 * the user can type any of them.
 *
 * Aliases are normalised (lowercased, accents stripped) for fast prefix matching.
 */

import Fuse from "fuse.js";
import type { StarRecord, DsoRecord } from "./catalogs";
import type { ConstellationMeta } from "./constellations";
import { VISIBLE_PLANETS } from "./astronomy";
import {
  expandBayerFlamsteed,
  constellationFullName,
} from "./object-info";

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
  /** Lowercase whitespace-collapsed alternates for matching. */
  aliases: string[];
}

const GREEK_LATIN_TO_UNICODE: Record<string, string> = {
  alp: "α", bet: "β", gam: "γ", del: "δ", eps: "ε", zet: "ζ", eta: "η",
  the: "θ", iot: "ι", kap: "κ", lam: "λ", mu: "μ", nu: "ν", xi: "ξ",
  omi: "ο", pi: "π", rho: "ρ", sig: "σ", tau: "τ", ups: "υ", phi: "φ",
  chi: "χ", psi: "ψ", ome: "ω",
};

const GREEK_FULL_TO_LETTER: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ")
    .trim();
}

/** Add common cross-aliases for stars: Greek-letter Bayer forms etc. */
function starAliases(s: StarRecord): string[] {
  const aliases = new Set<string>();
  if (s.name) aliases.add(s.name);
  if (s.bf) {
    aliases.add(s.bf);
    const { bayer, flamsteed } = expandBayerFlamsteed(s.bf);
    if (bayer) {
      aliases.add(bayer);
      // Latinised English forms: "alpha andromedae" / "alpha and"
      const m = s.bf.match(/^(\d+)?([A-Za-z]+)?\s+([A-Za-z]+)$/);
      if (m) {
        const greek = m[2]?.toLowerCase();
        const con = m[3];
        if (greek) {
          // Long form
          const fullGreek = Object.entries(GREEK_FULL_TO_LETTER).find(
            ([, lt]) => lt === GREEK_LATIN_TO_UNICODE[greek],
          )?.[0];
          if (fullGreek) {
            aliases.add(`${fullGreek} ${con}`);
            const conFull = constellationFullName(con);
            if (conFull) aliases.add(`${fullGreek} ${conFull}`);
          }
        }
      }
    }
    if (flamsteed) aliases.add(flamsteed);
  }
  if (s.con) {
    const full = constellationFullName(s.con);
    if (full) aliases.add(full);
  }
  if (s.hd) aliases.add(`HD ${s.hd}`);
  if (s.hip) aliases.add(`HIP ${s.hip}`);
  if (s.hr) aliases.add(`HR ${s.hr}`);
  if (s.gl) aliases.add(s.gl);
  return Array.from(aliases);
}

function dsoAliases(d: DsoRecord): string[] {
  const aliases = new Set<string>();
  if (d.name) aliases.add(d.name);
  if (d.commonNames) for (const n of d.commonNames) aliases.add(n);
  aliases.add(d.id);
  if (d.m) {
    aliases.add(`M${d.m}`);
    aliases.add(`M ${d.m}`);
    aliases.add(`Messier ${d.m}`);
  }
  if (d.ngc) aliases.add(`NGC ${d.ngc}`);
  if (d.ic) aliases.add(`IC ${d.ic}`);
  return Array.from(aliases);
}

export function buildSearchIndex(
  stars: StarRecord[],
  dso: DsoRecord[],
  meta: ConstellationMeta[],
): Fuse<SearchEntry> {
  const entries: SearchEntry[] = [];

  for (const p of VISIBLE_PLANETS) {
    entries.push({
      id: p,
      name: p,
      subtitle: "Planet",
      ra: 0,
      dec: 0,
      kind: "planet",
      wikiTitle: p,
      aliases: [p],
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
    aliases: ["Sun", "Sol"],
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
      aliases: [m.name, m.desig],
    });
  }

  for (const s of stars) {
    if (!s.name && !s.bf) continue; // Only named/Bayer stars in search
    const aliases = starAliases(s);
    entries.push({
      id: s.id,
      name: s.name ?? s.bf!,
      subtitle: `Star${s.con ? ` • ${s.con}` : ""} • mag ${s.mag.toFixed(2)}`,
      ra: s.ra,
      dec: s.dec,
      kind: "star",
      wikiTitle: s.name,
      aliases,
    });
  }

  for (const d of dso) {
    const aliases = dsoAliases(d);
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
      aliases,
    });
  }

  // Pre-normalise all aliases so the index matches case-insensitively and
  // accent-insensitively without needing Fuse to do the work each search.
  for (const e of entries) {
    e.aliases = Array.from(new Set([e.name, ...e.aliases].map(normalize)));
  }

  return new Fuse(entries, {
    keys: [
      { name: "name", weight: 0.5 },
      { name: "aliases", weight: 0.4 },
      { name: "subtitle", weight: 0.1 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 1,
    useExtendedSearch: false,
  });
}

/**
 * Display helpers for stars and deep-sky objects shared by the picker,
 * the bright-star labels, and the object info panel.
 *
 * Exposes:
 *  - `starBlurb` / `dsoBlurb` — short single-line summaries (catalog blurb).
 *  - `dsoTypeName` — long form of an OpenNGC type code.
 *  - `bvToTeff` — Ballesteros-style polynomial T_eff from B-V color index.
 *  - `formatRA` / `formatDec` — sexagesimal formatters.
 *  - `pcToLightYears` — astrophysical conversion.
 */

import type { StarRecord, DsoRecord } from "./catalogs";

const CON_NAMES: Record<string, string> = {
  And: "Andromeda", Ant: "Antlia", Aps: "Apus", Aql: "Aquila", Aqr: "Aquarius",
  Ara: "Ara", Ari: "Aries", Aur: "Auriga", Boo: "Boötes", Cae: "Caelum",
  Cam: "Camelopardalis", Cap: "Capricornus", Car: "Carina", Cas: "Cassiopeia",
  Cen: "Centaurus", Cep: "Cepheus", Cet: "Cetus", Cha: "Chamaeleon", Cir: "Circinus",
  CMa: "Canis Major", CMi: "Canis Minor", Cnc: "Cancer", Col: "Columba",
  Com: "Coma Berenices", CrA: "Corona Australis", CrB: "Corona Borealis",
  Crt: "Crater", Cru: "Crux", Crv: "Corvus", CVn: "Canes Venatici", Cyg: "Cygnus",
  Del: "Delphinus", Dor: "Dorado", Dra: "Draco", Equ: "Equuleus", Eri: "Eridanus",
  For: "Fornax", Gem: "Gemini", Gru: "Grus", Her: "Hercules", Hor: "Horologium",
  Hya: "Hydra", Hyi: "Hydrus", Ind: "Indus", Lac: "Lacerta", Leo: "Leo",
  Lep: "Lepus", Lib: "Libra", LMi: "Leo Minor", Lup: "Lupus", Lyn: "Lynx",
  Lyr: "Lyra", Men: "Mensa", Mic: "Microscopium", Mon: "Monoceros", Mus: "Musca",
  Nor: "Norma", Oct: "Octans", Oph: "Ophiuchus", Ori: "Orion", Pav: "Pavo",
  Peg: "Pegasus", Per: "Perseus", Phe: "Phoenix", Pic: "Pictor", PsA: "Piscis Austrinus",
  Psc: "Pisces", Pup: "Puppis", Pyx: "Pyxis", Ret: "Reticulum", Scl: "Sculptor",
  Sco: "Scorpius", Sct: "Scutum", Ser: "Serpens", Sex: "Sextans", Sge: "Sagitta",
  Sgr: "Sagittarius", Tau: "Taurus", Tel: "Telescopium", TrA: "Triangulum Australe",
  Tri: "Triangulum", Tuc: "Tucana", UMa: "Ursa Major", UMi: "Ursa Minor",
  Vel: "Vela", Vir: "Virgo", Vol: "Volans", Vul: "Vulpecula",
};

const GREEK_ABBREV: Record<string, string> = {
  Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η",
  The: "θ", Iot: "ι", Kap: "κ", Lam: "λ", Mu: "μ", Nu: "ν", Xi: "ξ",
  Omi: "ο", Pi: "π", Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ", Phi: "φ",
  Chi: "χ", Psi: "ψ", Ome: "ω",
};

/** Convert HYG `bf` like "9Alp CMa" → { bayer: "α CMa", flamsteed: "9 CMa" }. */
export function expandBayerFlamsteed(
  bf?: string,
): { bayer?: string; flamsteed?: string } {
  if (!bf) return {};
  const trimmed = bf.trim();
  const match = trimmed.match(/^(\d+)?([A-Za-z]+)?\s+([A-Za-z]+)$/);
  if (!match) return {};
  const [, flamNum, greekAbbr, con] = match;
  let bayer: string | undefined;
  if (greekAbbr) {
    const greek = GREEK_ABBREV[greekAbbr] ?? greekAbbr;
    bayer = `${greek} ${con}`;
  }
  const flamsteed = flamNum ? `${flamNum} ${con}` : undefined;
  return { bayer, flamsteed };
}

export function constellationFullName(desig?: string): string | undefined {
  if (!desig) return undefined;
  return CON_NAMES[desig];
}

export function pcToLightYears(pc: number): number {
  return pc * 3.26156;
}

/**
 * Ballesteros-style polynomial: surprisingly accurate for main-sequence stars,
 * good enough for a UI display.
 *   T = 4600 K · ( 1 / (0.92·BV + 1.7)  +  1 / (0.92·BV + 0.62) )
 */
export function bvToTeff(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Short summary text for a star (used in panels and search results). */
export function starBlurb(s: StarRecord): string {
  const parts: string[] = [];
  const { bayer } = expandBayerFlamsteed(s.bf);
  if (bayer) parts.push(bayer);
  else if (s.bf) parts.push(s.bf);
  if (s.con) {
    const full = constellationFullName(s.con);
    parts.push(full ? `in ${full}` : `in ${s.con}`);
  }
  if (s.spect) parts.push(`type ${s.spect}`);
  parts.push(`mag ${s.mag.toFixed(2)}`);
  return parts.join(" • ");
}

export function dsoTypeName(t: string): string {
  switch (t) {
    case "G":
      return "Galaxy";
    case "GPair":
      return "Galaxy pair";
    case "GTrpl":
      return "Galaxy triplet";
    case "GGroup":
      return "Galaxy group";
    case "GCl":
      return "Globular cluster";
    case "OCl":
      return "Open cluster";
    case "PN":
      return "Planetary nebula";
    case "EmN":
      return "Emission nebula";
    case "RfN":
      return "Reflection nebula";
    case "SNR":
      return "Supernova remnant";
    case "HII":
      return "HII region";
    case "Neb":
      return "Nebula";
    default:
      return t;
  }
}

export function dsoBlurb(d: DsoRecord): string {
  const parts: string[] = [];
  if (d.m) parts.push(`Messier ${d.m}`);
  parts.push(dsoTypeName(d.type));
  if (d.con) {
    const full = constellationFullName(d.con);
    parts.push(full ? `in ${full}` : `in ${d.con}`);
  }
  if (Number.isFinite(d.mag) && d.mag < 99) parts.push(`mag ${d.mag.toFixed(2)}`);
  return parts.join(" • ");
}

/** Format RA hours as "HHh MMm SS.Ss". */
export function formatRA(raHours: number): string {
  const norm = ((raHours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const remM = (norm - h) * 60;
  const m = Math.floor(remM);
  const s = (remM - m) * 60;
  return `${pad(h, 2)}h ${pad(m, 2)}m ${s.toFixed(1).padStart(4, "0")}s`;
}

/** Format Dec degrees as "+DD° MM' SS"". */
export function formatDec(decDeg: number): string {
  const sign = decDeg < 0 ? "-" : "+";
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  const remM = (abs - d) * 60;
  const m = Math.floor(remM);
  const s = (remM - m) * 60;
  return `${sign}${pad(d, 2)}° ${pad(m, 2)}' ${s.toFixed(0).padStart(2, "0")}"`;
}

/** Format alt or az degrees as "DD° MM'". */
export function formatDegMin(deg: number): string {
  const sign = deg < 0 ? "-" : "";
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = Math.round((abs - d) * 60);
  return `${sign}${pad(d, 2)}° ${pad(m, 2)}'`;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

/** Format distance in pc / kpc and ly. */
export function formatDistance(distPc: number): string {
  const ly = pcToLightYears(distPc);
  if (distPc < 1) {
    const au = (distPc * 206265).toFixed(0);
    return `${distPc.toFixed(3)} pc (${au} AU)`;
  }
  if (distPc >= 1000) {
    return `${(distPc / 1000).toFixed(2)} kpc (${(ly / 1000).toFixed(2)} kly)`;
  }
  return `${distPc.toFixed(1)} pc (${ly.toFixed(0)} ly)`;
}

/**
 * Build the ordered list of Wikipedia titles to attempt for a selected
 * astronomical object. The list is sent to `/api/wiki?titles=...` which
 * tries each in order and skips disambiguation pages, so the *first valid
 * astronomical article* wins.
 *
 * Examples:
 *   star "Castor"          → ["Castor (star)", "Castor"]
 *   constellation "Cancer" → ["Cancer (constellation)", "Cancer"]
 *   constellation "Leo"    → ["Leo (constellation)", "Leo"]
 *   planet "Mercury"       → ["Mercury (planet)", "Mercury"]
 *   DSO record M31         → ["Messier 31", "Andromeda Galaxy", "NGC 224"]
 */
export function wikiCandidates(
  kind: "star" | "planet" | "dso" | "constellation",
  title: string | undefined,
  record?: StarRecord | DsoRecord | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s?: string | null) => {
    if (!s) return;
    const t = s.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  if (kind === "constellation" && title) {
    push(`${title} (constellation)`);
    push(title);
  } else if (kind === "star") {
    const s = record as StarRecord | undefined;
    if (title) {
      push(`${title} (star)`);
      push(title);
    }
    if (s) {
      const { bayer } = expandBayerFlamsteed(s.bf);
      if (bayer && s.con) {
        const conFull = constellationFullName(s.con);
        if (conFull) push(`${bayer.split(" ")[0]} ${conFull}`);
      }
      if (s.hr) push(`HR ${s.hr}`);
      if (s.hd) push(`HD ${s.hd}`);
      if (s.hip) push(`HIP ${s.hip}`);
      if (s.gl) push(s.gl);
    }
  } else if (kind === "planet" && title) {
    push(`${title} (planet)`);
    push(title);
  } else if (kind === "dso") {
    const d = record as DsoRecord | undefined;
    if (d?.m) push(`Messier ${d.m}`);
    if (d?.commonNames) for (const n of d.commonNames) push(n);
    if (d?.name && d.name !== d.id) push(d.name);
    if (d?.ngc) push(`NGC ${d.ngc}`);
    if (d?.ic) push(`IC ${d.ic}`);
    if (title) push(title);
  } else if (title) {
    push(title);
  }

  return out;
}

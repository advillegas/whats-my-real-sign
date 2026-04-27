/**
 * Builds compact JSON catalogs in public/data/ from public astronomical data sources.
 *
 * Sources:
 *  - HYG Database v3 (CC-BY-SA) — stars: position, magnitude, B-V color, names.
 *  - d3-celestial (MIT) — IAU constellation lines, boundaries, names/centers.
 *  - OpenNGC (CC-BY-SA-4.0) — Messier + bright NGC/IC deep-sky objects.
 *
 * Run with: npm run build:catalogs
 *
 * Output:
 *  public/data/stars-mag6.json     (~ naked-eye stars, mag <= 6.5)
 *  public/data/stars-mag9.json     (extended LOD, mag <= 8.5)
 *  public/data/constellation-lines.json
 *  public/data/constellation-boundaries.json
 *  public/data/constellation-meta.json
 *  public/data/dso.json             (Messier + brightest NGC/IC, mag <= 10)
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "public", "data");

const URLS = {
  hyg: "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v41/hygdata_v41.csv",
  hygFallback:
    "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv",
  hygV3:
    "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hygdata_v3.csv",
  conLines:
    "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json",
  conBounds:
    "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.bounds.json",
  conMeta:
    "https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.json",
  ngc: "https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv",
  ngcAdd:
    "https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/addendum.csv",
};

async function fetchText(url: string, label: string): Promise<string> {
  process.stdout.write(`  fetching ${label}...`);
  const res = await fetch(url);
  if (!res.ok) {
    process.stdout.write(` HTTP ${res.status}\n`);
    throw new Error(`Failed ${label}: ${res.status}`);
  }
  const text = await res.text();
  process.stdout.write(` ${(text.length / 1024).toFixed(0)} KB\n`);
  return text;
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  return JSON.parse(await fetchText(url, label)) as T;
}

async function fetchHyg(): Promise<string> {
  for (const url of [URLS.hyg, URLS.hygFallback, URLS.hygV3]) {
    try {
      return await fetchText(url, `HYG (${url})`);
    } catch {
      // try next
    }
  }
  throw new Error("All HYG mirrors failed");
}

/* Minimal CSV parser supporting quoted values and embedded commas. */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/);
  const headers = parseRow(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    rows.push(parseRow(lines[i]));
  }
  return { headers, rows };
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

interface StarRecord {
  /** id (HYG hip / HD when available, else hyg id) */
  id: string;
  /** Right Ascension in hours (J2000) */
  ra: number;
  /** Declination in degrees (J2000) */
  dec: number;
  /** Visual magnitude */
  mag: number;
  /** B-V color index (NaN if unknown) */
  bv: number;
  /** Proper name (e.g. "Sirius") if available */
  name?: string;
  /** Bayer/Flamsteed designation (e.g. "Alp Cen") */
  bf?: string;
  /** Constellation IAU 3-letter code (e.g. "Ori") */
  con?: string;
}

function buildStars(csv: string, magLimit: number): StarRecord[] {
  const { headers, rows } = parseCsv(csv);
  const idx = (h: string) => headers.indexOf(h);
  const iId = idx("id");
  const iHip = idx("hip");
  const iHd = idx("hd");
  const iProper = idx("proper");
  const iBf = idx("bf");
  const iCon = idx("con");
  const iRa = idx("ra");
  const iDec = idx("dec");
  const iMag = idx("mag");
  const iCi = idx("ci");

  const out: StarRecord[] = [];
  for (const r of rows) {
    const mag = parseFloat(r[iMag]);
    if (!Number.isFinite(mag) || mag > magLimit) continue;
    const ra = parseFloat(r[iRa]);
    const dec = parseFloat(r[iDec]);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    const ci = parseFloat(r[iCi]);
    const proper = r[iProper]?.trim();
    const bf = r[iBf]?.trim();
    const con = r[iCon]?.trim();
    const hip = r[iHip]?.trim();
    const hd = r[iHd]?.trim();
    const id = hip ? `HIP${hip}` : hd ? `HD${hd}` : `HYG${r[iId]}`;
    const star: StarRecord = {
      id,
      ra: round(ra, 5),
      dec: round(dec, 5),
      mag: round(mag, 2),
      bv: Number.isFinite(ci) ? round(ci, 2) : 0,
    };
    if (proper) star.name = proper;
    if (bf) star.bf = bf;
    if (con) star.con = con;
    out.push(star);
  }
  out.sort((a, b) => a.mag - b.mag);
  return out;
}

function round(n: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

interface DsoRecord {
  id: string;
  ra: number;
  dec: number;
  mag: number;
  /** type code from OpenNGC, e.g. G, OCl, GCl, PN, Neb, RfN, EmN, SNR, ** */
  type: string;
  /** size in arcmin (major axis) */
  size?: number;
  name?: string;
  /** Messier number if applicable */
  m?: number;
  con?: string;
}

function parseRaHms(s: string): number {
  const parts = s.split(":").map(Number);
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return NaN;
  const [h, m, sec] = parts;
  return h + m / 60 + sec / 3600;
}

function parseDecDms(s: string): number {
  const sign = s.trim().startsWith("-") ? -1 : 1;
  const clean = s.replace(/^[-+]/, "");
  const parts = clean.split(":").map(Number);
  if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) return NaN;
  const [d, m, sec] = parts;
  return sign * (d + m / 60 + sec / 3600);
}

function buildDso(ngcText: string, addendumText: string): DsoRecord[] {
  const out: DsoRecord[] = [];
  for (const csv of [ngcText, addendumText]) {
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    const headers = lines[0].split(";");
    const idx = (h: string) => headers.indexOf(h);
    const iName = idx("Name");
    const iType = idx("Type");
    const iRa = idx("RA");
    const iDec = idx("Dec");
    const iVmag = idx("V-Mag");
    const iBmag = idx("B-Mag");
    const iMaj = idx("MajAx");
    const iCommon = idx("Common names");
    const iMessier = idx("M");
    const iCon = idx("Const");
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(";");
      const type = cells[iType]?.trim();
      if (!type || type === "Dup" || type === "NonEx" || type === "*") continue;
      const ra = parseRaHms(cells[iRa] || "");
      const dec = parseDecDms(cells[iDec] || "");
      if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
      const vmag = parseFloat(cells[iVmag] || "");
      const bmag = parseFloat(cells[iBmag] || "");
      const mag = Number.isFinite(vmag) ? vmag : Number.isFinite(bmag) ? bmag : 99;
      const messierStr = cells[iMessier]?.trim();
      const isMessier = messierStr && messierStr !== "" && messierStr !== "0";
      // keep all messier, otherwise mag <= 10
      if (!isMessier && mag > 10) continue;
      const dso: DsoRecord = {
        id: cells[iName]?.trim() || `DSO${i}`,
        ra: round(ra, 5),
        dec: round(dec, 5),
        mag: round(Number.isFinite(mag) ? mag : 99, 2),
        type,
      };
      const maj = parseFloat(cells[iMaj] || "");
      if (Number.isFinite(maj)) dso.size = round(maj, 2);
      const common = cells[iCommon]?.trim();
      if (common) dso.name = common.split(",")[0].trim();
      if (isMessier) dso.m = parseInt(messierStr!, 10);
      const con = cells[iCon]?.trim();
      if (con) dso.con = con;
      out.push(dso);
    }
  }
  out.sort((a, b) => a.mag - b.mag);
  return out;
}

async function writeJson(file: string, data: unknown) {
  const p = path.join(OUT_DIR, file);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(p, JSON.stringify(data));
  const stat = await fs.stat(p);
  console.log(
    `  wrote ${file}: ${(stat.size / 1024).toFixed(0)} KB`,
  );
}

async function main() {
  console.log("Building catalogs into", OUT_DIR);

  console.log("[1/4] Stars (HYG)");
  const hygCsv = await fetchHyg();
  const stars6 = buildStars(hygCsv, 6.5);
  const stars9 = buildStars(hygCsv, 8.5);
  console.log(`  stars mag<=6.5: ${stars6.length}`);
  console.log(`  stars mag<=8.5: ${stars9.length}`);
  await writeJson("stars-mag6.json", stars6);
  await writeJson("stars-mag9.json", stars9);

  console.log("[2/4] Constellations (d3-celestial)");
  const lines = await fetchJson<unknown>(URLS.conLines, "constellation lines");
  const bounds = await fetchJson<unknown>(URLS.conBounds, "constellation bounds");
  const meta = await fetchJson<unknown>(URLS.conMeta, "constellation meta");
  await writeJson("constellation-lines.json", lines);
  await writeJson("constellation-boundaries.json", bounds);
  await writeJson("constellation-meta.json", meta);

  console.log("[3/4] Deep-sky objects (OpenNGC)");
  const ngcCsv = await fetchText(URLS.ngc, "NGC.csv");
  let addendumCsv = "";
  try {
    addendumCsv = await fetchText(URLS.ngcAdd, "addendum.csv");
  } catch {
    /* optional */
  }
  const dso = buildDso(ngcCsv, addendumCsv);
  console.log(`  DSOs kept: ${dso.length}`);
  await writeJson("dso.json", dso);

  console.log("[4/4] Done.");
}

main().catch((err) => {
  console.error("Catalog build failed:", err);
  process.exit(1);
});

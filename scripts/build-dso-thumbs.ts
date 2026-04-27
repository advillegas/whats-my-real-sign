/**
 * Build `public/data/dso-thumbs.json` — a mapping of Messier numbers and bright
 * NGC IDs to a Wikimedia Commons thumbnail URL (typically a DSS or Hubble image).
 *
 * For each target object we ask the Wikipedia REST API for the page summary;
 * the `thumbnail.source` field comes back as a square-ish ~320 px image which
 * is perfect for the info panel.
 *
 * We're conservative with the mapping keys: `M1`...`M110`, the OpenNGC id
 * (e.g. `NGC0224`), and `NGC 224`. The info panel tries them in turn.
 *
 * Run with: npm run build:dso-thumbs
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "data", "dso-thumbs.json");
const DSO_PATH = path.join(process.cwd(), "public", "data", "dso.json");

interface DsoRecord {
  id: string;
  name?: string;
  m?: number;
  mag: number;
}

interface WikiSummary {
  thumbnail?: { source: string };
  originalimage?: { source: string };
  type?: string;
}

async function fetchSummary(title: string): Promise<WikiSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "whats-my-real-sign-build/1.0",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as WikiSummary;
    if (json.type === "disambiguation") return null;
    return json;
  } catch {
    return null;
  }
}

async function main() {
  const text = await fs.readFile(DSO_PATH, "utf8");
  const records: DsoRecord[] = JSON.parse(text);

  const out: Record<string, string> = {};
  const seen = new Set<string>();

  // 1. All 110 Messier objects by Messier number.
  for (let m = 1; m <= 110; m++) {
    const rec = records.find((r) => r.m === m);
    if (!rec) continue;
    const tries: string[] = [
      `Messier ${m}`,
      rec.name ?? "",
      rec.id,
    ].filter(Boolean);
    let chosen: string | null = null;
    for (const title of tries) {
      if (seen.has(title)) continue;
      seen.add(title);
      const sum = await fetchSummary(title);
      if (sum?.thumbnail?.source) {
        chosen = sum.thumbnail.source;
        break;
      }
    }
    if (chosen) {
      out[`M${m}`] = chosen;
      out[rec.id] = chosen;
      console.log(`  M${m} (${rec.name ?? rec.id}) → ${chosen}`);
    } else {
      console.log(`  M${m} (${rec.name ?? rec.id}) → none`);
    }
    await sleep(60);
  }

  // 2. Top 50 brightest non-Messier NGC objects.
  const ngcs = records
    .filter((r) => !r.m && /^NGC/.test(r.id) && r.mag < 99)
    .sort((a, b) => a.mag - b.mag)
    .slice(0, 50);
  for (const rec of ngcs) {
    const cleanId = rec.id.replace(/^NGC0*/, "NGC ");
    const tries: string[] = [
      cleanId,
      rec.name ?? "",
      rec.id,
    ].filter(Boolean);
    let chosen: string | null = null;
    for (const title of tries) {
      if (seen.has(title)) continue;
      seen.add(title);
      const sum = await fetchSummary(title);
      if (sum?.thumbnail?.source) {
        chosen = sum.thumbnail.source;
        break;
      }
    }
    if (chosen) {
      out[cleanId] = chosen;
      out[rec.id] = chosen;
      console.log(`  ${cleanId} (${rec.name ?? rec.id}) → ${chosen}`);
    }
    await sleep(60);
  }

  await fs.writeFile(OUT, JSON.stringify(out, null, 2));
  const stat = await fs.stat(OUT);
  console.log(
    `Wrote ${OUT}: ${(stat.size / 1024).toFixed(0)} KB, ${Object.keys(out).length} entries`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

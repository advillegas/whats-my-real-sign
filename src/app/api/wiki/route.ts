/**
 * Wikipedia summary proxy with disambiguation-aware fallback chain.
 *
 * Accepts either:
 *   ?title=Cancer                       → single title
 *   ?titles=Cancer (constellation)|Cancer  → pipe-separated fallback list,
 *                                            tried in order until one lands
 *                                            on a real (non-disambig) article.
 *
 * Uses the MediaWiki action API (`prop=extracts|pageimages|info|pageprops`)
 * so we get the *full lead section* (multiple paragraphs) rather than the
 * 2-sentence REST `summary` extract. Disambiguation pages (e.g. raw "Cancer",
 * "Leo") are detected via `pageprops.disambiguation` and skipped.
 */

import { NextRequest, NextResponse } from "next/server";

interface WikiSummary {
  title?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page?: string } };
}

interface CacheEntry {
  data: WikiSummary | null;
  expires: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 12 * 60 * 60 * 1000;
const NEG_TTL_MS = 5 * 60 * 1000;

interface ActionPage {
  title?: string;
  missing?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  fullurl?: string;
  pageprops?: { disambiguation?: string };
}

async function fetchOne(title: string): Promise<WikiSummary | null> {
  const url =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query&format=json&redirects=1&origin=*" +
    "&prop=extracts|pageimages|info|pageprops" +
    "&exintro=1&explaintext=1" +
    "&piprop=thumbnail&pithumbsize=480" +
    "&inprop=url" +
    `&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "whats-my-real-sign/0.2 (https://github.com/advillegas/whats-my-real-sign)",
    },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { query?: { pages?: Record<string, ActionPage> } };
  const pages = data?.query?.pages;
  if (!pages) return null;
  const first = Object.values(pages)[0];
  if (!first || first.missing !== undefined) return null;
  if (first.pageprops && "disambiguation" in first.pageprops) return null;
  if (!first.extract || first.extract.trim().length < 20) return null;
  return {
    title: first.title,
    extract: first.extract.trim(),
    thumbnail: first.thumbnail
      ? {
          source: first.thumbnail.source,
          width: first.thumbnail.width,
          height: first.thumbnail.height,
        }
      : undefined,
    content_urls: first.fullurl ? { desktop: { page: first.fullurl } } : undefined,
  };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const titlesParam = params.get("titles") ?? params.get("title");
  if (!titlesParam) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const titles = titlesParam
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (titles.length === 0) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const key = titles.join("||").toLowerCase();
  const now = Date.now();
  const cached = CACHE.get(key);
  if (cached && cached.expires > now) {
    if (cached.data === null) {
      return NextResponse.json({ error: "no match" }, { status: 404 });
    }
    return NextResponse.json(cached.data, { headers: { "x-cache": "HIT" } });
  }

  for (const t of titles) {
    try {
      const d = await fetchOne(t);
      if (d) {
        CACHE.set(key, { data: d, expires: now + TTL_MS });
        return NextResponse.json(d, {
          headers: {
            "x-cache": "MISS",
            "x-wiki-resolved": d.title ?? t,
            "cache-control": "public, max-age=43200",
          },
        });
      }
    } catch {
      // try next candidate
    }
  }

  CACHE.set(key, { data: null, expires: now + NEG_TTL_MS });
  return NextResponse.json({ error: "no match" }, { status: 404 });
}

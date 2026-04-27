/**
 * Proxies Wikipedia REST `summary` endpoint for any object title. Wikipedia
 * itself is CORS-friendly, but proxying lets us add an in-memory cache and a
 * sane fallback for missing pages.
 */

import { NextRequest, NextResponse } from "next/server";

interface CacheEntry {
  data: unknown;
  expires: number;
}

const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title");
  if (!title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const key = title.toLowerCase();
  const cached = CACHE.get(key);
  const now = Date.now();
  if (cached && cached.expires > now) {
    return NextResponse.json(cached.data, {
      headers: { "x-cache": "HIT" },
    });
  }
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "whats-my-real-sign/0.1 (https://github.com/advillegas/whats-my-real-sign)",
      },
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `wiki ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    CACHE.set(key, { data, expires: now + TTL_MS });
    return NextResponse.json(data, {
      headers: { "x-cache": "MISS", "cache-control": "public, max-age=43200" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

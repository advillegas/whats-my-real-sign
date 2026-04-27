/**
 * Proxies NASA APOD (Astronomy Picture of the Day). API key is optional —
 * the public DEMO_KEY rate-limits to ~30/hour/IP which is fine for casual use.
 * Set NASA_API_KEY in the Vercel env to lift the limit.
 */

import { NextResponse } from "next/server";

interface CacheEntry {
  data: unknown;
  expires: number;
}

let cache: CacheEntry | null = null;

export async function GET() {
  const now = Date.now();
  if (cache && cache.expires > now) {
    return NextResponse.json(cache.data, { headers: { "x-cache": "HIT" } });
  }
  const key = process.env.NASA_API_KEY ?? "DEMO_KEY";
  try {
    const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${key}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `apod ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    cache = { data, expires: now + 60 * 60 * 1000 };
    return NextResponse.json(data, {
      headers: { "x-cache": "MISS", "cache-control": "public, max-age=3600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}

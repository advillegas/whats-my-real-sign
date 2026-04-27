# What's My Real Sign?

A scientifically accurate, fully interactive **3D starmap** that reveals the
constellation the Sun is *actually* in for any date you pick. Western astrology
is locked to a tropical zodiac that drifted out of sync with the sky ~2,000
years ago — this site shows you the real one, computed from JPL-grade
ephemerides and IAU constellation boundaries.

> Open the site → the camera is already pointing at the Sun and tells you
> *“The Sun is currently in **Pisces**.”* Pick a date and watch the sky
> tween into place. Drag to look around, scroll to zoom, click anything for
> a description, or hit `⌘K` / `Ctrl K` to search the entire sky.

![Hero screenshot placeholder](./public/screenshot-hero.png)

## Features

- **Live sidereal sign reveal** — geocentric apparent solar coordinates fed
  through a wrap-aware point-in-polygon test against IAU constellation
  boundaries. Includes the often-missed 13th zodiac constellation, **Ophiuchus**.
- **Date scrubber** with a 1.5-second eased camera tween + Julian-Date
  interpolation so the planets glide along the sphere with real ephemeris
  values, not visual fakes.
- **First-person camera rig** — drag to look, scroll to zoom (FOV 12°–95°),
  with programmatic fly-to for selections and search results.
- **Photometric stars** — HYG v3 (~10k naked-eye stars) rendered as a single
  `THREE.Points` mesh, B–V color index → temperature LUT, magnitude → on-screen
  radius via a custom GLSL shader with soft-disk falloff.
- **Procedural Milky Way** — inverted-sphere shader that paints the galactic
  plane and bulge from a noise field, no 8K texture required.
- **Constellation lines, IAU boundaries, and billboarded labels** — clickable
  labels fly the camera and open the info panel.
- **Solar-system bodies** — Sun + 7 planets + Moon, all positioned with
  [`astronomy-engine`](https://github.com/cosinekitty/astronomy) at sub-arcminute
  accuracy.
- **Deep-sky objects** — Messier + bright NGC/IC, type-coded ring markers,
  with custom shader.
- **Click-to-select** raycaster against the points cloud for stars/DSOs and
  R3F event handlers for solar-system meshes. Opens an info panel that fetches
  a Wikipedia summary via a server-cached API route.
- **Search palette (`⌘K`)** — fuzzy search powered by Fuse.js across stars
  (proper + Bayer), Messier, NGC, planets, and constellations. Reuses the
  fly-to camera path.
- **NASA APOD card** — today's Astronomy Picture of the Day from
  `api.nasa.gov`, proxied through `/api/apod` with hourly cache.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 App Router + TypeScript |
| 3D | React Three Fiber + drei + three.js |
| Astronomy | [`astronomy-engine`](https://github.com/cosinekitty/astronomy) (MIT) |
| State | Zustand |
| UI | Tailwind v4 + framer-motion |
| Search | Fuse.js |
| Hosting | Vercel |

## Data sources

All catalogs are static JSON, generated once at build time from open data and
shipped from `public/data/`:

- **[HYG Database v3](https://github.com/astronexus/HYG-Database)** — 119k
  stars (`stars-mag6.json` is the magnitude ≤ 6.5 LOD).
- **[d3-celestial](https://github.com/ofrohn/d3-celestial)** — IAU
  constellation lines, boundaries, names, and label centers.
- **[OpenNGC](https://github.com/mattiaverga/OpenNGC)** — Messier + NGC/IC
  deep-sky objects.

## Local development

```bash
npm install
# (Optional) re-fetch raw catalogs into public/data:
npm run build:catalogs
npm run dev
```

Open <http://localhost:3000>.

## Vercel deployment

1. Import the repo in Vercel.
2. (Optional) add `NASA_API_KEY` from <https://api.nasa.gov> to lift APOD's
   demo-key rate limit. Without it the site still works using `DEMO_KEY`.
3. Push to `main` — Vercel builds with `npm run build` automatically.

## Architecture notes

- **Coordinate convention** — all RA/Dec values are J2000 equatorial; we use a
  three.js-friendly basis where `+X = (RA 0h, Dec 0°)`, `+Y = NCP`,
  `+Z = (RA 6h, Dec 0°)`. Stars sit on a celestial sphere of radius 1000;
  the camera lives at the origin.
- **Sun → constellation lookup** — `astronomy-engine` gives us the geocentric
  apparent RA/Dec, which we drop into a wrap-aware ray-casting
  point-in-polygon test against d3-celestial's IAU boundary GeoJSON. The
  trickiest piece is RA wrapping at 0h/24h: longitude vertices are projected
  into ±180° of the test point before the standard PIP test runs.
- **Date tween** — `DateScrubber` interpolates `Date.getTime()` over 1.5s
  using `easeInOutCubic` and pushes it through the store, while `CameraRig`
  slerps yaw/pitch and FOV to the new Sun direction in parallel.
- **Picker** — a single Raycaster pass against every `Points` mesh in the
  scene, with `params.Points.threshold` tuned for forgiving clicks. We then
  do a nearest-neighbor sweep against the in-memory star and DSO catalogs to
  resolve the actual record (the points cloud only stores positions).
- **Server-side cache** — `/api/wiki` and `/api/apod` use a tiny in-memory
  Map and `next: { revalidate: ... }` so popular pages are served instantly
  on Vercel's edge after the first hit.

## Roadmap

- [ ] Eyepiece preview + telescope FOV overlay
- [ ] Light-pollution overlay (Bortle scale → magnitude limit slider)
- [ ] Mobile gyroscope view via `DeviceOrientationEvent`
- [ ] Saved birth charts + sharable links

## License

The codebase is MIT. Catalog data is redistributed under the licenses of the
upstream sources (HYG: CC-BY-SA, OpenNGC: CC-BY-SA, d3-celestial: BSD).

Built with ☉ by [@advillegas](https://github.com/advillegas).

"use client";

/**
 * Observer-location chooser. When set, the viewer becomes "topocentric": the
 * coordinate HUD shows alt/az + LMST, the horizon disk renders, and the
 * fragment shaders dim stars / DSOs below the horizon.
 *
 * Three ways to set a location:
 *   1. Geolocation API (asks the user's browser).
 *   2. Manual lat / lon / elevation entry.
 *   3. Preset observatory or major city.
 *
 * "Geocentric (no observer)" resets back to all-sky J2000 view with no horizon.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useViewer, type ObserverLocation } from "@/store/viewer-store";

interface Preset {
  name: string;
  lat: number;
  lon: number;
  elevationM: number;
}

const PRESETS: Preset[] = [
  { name: "Greenwich, UK", lat: 51.4769, lon: -0.0005, elevationM: 47 },
  { name: "Mauna Kea, USA", lat: 19.8207, lon: -155.4681, elevationM: 4205 },
  { name: "Cerro Paranal, Chile", lat: -24.6275, lon: -70.4044, elevationM: 2635 },
  { name: "La Palma, Spain", lat: 28.7541, lon: -17.8909, elevationM: 2396 },
  { name: "McDonald Observatory, USA", lat: 30.6717, lon: -104.0224, elevationM: 2070 },
  { name: "Lowell Observatory, USA", lat: 35.2027, lon: -111.6647, elevationM: 2210 },
  { name: "South African Astronomical Obs.", lat: -32.3795, lon: 20.8107, elevationM: 1798 },
  { name: "Siding Spring, Australia", lat: -31.2733, lon: 149.0644, elevationM: 1165 },
  { name: "New York, USA", lat: 40.7128, lon: -74.006, elevationM: 10 },
  { name: "London, UK", lat: 51.5074, lon: -0.1278, elevationM: 11 },
  { name: "Tokyo, Japan", lat: 35.6762, lon: 139.6503, elevationM: 40 },
  { name: "Sydney, Australia", lat: -33.8688, lon: 151.2093, elevationM: 58 },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LocationModal({ open, onClose }: Props) {
  const observer = useViewer((s) => s.observer);
  const setObserver = useViewer((s) => s.setObserver);

  const [lat, setLat] = useState(observer?.lat.toString() ?? "");
  const [lon, setLon] = useState(observer?.lon.toString() ?? "");
  const [elev, setElev] = useState(observer?.elevationM.toString() ?? "0");
  const [name, setName] = useState(observer?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useGeolocation = () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation isn't available in this browser.");
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const next: ObserverLocation = {
          lat: round(pos.coords.latitude, 4),
          lon: round(pos.coords.longitude, 4),
          elevationM: pos.coords.altitude ? Math.round(pos.coords.altitude) : 0,
          name: "Your location",
        };
        setObserver(next);
        setLat(next.lat.toString());
        setLon(next.lon.toString());
        setElev(next.elevationM.toString());
        setName(next.name ?? "");
        onClose();
      },
      (err) => {
        setBusy(false);
        setError(err.message);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const applyManual = () => {
    const la = parseFloat(lat);
    const lo = parseFloat(lon);
    const el = parseFloat(elev);
    if (!Number.isFinite(la) || la < -90 || la > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }
    setError(null);
    setObserver({
      lat: la,
      lon: lo,
      elevationM: Number.isFinite(el) ? el : 0,
      name: name.trim() || `${la.toFixed(2)}°, ${lo.toFixed(2)}°`,
    });
    onClose();
  };

  const applyPreset = (p: Preset) => {
    setObserver({ ...p });
    setLat(p.lat.toString());
    setLon(p.lon.toString());
    setElev(p.elevationM.toString());
    setName(p.name);
    onClose();
  };

  const reset = () => {
    setObserver(null);
    setLat("");
    setLon("");
    setElev("0");
    setName("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-3 safe-top safe-bottom safe-left safe-right"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="glass rounded-2xl w-full sm:w-[28rem] max-h-[88vh] overflow-y-auto scrollbar-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-white/10">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70">
                  Observer location
                </div>
                <div className="text-white text-lg font-semibold mt-0.5">
                  Set viewing location
                </div>
                <div className="text-[11px] text-white/55 mt-1">
                  Topocentric mode shows the local horizon, alt/az coordinates
                  and dims below-horizon objects.
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white/50 hover:text-white text-2xl leading-none w-8 h-8 grid place-items-center rounded hover:bg-white/10"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <button
                onClick={useGeolocation}
                disabled={busy}
                className="w-full px-4 py-2.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 active:bg-blue-500/40 text-white text-sm font-medium border border-blue-300/20 transition disabled:opacity-50"
              >
                {busy ? "Locating..." : "Use my location"}
              </button>

              <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70">
                Manual entry
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/55">Latitude (°N)</span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="bg-white/5 rounded px-2 py-1.5 text-sm text-white outline-none focus:bg-white/10 border border-white/10"
                    placeholder="40.7128"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/55">Longitude (°E)</span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    className="bg-white/5 rounded px-2 py-1.5 text-sm text-white outline-none focus:bg-white/10 border border-white/10"
                    placeholder="-74.006"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/55">Elevation (m)</span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={elev}
                    onChange={(e) => setElev(e.target.value)}
                    className="bg-white/5 rounded px-2 py-1.5 text-sm text-white outline-none focus:bg-white/10 border border-white/10"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/55">Name (optional)</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-white/5 rounded px-2 py-1.5 text-sm text-white outline-none focus:bg-white/10 border border-white/10"
                    placeholder="My observatory"
                  />
                </label>
              </div>
              {error && <div className="text-[11px] text-red-300">{error}</div>}
              <button
                onClick={applyManual}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm self-start"
              >
                Apply
              </button>

              <div className="text-[10px] uppercase tracking-[0.24em] text-blue-200/70 mt-2">
                Presets
              </div>
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto scrollbar-none">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => applyPreset(p)}
                    className="text-left px-2 py-1.5 rounded hover:bg-white/5 active:bg-white/10 text-sm text-white/85 flex items-center justify-between"
                  >
                    <span>{p.name}</span>
                    <span className="text-[10px] text-white/45 font-mono">
                      {p.lat.toFixed(2)}°, {p.lon.toFixed(2)}°
                    </span>
                  </button>
                ))}
              </div>

              <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                <button
                  onClick={reset}
                  className="text-[12px] text-white/55 hover:text-white"
                >
                  Geocentric (no observer)
                </button>
                {observer && (
                  <span className="text-[10px] text-white/45 font-mono">
                    Current: {observer.name ?? "manual"}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function round(n: number, d: number): number {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

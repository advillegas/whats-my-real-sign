"use client";

/**
 * Live read-out of where the camera is pointing on the celestial sphere:
 *
 *   α  HHh MMm SS.Ss        (J2000 right ascension at view centre)
 *   δ ±DD° MM' SS"          (J2000 declination at view centre)
 *   FOV  NN.N°
 *   GAST HHhMMm   (Greenwich apparent sidereal time)
 *   LMST HHhMMm   (when an observer location is set)
 *   Alt/Az       (when an observer location is set)
 *
 * The HUD also handles the per-frame camera readout that the URL-state
 * syncer subscribes to.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { useViewer } from "@/store/viewer-store";
import {
  formatRA,
  formatDec,
  formatDegMin,
} from "@/lib/object-info";
import { gastHours, lmstHours, raDecToAltAz } from "@/lib/astronomy";
import { vec3ToRaDecHours } from "@/lib/coordinates";

interface Readout {
  ra: number;
  dec: number;
  fov: number;
  gast: number;
  lmst?: number;
  alt?: number;
  az?: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatSidereal(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  const hh = Math.floor(norm);
  const mm = Math.floor((norm - hh) * 60);
  return `${pad2(hh)}h ${pad2(mm)}m`;
}

/**
 * Renders inside the R3F Canvas: every frame it computes the camera view
 * direction in J2000 RA/Dec and writes it to the store. The DOM sibling
 * `CoordinateHUDOverlay` reads from the store.
 */
export function CoordinateHUDFeeder() {
  const { camera } = useThree();
  const setCameraReadout = useViewer((s) => s.setCameraReadout);
  const tmp = new Vector3();
  const lastWriteRef = useRef<number>(0);

  useFrame(() => {
    // Throttle to ~30 Hz so the URL-state syncer + HUD don't beat the store.
    const now = performance.now();
    if (now - lastWriteRef.current < 33) return;
    lastWriteRef.current = now;
    camera.getWorldDirection(tmp);
    const { raHours, decDeg } = vec3ToRaDecHours(tmp);
    const cam = camera as { fov?: number };
    setCameraReadout({
      raHours,
      decDeg,
      fovDeg: cam.fov ?? 55,
    });
  });

  return null;
}

/** DOM overlay. Lives outside the Canvas. */
export function CoordinateHUD() {
  const cameraReadout = useViewer((s) => s.cameraReadout);
  const date = useViewer((s) => s.date);
  const observer = useViewer((s) => s.observer);
  const [tipOpen, setTipOpen] = useState(false);

  const [readout, setReadout] = useState<Readout | null>(null);
  useEffect(() => {
    const gast = gastHours(date);
    const r: Readout = {
      ra: cameraReadout.raHours,
      dec: cameraReadout.decDeg,
      fov: cameraReadout.fovDeg,
      gast,
    };
    if (observer) {
      r.lmst = lmstHours(date, observer.lon);
      const alt = raDecToAltAz(
        cameraReadout.raHours,
        cameraReadout.decDeg,
        observer.lat,
        observer.lon,
        date,
      );
      r.alt = alt.alt;
      r.az = alt.az;
    }
    setReadout(r);
  }, [cameraReadout, date, observer]);

  if (!readout) return null;

  return (
    <div
      className="glass fixed left-1/2 -translate-x-1/2 bottom-2 sm:bottom-auto sm:top-3 sm:translate-x-0 sm:left-1/2 sm:-translate-x-1/2 px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-mono text-white/85 z-10 pointer-events-auto flex items-center gap-3 sm:gap-4 max-w-[96vw] overflow-x-auto scrollbar-none safe-bottom"
      style={{ whiteSpace: "nowrap" }}
    >
      <span className="text-blue-200/70">α</span>
      <span>{formatRA(readout.ra)}</span>
      <span className="text-blue-200/70">δ</span>
      <span>{formatDec(readout.dec)}</span>
      <span className="text-white/30 hidden sm:inline">·</span>
      <span className="text-blue-200/70">FOV</span>
      <span>{readout.fov.toFixed(1)}°</span>
      <span className="text-white/30 hidden sm:inline">·</span>
      <span className="text-blue-200/70 hidden sm:inline">GAST</span>
      <span className="hidden sm:inline">{formatSidereal(readout.gast)}</span>
      {observer && readout.lmst !== undefined && (
        <>
          <span className="text-white/30 hidden md:inline">·</span>
          <span className="text-blue-200/70 hidden md:inline">LMST</span>
          <span className="hidden md:inline">{formatSidereal(readout.lmst)}</span>
        </>
      )}
      {observer && readout.alt !== undefined && readout.az !== undefined && (
        <>
          <span className="text-white/30 hidden md:inline">·</span>
          <span className="text-blue-200/70 hidden md:inline">alt</span>
          <span className="hidden md:inline">{formatDegMin(readout.alt)}</span>
          <span className="text-blue-200/70 hidden md:inline">az</span>
          <span className="hidden md:inline">{formatDegMin(readout.az)}</span>
        </>
      )}
      <button
        onClick={() => setTipOpen((v) => !v)}
        className="ml-1 text-white/50 hover:text-white text-[9px] border border-white/15 rounded-full w-4 h-4 grid place-items-center"
        aria-label="What is J2000?"
        title="What is J2000?"
      >
        ?
      </button>
      {tipOpen && (
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full glass rounded-lg p-3 text-[10px] text-white/85 max-w-[260px] shadow-xl whitespace-normal pointer-events-auto"
          style={{ minWidth: 220 }}
        >
          Star positions are in the <b>J2000.0</b> mean equator and equinox —
          the celestial reference frame at noon (TT) on 2000 Jan 1. Solar-system
          bodies are computed for the active date and projected onto the same
          frame. Sidereal time is the rotation angle of the Earth relative to
          the equinox; it tells you which RA is currently on the meridian.
        </div>
      )}
    </div>
  );
}

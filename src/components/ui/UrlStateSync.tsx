"use client";

/**
 * Bi-directional sync between the viewer store and the URL.
 *
 *   • On mount, parse window.location and apply any view (date, RA, Dec,
 *     FOV, layers, observer) found there.
 *   • Subscribe to camera readout, layers, observer, date — debounce 350 ms,
 *     then `history.replaceState` the new URL.
 *
 * The component renders nothing.
 */

import { useEffect, useRef } from "react";
import { useViewer } from "@/store/viewer-store";
import { buildUrl, parseUrl } from "@/lib/url-state";

export function UrlStateSync() {
  const setCameraTarget = useViewer((s) => s.setCameraTarget);
  const setDate = useViewer((s) => s.setDate);
  const setObserver = useViewer((s) => s.setObserver);
  const toggleLayer = useViewer((s) => s.toggleLayer);

  const initRan = useRef(false);
  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;
    if (typeof window === "undefined") return;
    const view = parseUrl();
    if (view.observer) setObserver(view.observer);
    if (view.layers) {
      const current = useViewer.getState().layers;
      for (const [k, v] of Object.entries(view.layers)) {
        if (typeof v === "boolean" && current[k as keyof typeof current] !== v) {
          toggleLayer(k as keyof typeof current);
        }
      }
    }
    if (view.date) setDate(view.date);
    if (typeof view.ra === "number" && typeof view.dec === "number") {
      setCameraTarget(view.ra, view.dec, view.fov);
    }
  }, [setCameraTarget, setDate, setObserver, toggleLayer]);

  // Write URL whenever camera readout / layers / observer / date change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const write = () => {
      const s = useViewer.getState();
      const url = buildUrl({
        date: s.date,
        ra: s.cameraReadout.raHours,
        dec: s.cameraReadout.decDeg,
        fov: s.cameraReadout.fovDeg,
        layers: s.layers,
        observer: s.observer,
      });
      try {
        window.history.replaceState(null, "", url);
      } catch {
        /* security errors in some embeds; ignore */
      }
    };
    const sub = useViewer.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, 350);
    });
    return () => {
      sub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}

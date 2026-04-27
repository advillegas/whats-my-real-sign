/**
 * Global UI / viewer state.
 *
 * The actual three.js camera object is owned by R3F; we only store *intent*
 * here (target direction, animation triggers). The CameraRig component reacts
 * to changes and tweens the real camera accordingly.
 */

import { create } from "zustand";

export type LayerToggle =
  | "stars"
  | "lines"
  | "boundaries"
  | "labels"
  | "milkyway"
  | "planets"
  | "dso"
  | "gridEquatorial"
  | "gridEcliptic"
  | "gridGalactic"
  | "poles"
  | "horizon";

export interface SelectedObject {
  id: string;
  name: string;
  ra: number;
  dec: number;
  kind: "star" | "planet" | "dso" | "constellation";
  mag?: number;
  blurb?: string;
  /** Wikipedia article title to fetch a summary for, when applicable. */
  wikiTitle?: string;
  /** Full StarRecord (for stars) or DsoRecord (for DSOs) for the info panel. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record?: any;
}

export interface CameraTarget {
  raHours: number;
  decDeg: number;
  /** Optional: requested angular radius in degrees (zoom). */
  fovDeg?: number;
  /** Token: increment to re-trigger animation even if RA/Dec unchanged. */
  nonce: number;
}

export interface HoverInfo {
  name: string;
  subtitle?: string;
  kind: "star" | "planet" | "dso" | "constellation";
  /** IAU 3-letter desig when this hover is over a constellation. */
  conDesig?: string;
  x: number;
  y: number;
}

export interface ObserverLocation {
  /** Latitude in degrees, north positive. */
  lat: number;
  /** Longitude in degrees, east positive. */
  lon: number;
  /** Elevation in metres above sea level. */
  elevationM: number;
  /** Optional friendly name, e.g. "Greenwich, UK". */
  name?: string;
}

interface ViewerState {
  date: Date;
  requestedDate: Date;
  cameraTarget: CameraTarget;
  selected: SelectedObject | null;
  hover: HoverInfo | null;
  layers: Record<LayerToggle, boolean>;
  isAnimating: boolean;
  fovNudge: { delta: number; nonce: number };
  hasInteracted: boolean;
  tooltipsEnabled: boolean;
  /**
   * Optional surface observer. When non-null the HUD and info panel show
   * alt/az alongside RA/Dec, the horizon disk renders, and below-horizon
   * stars/DSOs are dimmed.
   */
  observer: ObserverLocation | null;
  /**
   * Live readout from the camera, written every frame by CoordinateHUD.
   * Other UI (URL syncer, ObjectInfoPanel) reads from here.
   */
  cameraReadout: {
    raHours: number;
    decDeg: number;
    fovDeg: number;
  };
  /**
   * Phone "AR" sky-pointing mode. While on, the device gyro+compass drives
   * the camera so the on-screen sky tracks where the phone is physically
   * pointed. Only meaningful with an `observer` set (the alt/az → RA/Dec
   * conversion is observer-dependent).
   */
  compassMode: boolean;

  setDate: (d: Date) => void;
  setCurrentJdDate: (d: Date) => void;
  setCameraTarget: (raHours: number, decDeg: number, fovDeg?: number) => void;
  setSelected: (s: SelectedObject | null) => void;
  setHover: (h: HoverInfo | null) => void;
  toggleLayer: (l: LayerToggle) => void;
  setAnimating: (v: boolean) => void;
  nudgeFov: (delta: number) => void;
  markInteracted: () => void;
  toggleTooltips: () => void;
  setObserver: (o: ObserverLocation | null) => void;
  setCameraReadout: (r: { raHours: number; decDeg: number; fovDeg: number }) => void;
  setCompassMode: (on: boolean) => void;
}

const today = new Date();

export const useViewer = create<ViewerState>((set) => ({
  date: today,
  requestedDate: today,
  cameraTarget: { raHours: 0, decDeg: 0, nonce: 0 },
  selected: null,
  hover: null,
  layers: {
    stars: true,
    lines: true,
    boundaries: false,
    labels: true,
    milkyway: true,
    planets: true,
    dso: true,
    gridEquatorial: false,
    gridEcliptic: false,
    gridGalactic: false,
    poles: false,
    horizon: true,
  },
  isAnimating: false,
  fovNudge: { delta: 0, nonce: 0 },
  hasInteracted: false,
  tooltipsEnabled: true,
  observer: null,
  cameraReadout: { raHours: 0, decDeg: 0, fovDeg: 55 },
  compassMode: false,
  setDate: (d) => set({ requestedDate: d, hasInteracted: true }),
  setCurrentJdDate: (d) => set({ date: d }),
  setCameraTarget: (raHours, decDeg, fovDeg) =>
    set((s) => ({
      cameraTarget: {
        raHours,
        decDeg,
        fovDeg,
        nonce: s.cameraTarget.nonce + 1,
      },
    })),
  setSelected: (sel) => set({ selected: sel }),
  setHover: (h) => set({ hover: h }),
  toggleLayer: (l) =>
    set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setAnimating: (v) => set({ isAnimating: v }),
  nudgeFov: (delta) =>
    set((s) => ({ fovNudge: { delta, nonce: s.fovNudge.nonce + 1 } })),
  markInteracted: () => {
    if (!useViewer.getState().hasInteracted) set({ hasInteracted: true });
  },
  toggleTooltips: () =>
    set((s) => {
      const next = !s.tooltipsEnabled;
      return next
        ? { tooltipsEnabled: next }
        : { tooltipsEnabled: next, hover: null, selected: null };
    }),
  setObserver: (o) => set({ observer: o }),
  setCameraReadout: (r) => set({ cameraReadout: r }),
  setCompassMode: (on) => set({ compassMode: on }),
}));

/**
 * Returns the IAU desig (e.g. "Ori") of whichever constellation is currently
 * being highlighted by either selection or hover. Selection wins so the user
 * can hover other things without losing their pinned constellation.
 */
export function selectHighlightedConDesig(s: ViewerState): string | null {
  if (s.selected?.id?.startsWith("CON_")) return s.selected.id.slice(4);
  if (s.hover?.kind === "constellation" && s.hover.conDesig) {
    return s.hover.conDesig;
  }
  return null;
}

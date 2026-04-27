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
  | "dso";

export interface SelectedObject {
  /** Unique id (HIPxxx, NGCxxx, body name, etc.) */
  id: string;
  /** Display name. */
  name: string;
  /** RA hours, J2000. */
  ra: number;
  /** Dec degrees, J2000. */
  dec: number;
  /** Body kind for icon + behavior. */
  kind: "star" | "planet" | "dso" | "constellation";
  /** Magnitude when known. */
  mag?: number;
  /** Pre-canned local description (catalog blurb). */
  blurb?: string;
  /** Wikipedia article title to fetch a summary for, when applicable. */
  wikiTitle?: string;
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
  /** Display name. */
  name: string;
  /** Optional secondary line (constellation, designation, etc.). */
  subtitle?: string;
  /** Body kind for icon styling. */
  kind: "star" | "planet" | "dso" | "constellation";
  /** IAU 3-letter desig when this hover is over a constellation. */
  conDesig?: string;
  /** Screen-space x in CSS pixels. */
  x: number;
  /** Screen-space y in CSS pixels. */
  y: number;
}

interface ViewerState {
  /** Currently displayed Julian Date (as JS Date). */
  date: Date;
  /** Date the user has *requested* (may differ during a tween). */
  requestedDate: Date;
  /** What the camera should be looking at. */
  cameraTarget: CameraTarget;
  /** Currently selected object, if any. */
  selected: SelectedObject | null;
  /** Currently hovered object, if any. */
  hover: HoverInfo | null;
  /** Layer visibility toggles. */
  layers: Record<LayerToggle, boolean>;
  /** Are we currently animating to a new target/date? */
  isAnimating: boolean;
  /** Requested FOV change to be applied by CameraRig (positive = zoom out). */
  fovNudge: { delta: number; nonce: number };

  setDate: (d: Date) => void;
  setCurrentJdDate: (d: Date) => void;
  setCameraTarget: (raHours: number, decDeg: number, fovDeg?: number) => void;
  setSelected: (s: SelectedObject | null) => void;
  setHover: (h: HoverInfo | null) => void;
  toggleLayer: (l: LayerToggle) => void;
  setAnimating: (v: boolean) => void;
  nudgeFov: (delta: number) => void;
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
  },
  isAnimating: false,
  fovNudge: { delta: 0, nonce: 0 },
  setDate: (d) => set({ requestedDate: d }),
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
  setSelected: (s) => set({ selected: s }),
  setHover: (h) => set({ hover: h }),
  toggleLayer: (l) =>
    set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setAnimating: (v) => set({ isAnimating: v }),
  nudgeFov: (delta) =>
    set((s) => ({ fovNudge: { delta, nonce: s.fovNudge.nonce + 1 } })),
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

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

interface ViewerState {
  /** Currently displayed Julian Date (as JS Date). */
  date: Date;
  /** Date the user has *requested* (may differ during a tween). */
  requestedDate: Date;
  /** What the camera should be looking at. */
  cameraTarget: CameraTarget;
  /** Currently selected object, if any. */
  selected: SelectedObject | null;
  /** Layer visibility toggles. */
  layers: Record<LayerToggle, boolean>;
  /** Are we currently animating to a new target/date? */
  isAnimating: boolean;

  setDate: (d: Date) => void;
  setCurrentJdDate: (d: Date) => void;
  setCameraTarget: (raHours: number, decDeg: number, fovDeg?: number) => void;
  setSelected: (s: SelectedObject | null) => void;
  toggleLayer: (l: LayerToggle) => void;
  setAnimating: (v: boolean) => void;
}

const today = new Date();

export const useViewer = create<ViewerState>((set) => ({
  date: today,
  requestedDate: today,
  cameraTarget: { raHours: 0, decDeg: 0, nonce: 0 },
  selected: null,
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
  toggleLayer: (l) =>
    set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setAnimating: (v) => set({ isAnimating: v }),
}));

/**
 * Live shared state for the AR-mode "where is my target?" indicator.
 *
 * Written every frame by `<ARTargetTracker />` (inside the R3F Canvas, where
 * we have access to the projected camera). Read by `<ARTargetIndicator />`
 * (DOM, on a requestAnimationFrame loop). Decoupling the two keeps high-
 * frequency 60 Hz updates out of React's reconciler.
 */

export const arTargetState: {
  /** True only when AR is on AND a target object is selected. */
  active: boolean;
  /** True when the target lies inside the current viewport. */
  onScreen: boolean;
  /** Normalized device coords in [-1, 1]; the indicator clamps for off-screen draws. */
  ndcX: number;
  ndcY: number;
  /** Angular separation between target and screen-center in degrees. */
  separationDeg: number;
  /** Display name of the current target. */
  name: string;
  /** Wall-clock millis of the most recent successful update. */
  lastUpdateMs: number;
} = {
  active: false,
  onScreen: false,
  ndcX: 0,
  ndcY: 0,
  separationDeg: 0,
  name: "",
  lastUpdateMs: 0,
};

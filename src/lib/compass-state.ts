/**
 * Module-level mutable state shared between `CompassDriver` (writer) and
 * `CameraRig` (reader). Kept outside React/zustand so it can be touched
 * every animation frame without re-renders.
 *
 * Both yaw and pitch follow the same convention `CameraRig` uses (yaw is
 * azimuth in three.js world space measured around +Y, pitch is altitude
 * with +π/2 = zenith).
 */
export const compassState: {
  yaw: number;
  pitch: number;
  hasReading: boolean;
  /** Wall-clock millis of the most recent successful update. */
  lastUpdateMs: number;
} = {
  yaw: 0,
  pitch: 0,
  hasReading: false,
  lastUpdateMs: 0,
};

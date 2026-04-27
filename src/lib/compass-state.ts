/**
 * Module-level mutable state shared between `CompassDriver` (writer) and
 * `CameraRig` (reader). Kept outside React/zustand so it can be touched
 * every animation frame without re-renders.
 *
 * Both yaw and pitch follow the same convention `CameraRig` uses (yaw is
 * azimuth in three.js world space measured around +Y, pitch is altitude
 * with +π/2 = zenith).
 */
/**
 * Live device-orientation snapshot shared by `CompassDriver` (writer, on every
 * sensor tick) and `CameraRig` (reader, on every render frame). Stored as raw
 * scalars so we can mutate without allocating, and so React never re-renders
 * on the high-frequency stream.
 *
 * `q*` is the full target camera quaternion in the scene world frame
 * (smoothed by slerp inside `CompassDriver`). Using a quaternion — instead of
 * the old yaw/pitch pair — lets us encode the device's *roll* too, so the
 * synthetic overlay stays glued to the real horizon when the phone tilts
 * sideways and so the local zenith (not the celestial pole) ends up at
 * screen-top.
 */
export const compassState: {
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  hasReading: boolean;
  /** Wall-clock millis of the most recent successful update. */
  lastUpdateMs: number;
} = {
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
  hasReading: false,
  lastUpdateMs: 0,
};

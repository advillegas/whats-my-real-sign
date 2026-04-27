"use client";

/**
 * Rear-camera video feed for AR mode.
 *
 * When `compassMode` is on we ask the browser for the environment-facing
 * camera and paint it as a fixed-position `<video>` behind the WebGL canvas.
 * Combined with the canvas going semi-transparent (`Scene.tsx`), this gives
 * the user a passable "augmented reality" view: real sky behind, synthetic
 * stars / constellation labels in front, both lining up because the
 * compass driver is steering the camera to where the phone is pointed.
 *
 * Permission flow:
 * - First activation triggers the browser's camera prompt. Since the user
 *   already tapped "AR" (a gesture), Safari is happy.
 * - On denial we surface a one-shot toast and silently disable AR mode so
 *   the manual compass-driven view still works without a feed.
 *
 * When AR mode is off we tear down the MediaStream — leaving a webcam
 * indicator on for no reason is a great way to scare users.
 */

import { useEffect, useRef, useState } from "react";
import { useViewer } from "@/store/viewer-store";

export function CameraFeed() {
  const compassMode = useViewer((s) => s.compassMode);
  const setCompassMode = useViewer((s) => s.setCompassMode);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!compassMode) {
      setReady(false);
      setError(null);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access the camera.");
      setCompassMode(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` lets desktops fall back to whatever camera they have.
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        // iOS Safari requires both attributes to play inline without going fullscreen.
        v.setAttribute("playsinline", "true");
        v.muted = true;
        await v.play().catch(() => {
          /* autoplay can throw on iOS until the next gesture; sky still works */
        });
        setReady(true);
      } catch (err) {
        const message =
          err instanceof Error && err.name === "NotAllowedError"
            ? "Camera access denied. Allow camera in Safari Settings to see the real sky."
            : "Couldn't start the camera.";
        setError(message);
        setCompassMode(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      const v = videoRef.current;
      if (v) {
        try {
          v.pause();
        } catch {
          /* noop */
        }
        v.srcObject = null;
      }
    };
  }, [compassMode, setCompassMode]);

  if (!compassMode) return null;

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-hidden
        className={`fixed inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        style={{
          // Both this and the WebGL canvas are `position: fixed` siblings.
          // The canvas comes later in DOM order so it paints on top, which
          // is exactly what we want (alpha-transparent overlay on the feed).
          // No explicit z-index — negative z hides us behind the parent's
          // bg-black; default stacking with DOM order is correct.
          backgroundColor: "black",
        }}
      />
      {error && (
        <div
          role="status"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-[88vw] rounded-lg glass px-3 py-2 text-[11px] leading-snug text-white/85 text-center safe-top"
        >
          {error}
        </div>
      )}
    </>
  );
}

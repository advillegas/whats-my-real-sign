"use client";

/**
 * Top-bar tools: Search palette (re-uses `SearchPalette`), Location modal
 * trigger, and a Copy-link button that snapshots the current view as a URL.
 *
 * Sits in the upper-right of the page; on small screens, becomes a row of
 * compact icon buttons.
 */

import { useState } from "react";
import { useViewer } from "@/store/viewer-store";
import { buildUrl } from "@/lib/url-state";
import { CompassButton } from "./CompassButton";
import { LocationModal } from "./LocationModal";
import { SearchPalette } from "./SearchPalette";

const PinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-7.5 8-13a8 8 0 0 0-16 0c0 5.5 8 13 8 13z" />
    <circle cx="12" cy="9" r="3" />
  </svg>
);

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07L11.17 5.17" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.83-1.83" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M17.94 17.94A10.5 10.5 0 0 1 12 19c-7 0-11-7-11-7a17.7 17.7 0 0 1 4.06-4.94" />
    <path d="M10.58 10.58A2 2 0 1 0 13.42 13.42" />
    <path d="M14.12 6.16A10.5 10.5 0 0 1 12 5c7 0 11 7 11 7a17.7 17.7 0 0 1-2.16 2.94" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export function TopBar() {
  const observer = useViewer((s) => s.observer);
  const tooltipsEnabled = useViewer((s) => s.tooltipsEnabled);
  const toggleTooltips = useViewer((s) => s.toggleTooltips);
  const [locOpen, setLocOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopyLink = async () => {
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
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select-and-copy via a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="flex items-center gap-2 pointer-events-auto">
      <SearchPalette />
      <button
        onClick={() => setLocOpen(true)}
        className={`glass rounded-full sm:px-3 sm:py-2 px-0 py-0 w-10 h-10 sm:w-auto sm:h-auto text-sm hover:text-white active:bg-white/10 flex items-center justify-center sm:justify-start sm:gap-2 ${observer ? "text-amber-200" : "text-white/80"}`}
        aria-label="Set observer location"
        title={observer ? `Observing from ${observer.name ?? "manual"}` : "Set viewing location"}
      >
        <PinIcon />
        <span className="hidden sm:inline">
          {observer ? observer.name ?? "Observer" : "Location"}
        </span>
      </button>
      <CompassButton onNeedObserver={() => setLocOpen(true)} />
      <button
        onClick={() => toggleTooltips()}
        className={`glass rounded-full sm:px-3 sm:py-2 px-0 py-0 w-10 h-10 sm:w-auto sm:h-auto text-sm active:bg-white/10 flex items-center justify-center sm:justify-start sm:gap-2 transition ${
          tooltipsEnabled ? "text-white/80 hover:text-white" : "text-white/55 hover:text-white/80"
        }`}
        aria-label={tooltipsEnabled ? "Hide object info on tap" : "Show object info on tap"}
        aria-pressed={tooltipsEnabled}
        title={tooltipsEnabled ? "Object info on — click to disable" : "Object info off — click to enable"}
      >
        {tooltipsEnabled ? <EyeIcon /> : <EyeOffIcon />}
        <span className="hidden sm:inline">
          {tooltipsEnabled ? "Info on" : "Info off"}
        </span>
      </button>
      <button
        onClick={onCopyLink}
        className="glass rounded-full sm:px-3 sm:py-2 px-0 py-0 w-10 h-10 sm:w-auto sm:h-auto text-sm text-white/80 hover:text-white active:bg-white/10 flex items-center justify-center sm:justify-start sm:gap-2"
        aria-label="Copy link to this view"
        title="Copy a deep link to the current view"
      >
        {copied ? <CheckIcon /> : <LinkIcon />}
        <span className="hidden sm:inline">{copied ? "Copied" : "Copy link"}</span>
      </button>
      <LocationModal open={locOpen} onClose={() => setLocOpen(false)} />
    </div>
  );
}

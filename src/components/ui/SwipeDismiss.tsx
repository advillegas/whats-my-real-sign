"use client";

/**
 * Mobile-only "swipe a card off-screen to dismiss" wrapper.
 *
 * - On touch devices: renders a `motion.div` that drags horizontally with
 *   `dragSnapToOrigin` so the card springs back unless the gesture clears
 *   one of two thresholds (offset > 100 px OR velocity > 600 px/s),
 *   in which case `onDismiss()` fires.
 * - On desktop / pointer-fine devices: renders a transparent `<div>`,
 *   leaving mouse-drag selection inside the card untouched.
 *
 * The drag axis is locked to "x" so the existing `overflow-y-auto` regions
 * inside cards keep working.
 */

import type { ReactNode, CSSProperties } from "react";
import { motion, type PanInfo } from "framer-motion";
import { useIsTouch } from "@/lib/use-is-touch";

interface Props {
  onDismiss: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Lower for snappier dismiss; defaults match plan: 100 px / 600 px/s. */
  offsetThreshold?: number;
  velocityThreshold?: number;
}

export function SwipeDismiss({
  onDismiss,
  children,
  className,
  style,
  offsetThreshold = 100,
  velocityThreshold = 600,
}: Props) {
  const isTouch = useIsTouch();

  if (!isTouch) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  const handleDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (
      Math.abs(info.offset.x) > offsetThreshold ||
      Math.abs(info.velocity.x) > velocityThreshold
    ) {
      onDismiss();
    }
  };

  return (
    <motion.div
      className={className}
      style={style}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.18}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
    >
      {children}
    </motion.div>
  );
}

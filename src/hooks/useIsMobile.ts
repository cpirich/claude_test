"use client";

import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * Detect mobile devices via:
 * 1. Narrow viewport (portrait phones) — width < 768px
 * 2. Touch + coarse pointer (phones in any orientation)
 * 3. Touch + short landscape (phones rotated) — catches DevTools emulation
 *    where CSS pointer/hover queries aren't simulated
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const narrowQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const touchQuery = window.matchMedia("(pointer: coarse) and (hover: none)");
    // Landscape phone: short viewport + landscape orientation + touch capability
    const landscapePhoneQuery = window.matchMedia(
      "(max-height: 500px) and (orientation: landscape) and (max-width: 1024px)"
    );

    const hasTouch = () => navigator.maxTouchPoints > 0 || "ontouchstart" in window;

    const update = () => {
      setIsMobile(
        narrowQuery.matches ||
        touchQuery.matches ||
        (landscapePhoneQuery.matches && hasTouch())
      );
    };

    update();
    narrowQuery.addEventListener("change", update);
    touchQuery.addEventListener("change", update);
    landscapePhoneQuery.addEventListener("change", update);
    return () => {
      narrowQuery.removeEventListener("change", update);
      touchQuery.removeEventListener("change", update);
      landscapePhoneQuery.removeEventListener("change", update);
    };
  }, []);

  return isMobile;
}

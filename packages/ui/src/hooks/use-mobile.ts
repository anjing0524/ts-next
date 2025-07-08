'use client';

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768; // Common breakpoint for mobile (md in Tailwind)

export function useMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Initial check
    const checkDevice = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };
    
    checkDevice();

    // Listen for window resize
    window.addEventListener('resize', checkDevice);

    // Cleanup listener
    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, [breakpoint]);

  return isMobile;
}
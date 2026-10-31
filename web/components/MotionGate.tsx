'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Pauses the CSS animations inside while the block is off screen, so a page
 * with motion costs nothing once it has scrolled away. Animations run without
 * JavaScript; this only adds the pause. See `[data-motion='paused']` in motion.css.
 */
export function MotionGate({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      el.dataset.motion = entry.isIntersecting ? 'running' : 'paused';
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} data-motion="running">
      {children}
    </div>
  );
}

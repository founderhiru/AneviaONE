'use client';

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Stagger delay in ms. */
  delay?: number;
  style?: CSSProperties;
  id?: string;
};

/**
 * Subtle fade + small upward reveal, triggered once when the element enters
 * the viewport. CSS handles prefers-reduced-motion (content is simply shown).
 * Also toggles `is-in` so child SVG lines (`.draw-line`) can animate.
 */
export function Reveal({ children, as: Tag = 'div', className = '', delay = 0, style, id }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={`reveal ${className}`.trim()}
      style={{ ...(delay ? ({ '--d': `${delay}ms` } as CSSProperties) : null), ...style }}
    >
      {children}
    </Tag>
  );
}

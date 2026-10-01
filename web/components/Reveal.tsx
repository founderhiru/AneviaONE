import type { CSSProperties, ElementType, ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
};

/**
 * Subtle fade + rise as the element scrolls into view. Pure CSS (scroll-driven
 * animation, see `.reveal` in base.css): no observer, no client JS, and no
 * hydration cost. Content is fully visible by default — the effect only
 * applies in browsers that support `animation-timeline: view()` and when the
 * user hasn't asked for reduced motion — so it never hides content without JS.
 */
export function Reveal({ children, as: Tag = 'div', className = '', style, id }: RevealProps) {
  return (
    <Tag id={id} className={`reveal ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}

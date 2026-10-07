import { useId } from 'react';

/**
 * The AneviaONE mark — the ribbon A with its leaf, inside the gold-to-green
 * ring — on its forest-green field.
 *
 * The artwork is the same geometry as the mobile app's single source,
 * `mobile/components/BrandMarkArt.tsx` (MARK_PATHS / MARK_COLORS), drawn in the
 * same 100 × 100 box. Keep the two in step: change the mark there first.
 *
 * The forest disc is part of the mark here (as in the app icon), so the ivory
 * letter stays legible on the website's light header as well as the dark
 * footer. Decorative: the wordmark beside it carries the accessible name.
 */

const PATHS = {
  leftStroke: 'M 51.2 19.8 L 17.6 77.4 L 26 72 L 50.8 30.2 Z',
  rightInner: 'M 51.8 16.5 L 76.6 77.2 L 73 76.3 L 47.2 26.9 Z',
  rightOuter: 'M 51.8 16.5 L 83.9 77 L 76.6 77.2 Z',
  crease: 'M 51.8 16.5 L 76.6 77.2',
  leafUpper: 'M 17.6 77.4 C 21 63 31 50.5 62.5 52.6 C 42 58 28 66 17.6 77.4 Z',
  leafLower: 'M 17.6 77.4 C 28 66 42 58 62.5 52.6 C 50 60 33 74.5 17.6 77.4 Z',
  leafVein: 'M 17.6 77.4 C 28 66 42 58 62.5 52.6',
} as const;

const C = {
  gold: '#F2D58A',
  champagne: '#F1E3B0',
  cream: '#FBF6E4',
  ringGreen: '#A9CF86',
  leafLight: '#8FD6A2',
  leafDeep: '#2E9A68',
} as const;

export function BrandMark({ size = 38, className }: { size?: number; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const f = (name: string) => `bm${id}${name}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={f('Field')} cx="50" cy="46" r="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2C5A36" />
          <stop offset="0.55" stopColor="#183A23" />
          <stop offset="1" stopColor="#0A2215" />
        </radialGradient>
        <linearGradient id={f('Ring')} gradientUnits="userSpaceOnUse" x1="94" y1="6" x2="6" y2="94">
          <stop offset="0" stopColor={C.gold} />
          <stop offset="0.35" stopColor={C.champagne} />
          <stop offset="0.7" stopColor={C.ringGreen} />
          <stop offset="1" stopColor={C.gold} />
        </linearGradient>
        <radialGradient id={f('Flare')}>
          <stop offset="0" stopColor={C.cream} stopOpacity="0.95" />
          <stop offset="0.25" stopColor={C.gold} stopOpacity="0.55" />
          <stop offset="1" stopColor={C.gold} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={f('Left')} gradientUnits="userSpaceOnUse" x1="51" y1="20" x2="18" y2="77">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#F3EBC8" />
          <stop offset="1" stopColor={C.gold} />
        </linearGradient>
        <linearGradient id={f('RightInner')} gradientUnits="userSpaceOnUse" x1="50" y1="18" x2="74" y2="77">
          <stop offset="0" stopColor="#E9E1BD" />
          <stop offset="1" stopColor="#D6E3C6" />
        </linearGradient>
        <linearGradient id={f('RightOuter')} gradientUnits="userSpaceOnUse" x1="52" y1="16" x2="82" y2="77">
          <stop offset="0" stopColor={C.cream} />
          <stop offset="0.55" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E7F2DC" />
        </linearGradient>
        <linearGradient id={f('LeafUpper')} gradientUnits="userSpaceOnUse" x1="18" y1="77" x2="62" y2="53">
          <stop offset="0" stopColor={C.gold} />
          <stop offset="0.45" stopColor={C.leafLight} />
          <stop offset="1" stopColor="#D3F0CC" />
        </linearGradient>
        <linearGradient id={f('LeafLower')} gradientUnits="userSpaceOnUse" x1="18" y1="77" x2="62" y2="53">
          <stop offset="0" stopColor="#B9B85E" />
          <stop offset="0.5" stopColor={C.leafDeep} />
          <stop offset="1" stopColor="#5FC08A" />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="50" fill={`url(#${f('Field')})`} />
      <circle cx="50" cy="50" r="44" fill="none" stroke={C.ringGreen} strokeOpacity="0.16" strokeWidth="4" />
      <circle cx="50" cy="50" r="44" fill="none" stroke={`url(#${f('Ring')})`} strokeWidth="1.3" />
      <circle cx="77.1" cy="15.3" r="9" fill={`url(#${f('Flare')})`} />

      <path d={PATHS.leftStroke} fill={`url(#${f('Left')})`} />
      <path d={PATHS.rightInner} fill={`url(#${f('RightInner')})`} />
      <path d={PATHS.rightOuter} fill={`url(#${f('RightOuter')})`} />
      <path d={PATHS.crease} stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="0.4" fill="none" />

      <path d={PATHS.leafLower} fill={`url(#${f('LeafLower')})`} opacity="0.95" />
      <path d={PATHS.leafUpper} fill={`url(#${f('LeafUpper')})`} opacity="0.95" />
      <path d={PATHS.leafVein} stroke={C.cream} strokeOpacity="0.55" strokeWidth="0.5" fill="none" />
    </svg>
  );
}

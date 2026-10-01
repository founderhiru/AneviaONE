import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

/**
 * The AneviaONE mark at rest — the ring with the Λ chevron inside — for dark
 * emerald surfaces (e.g. Welcome). Same geometry as the settled frame of
 * AnimatedSplash: the Λ spans ±0.57R wide, from 0.5R above to 0.48R below
 * the centre, with a stroke of R / 6.
 */
export function BrandMark({ size = 168 }: { size?: number }) {
  const c = size / 2;
  const r = size * 0.42;
  const stroke = r / 6;
  const apex = { x: c, y: c - 0.5 * r };
  const footL = { x: c - 0.57 * r, y: c + 0.48 * r };
  const footR = { x: c + 0.57 * r, y: c + 0.48 * r };
  const mark = `M ${footL.x} ${footL.y} L ${apex.x} ${apex.y} L ${footR.x} ${footR.y}`;
  const flare = { x: c + r * Math.cos((-52 * Math.PI) / 180), y: c + r * Math.sin((-52 * Math.PI) / 180) };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="brandMarkHalo" cx={c} cy={c} r={r * 1.25} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#3FD3A0" stopOpacity={0.14} />
          <Stop offset="0.75" stopColor="#3FD3A0" stopOpacity={0.06} />
          <Stop offset="1" stopColor="#3FD3A0" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="brandMarkRing" gradientUnits="userSpaceOnUse" x1={c + r} y1={c - r} x2={c - r} y2={c + r}>
          <Stop offset="0" stopColor="#F1E3B0" />
          <Stop offset="0.45" stopColor="#BFF2DC" />
          <Stop offset="1" stopColor="#7FE3C0" />
        </LinearGradient>
        <LinearGradient id="brandMarkChevron" gradientUnits="userSpaceOnUse" x1={0} y1={apex.y} x2={0} y2={footL.y}>
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#A8EBD2" />
        </LinearGradient>
        <RadialGradient id="brandMarkFlare">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="0.25" stopColor="#F1E3B0" stopOpacity={0.45} />
          <Stop offset="1" stopColor="#F1E3B0" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={r * 1.25} fill="url(#brandMarkHalo)" />
      <Circle cx={c} cy={c} r={r} stroke="#7FE3C0" strokeOpacity={0.18} strokeWidth={8} fill="none" />
      <Circle cx={c} cy={c} r={r} stroke="url(#brandMarkRing)" strokeWidth={2.4} fill="none" />
      <Path d={mark} stroke="#7FE3C0" strokeOpacity={0.14} strokeWidth={stroke * 2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={mark} stroke="url(#brandMarkChevron)" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Circle cx={flare.x} cy={flare.y} r={size * 0.09} fill="url(#brandMarkFlare)" />
    </Svg>
  );
}

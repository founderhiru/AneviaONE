import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { FOREST } from '../design/brandSurface';

/**
 * The brand's forest-green field: lit softly from above, darker at the
 * edges, with a few faint out-of-focus highlights. It is the splash's
 * background, and Welcome and the sign-in screens sit on the same field so
 * the launch flows straight into them.
 *
 * `strands` adds two still, translucent ribbons of light at the edges — the
 * splash's strands at rest — for screens that follow it (Welcome, sign-in).
 */
export function BrandAtmosphere({ id = 'brandField', strands = false }: { id?: string; strands?: boolean }) {
  const [c0, c1, c2, c3, c4] = FOREST.fieldStops;
  return (
    <>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient id={`${id}Field`} cx="50%" cy="32%" rx="85%" ry="70%">
            <Stop offset="0" stopColor={c0} />
            <Stop offset="0.25" stopColor={c1} />
            <Stop offset="0.5" stopColor={c2} />
            <Stop offset="0.75" stopColor={c3} />
            <Stop offset="1" stopColor={c4} />
          </RadialGradient>
          <RadialGradient id={`${id}Sky`} cx="50%" cy="0%" rx="62%" ry="42%">
            <Stop offset="0" stopColor={FOREST.limeGold} stopOpacity={0.18} />
            <Stop offset="0.5" stopColor={FOREST.limeGold} stopOpacity={0.06} />
            <Stop offset="1" stopColor={FOREST.limeGold} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}Vignette`} cx="50%" cy="42%" rx="75%" ry="70%">
            <Stop offset="0.55" stopColor={FOREST.vignette} stopOpacity={0} />
            <Stop offset="0.8" stopColor={FOREST.vignette} stopOpacity={0.25} />
            <Stop offset="1" stopColor={FOREST.vignette} stopOpacity={0.55} />
          </RadialGradient>
          <RadialGradient id={`${id}Bokeh`}>
            <Stop offset="0" stopColor="#E6EFC0" stopOpacity={0.07} />
            <Stop offset="1" stopColor="#E6EFC0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}Field)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}Sky)`} />
        <Circle cx="28%" cy="10%" r="16%" fill={`url(#${id}Bokeh)`} />
        <Circle cx="74%" cy="7%" r="12%" fill={`url(#${id}Bokeh)`} />
        <Circle cx="60%" cy="19%" r="8%" fill={`url(#${id}Bokeh)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}Vignette)`} />
      </Svg>
      {strands ? <Strands id={id} /> : null}
    </>
  );
}

/** Two still ribbons of light at the edges, drawn on a 390 × 844 stage. */
function Strands({ id }: { id: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <Defs>
        <LinearGradient id={`${id}SweepL`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={FOREST.gold} stopOpacity={0.5} />
          <Stop offset="0.6" stopColor={FOREST.sage} stopOpacity={0.22} />
          <Stop offset="1" stopColor={FOREST.sage} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id={`${id}SweepR`} x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor={FOREST.gold} stopOpacity={0.45} />
          <Stop offset="0.6" stopColor={FOREST.sage} stopOpacity={0.2} />
          <Stop offset="1" stopColor={FOREST.sage} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {/* Upper-left ribbon: a broad veil with two fine threads. */}
      <Path d="M -20 150 C 60 220 160 220 300 120" stroke={FOREST.sage} strokeOpacity={0.03} strokeWidth={60} strokeLinecap="round" fill="none" />
      <Path d="M -20 160 C 70 230 170 225 310 130" stroke={`url(#${id}SweepL)`} strokeWidth={1.4} fill="none" />
      <Path d="M -20 178 C 80 240 180 232 320 150" stroke={`url(#${id}SweepL)`} strokeWidth={0.8} fill="none" />
      {/* Lower-right ribbon. */}
      <Path d="M 410 520 C 330 600 220 640 60 640" stroke={FOREST.sage} strokeOpacity={0.03} strokeWidth={64} strokeLinecap="round" fill="none" />
      <Path d="M 410 530 C 320 610 210 650 50 655" stroke={`url(#${id}SweepR)`} strokeWidth={1.4} fill="none" />
      <Path d="M 410 548 C 330 625 230 668 70 676" stroke={`url(#${id}SweepR)`} strokeWidth={0.8} fill="none" />
    </Svg>
  );
}

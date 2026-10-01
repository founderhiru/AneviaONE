import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BRAND, taglineLines, wordmarkParts } from '../config/brand';
import { typography } from '../design/typography';

export type AnimatedSplashProps = {
  /** True once real app initialization (auth/session check) has resolved.
   * The splash always plays its full reveal at least once regardless of
   * this value, then — if `ready` is still false when the reveal
   * finishes — holds its settled frame to mask the remaining wait,
   * instead of looping or restarting. */
  ready: boolean;
  /** Called once, after the settled frame has faded out, once `ready` is
   * true. This is the cue for the caller to swap to the real app. */
  onFinished: () => void;
};

/**
 * Full-screen launch sequence, shown once per cold start above the app. It
 * starts on the same deep emerald as the native launch screen (app.json), so
 * launch reads as one continuous screen:
 *
 *   initiate (0–0.5 s)  a point of light; a thin ribbon flows up from below
 *   form     (0.5–1.2 s) the ribbon curves into an orbit — its tail is drawn
 *                        in after it, so the light itself becomes the circle
 *   A forms  (1.2–1.8 s) the Λ mark draws inside the orbit, haze → sharp
 *   settle   (1.8–2.3 s) one barely perceptible breath
 *   wordmark (2.3–2.7 s) → tagline (2.7–3.0 s) → light sweep (3.0–3.2 s)
 *   hold until the app is ready → fade out.
 *
 * Two clocks over the same timeline: one on the native driver (opacity and
 * transforms), one on the JS driver for the SVG stroke-dash offsets that draw
 * the ribbon, orbit and mark. No animation library. Honours reduce-motion:
 * the finished composition simply fades in.
 */

const TIMELINE_MS = 3200;
const REDUCED_MS = 500;
const EXIT_MS = 280;
// If the reveal's completion callback never arrives, settle anyway so the
// splash can never be what keeps the app hidden.
const FALLBACK_MS = 1000;
const EASE_SAMPLES = 8;

// Launch-only palette. The field matches the native launch screen in app.json.
const FIELD = '#062019';
const FIELD_GLOW = '#0C3A30';
const FIELD_MID = '#082A22';
const FIELD_EDGE = '#051A15';
const EMERALD = '#2FBF8F';
const TEAL = '#4FD1C5';
const SOFT_WHITE = '#EAF7F1';
const MINT = '#9FE6CF';
const CHAMPAGNE = '#E6D3A3';

// Canvas for the light: the orbit is centred at (CX, CY); the ribbon enters
// from below-left, inside the same box.
const CW = 320;
const CH = 380;
const CX = 160;
const CY = 150;
const R = 70;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Point = { x: number; y: number };

// Lead-in: a cubic curve from below-left that meets the bottom of the orbit
// travelling right, so it continues into the circle without a kink.
const LEAD: [Point, Point, Point, Point] = [
  { x: CX - 1.5 * R, y: CY + 2.9 * R },
  { x: CX - 1.65 * R, y: CY + 1.9 * R },
  { x: CX - 0.95 * R, y: CY + R },
  { x: CX, y: CY + R },
];
const LEAD_D = `M ${LEAD[0].x} ${LEAD[0].y} C ${LEAD[1].x} ${LEAD[1].y} ${LEAD[2].x} ${LEAD[2].y} ${LEAD[3].x} ${LEAD[3].y}`;
// Full circle from the bottom, counter-clockwise on screen (rightwards first).
const ORBIT_D = `M ${CX} ${CY + R} A ${R} ${R} 0 1 0 ${CX} ${CY - R} A ${R} ${R} 0 1 0 ${CX} ${CY + R}`;

function cubicLength([p0, p1, p2, p3]: [Point, Point, Point, Point], steps = 240): number {
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const pt = {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
    length += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return length;
}
const LEAD_LENGTH = cubicLength(LEAD);
const TRAVEL = LEAD_LENGTH + CIRCUMFERENCE;
const HEAD = 16; // bright head of the moving light
const SWEEP = CIRCUMFERENCE * 0.2; // champagne highlight at the end
const GAP = CIRCUMFERENCE * 4; // keeps repeated dashes off the path

// The existing chevron mark (same proportions as the app icon), centred in
// the orbit.
const APEX = { x: CX, y: CY - 0.5 * R };
const FOOT_L = { x: CX - 0.57 * R, y: CY + 0.48 * R };
const FOOT_R = { x: CX + 0.57 * R, y: CY + 0.48 * R };
const MARK_D = `M ${FOOT_L.x} ${FOOT_L.y} L ${APEX.x} ${APEX.y} L ${FOOT_R.x} ${FOOT_R.y}`;
const MARK_LENGTH = Math.hypot(APEX.x - FOOT_L.x, APEX.y - FOOT_L.y) * 2;
const MARK_STROKE = 12;
// [stroke width, opacity] layers of the soft glow the mark emerges from.
const HAZE: [number, number][] = [
  [MARK_STROKE * 3, 0.05],
  [MARK_STROKE * 2.2, 0.08],
  [MARK_STROKE * 1.5, 0.12],
];

// A few restrained points of light near where the ribbon enters.
const MOTES: (Point & { color: string; delay: number })[] = [
  { x: 70, y: 330, color: TEAL, delay: 40 },
  { x: 46, y: 296, color: SOFT_WHITE, delay: 140 },
  { x: 104, y: 348, color: EMERALD, delay: 90 },
  { x: 118, y: 300, color: MINT, delay: 220 },
  { x: 34, y: 344, color: TEAL, delay: 180 },
];

const AnimatedPath = Animated.createAnimatedComponent(Path);

const [nameLead, nameAccent] = wordmarkParts();
const taglineDisplay = taglineLines(BRAND.launchTagline).filter(Boolean).map((line) => line.replace(/\.$/, ''));

type At = (input: number[], output: number[], ease?: (value: number) => number) => Animated.AnimatedInterpolation<number>;

function sampled(clock: Animated.Value): At {
  // The native driver doesn't accept `easing` in interpolate(), so eased
  // curves are baked into the ranges by sampling each segment.
  return (input, output, ease = Easing.inOut(Easing.quad)) => {
    const inputRange: number[] = [input[0]];
    const outputRange: number[] = [output[0]];
    for (let s = 1; s < input.length; s++) {
      for (let k = 1; k <= EASE_SAMPLES; k++) {
        const f = k / EASE_SAMPLES;
        inputRange.push(input[s - 1] + (input[s] - input[s - 1]) * f);
        outputRange.push(output[s - 1] + (output[s] - output[s - 1]) * ease(f));
      }
    }
    return clock.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  };
}

export function AnimatedSplash({ ready, onFinished }: AnimatedSplashProps) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [settled, setSettled] = useState(false);
  const [clock] = useState(() => new Animated.Value(0)); // native driver
  const [svgClock] = useState(() => new Animated.Value(0)); // JS driver (SVG props)
  const [exitOpacity] = useState(() => new Animated.Value(1));
  const exitStarted = useRef(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setReduceMotion(enabled))
      .catch(() => mounted && setReduceMotion(false));
    return () => {
      mounted = false;
    };
  }, []);

  // Play the reveal once.
  useEffect(() => {
    if (reduceMotion === null) return undefined;
    const duration = reduceMotion ? REDUCED_MS : TIMELINE_MS;
    const timeline = Animated.timing(clock, {
      toValue: TIMELINE_MS,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    const strokes = Animated.timing(svgClock, {
      toValue: TIMELINE_MS,
      duration: reduceMotion ? 0 : TIMELINE_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    timeline.start(({ finished }) => finished && setSettled(true));
    strokes.start();
    const fallback = setTimeout(() => setSettled(true), duration + FALLBACK_MS);
    return () => {
      timeline.stop();
      strokes.stop();
      clearTimeout(fallback);
    };
  }, [reduceMotion, clock, svgClock]);

  // Hold the settled frame until the app is ready, then fade into it.
  useEffect(() => {
    if (!settled || !ready || exitStarted.current) return undefined;
    exitStarted.current = true;
    const animation = Animated.timing(exitOpacity, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => finished && onFinished());
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, ready]);

  const at = useCallback<At>((input, output, ease) => sampled(clock)(input, output, ease), [clock]);
  const svgAt = useCallback<At>((input, output, ease) => sampled(svgClock)(input, output, ease), [svgClock]);

  const view = useMemo(() => {
    const out = Easing.out(Easing.cubic);
    if (reduceMotion) {
      // Reduced motion: the finished composition fades in (the clock covers
      // TIMELINE_MS in REDUCED_MS); nothing is drawn or moves.
      return {
        reduced: true,
        all: at([0, TIMELINE_MS], [0, 1], out),
        field: 1,
        markHaze: 0.5,
        markIn: 1,
        markScale: 1,
        breath: 1,
        nameIn: 1,
        nameY: 0,
        tagIn: 1,
      } as const;
    }
    return {
      reduced: false,
      all: 1,
      field: at([0, 450], [0, 1]),
      // The A emerges from the same light: a soft haze first, then the
      // sharp mark draws through it.
      markHaze: at([1150, 1400, 1800, 2050, 2300], [0, 1, 0.5, 0.75, 0.5]),
      markIn: at([1250, 1500], [0, 1], out),
      markScale: at([1200, 1800], [0.94, 1], out),
      breath: at([1800, 2050, 2300], [1, 1.012, 1]),
      nameIn: at([2300, 2700], [0, 1], out),
      nameY: at([2300, 2700], [6, 0], out),
      tagIn: at([2700, 3000], [0, 1], out),
    } as const;
  }, [at, reduceMotion]);

  const strokes = useMemo(() => {
    // One travelling distance drives the light: 0 → lead-in → full orbit.
    const travel = svgAt([120, 1200], [0, TRAVEL], Easing.inOut(Easing.cubic));
    const lin = Easing.linear;
    const along = (inRange: number[], outRange: number[]) =>
      travel.interpolate({ inputRange: inRange, outputRange: outRange, extrapolate: 'clamp' });
    return {
      // A fixed-length dash slides along the lead-in, so its tail follows the
      // head into the orbit and the ribbon is absorbed into the circle.
      lead: along([0, TRAVEL], [LEAD_LENGTH, LEAD_LENGTH - TRAVEL]),
      leadHead: along([0, TRAVEL], [HEAD, HEAD - TRAVEL]),
      orbit: along([0, LEAD_LENGTH, TRAVEL], [CIRCUMFERENCE, CIRCUMFERENCE, 0]),
      orbitHead: along([0, TRAVEL], [HEAD + LEAD_LENGTH, HEAD - CIRCUMFERENCE]),
      headOpacity: svgAt([0, 120, 1100, 1350], [0, 1, 1, 0], lin),
      orbitGlow: svgAt([500, 1200, 2050, 2300], [0.1, 0.22, 0.3, 0.2]),
      haze: svgAt([1150, 1550], [MARK_LENGTH, 0], Easing.inOut(Easing.cubic)),
      mark: svgAt([1250, 1700], [MARK_LENGTH, 0], Easing.inOut(Easing.cubic)),
      sweep: svgAt([2950, 3200], [SWEEP - CIRCUMFERENCE * 0.02, SWEEP - CIRCUMFERENCE * 0.5], Easing.inOut(Easing.quad)),
      sweepOpacity: svgAt([2950, 3050, 3200], [0, 0.75, 0], lin),
    };
  }, [svgAt]);

  const reduced = view.reduced;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: FIELD, opacity: exitOpacity }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading ${BRAND.wordmark}`}
    >
      <StatusBar style="light" />

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.field }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="splashField" cx="50%" cy="42%" rx="75%" ry="60%">
              <Stop offset="0" stopColor={FIELD_GLOW} />
              <Stop offset="0.55" stopColor={FIELD_MID} />
              <Stop offset="1" stopColor={FIELD_EDGE} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashField)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.canvas, { opacity: view.all }]}>
        {/* Points of light where the ribbon enters. */}
        {MOTES.map((m) => (
          <Animated.View
            key={`${m.x}-${m.y}`}
            style={[
              styles.mote,
              {
                left: m.x - 1.5,
                top: m.y - 1.5,
                backgroundColor: m.color,
                opacity: reduced ? 0 : at([m.delay, m.delay + 250, 1000], [0, 0.7, 0]),
                transform: [
                  { translateX: reduced ? 0 : at([m.delay, 1000], [0, (CX - m.x) * 0.12]) },
                  { translateY: reduced ? 0 : at([m.delay, 1000], [0, (CY - m.y) * 0.12]) },
                ],
              },
            ]}
          />
        ))}

        {/* The light: lead-in ribbon, orbit, moving head, final sweep. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: view.breath }] }]}>
          <Svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
            <Defs>
              <LinearGradient id="splashRibbon" gradientUnits="userSpaceOnUse" x1={LEAD[0].x} y1={LEAD[0].y} x2={CX + R} y2={CY - R}>
                <Stop offset="0" stopColor={EMERALD} />
                <Stop offset="0.6" stopColor={TEAL} />
                <Stop offset="1" stopColor={MINT} />
              </LinearGradient>
            </Defs>

            {/* Lead-in ribbon: soft glow, colour, bright core. */}
            {!reduced ? (
              <>
                <AnimatedPath d={LEAD_D} stroke={TEAL} strokeOpacity={0.22} strokeWidth={10} strokeLinecap="round" fill="none" strokeDasharray={[LEAD_LENGTH, GAP]} strokeDashoffset={strokes.lead} />
                <AnimatedPath d={LEAD_D} stroke="url(#splashRibbon)" strokeWidth={2.4} strokeLinecap="round" fill="none" strokeDasharray={[LEAD_LENGTH, GAP]} strokeDashoffset={strokes.lead} />
                <AnimatedPath d={LEAD_D} stroke={SOFT_WHITE} strokeOpacity={0.55} strokeWidth={0.9} strokeLinecap="round" fill="none" strokeDasharray={[LEAD_LENGTH, GAP]} strokeDashoffset={strokes.lead} />
              </>
            ) : null}

            {/* Orbit, drawn by the same light. */}
            <AnimatedPath d={ORBIT_D} stroke={EMERALD} strokeWidth={9} strokeLinecap="round" fill="none" opacity={reduced ? 0.22 : strokes.orbitGlow} strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.orbit} />
            <AnimatedPath d={ORBIT_D} stroke="url(#splashRibbon)" strokeWidth={2.4} strokeLinecap="round" fill="none" strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.orbit} />
            <AnimatedPath d={ORBIT_D} stroke={SOFT_WHITE} strokeOpacity={0.45} strokeWidth={0.9} strokeLinecap="round" fill="none" strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.orbit} />

            {/* The bright head of the moving light. */}
            {!reduced ? (
              <>
                <AnimatedPath d={LEAD_D} stroke={SOFT_WHITE} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={strokes.headOpacity} strokeDasharray={[HEAD, GAP]} strokeDashoffset={strokes.leadHead} />
                <AnimatedPath d={ORBIT_D} stroke={SOFT_WHITE} strokeWidth={3.2} strokeLinecap="round" fill="none" opacity={strokes.headOpacity} strokeDasharray={[HEAD, GAP]} strokeDashoffset={strokes.orbitHead} />
                <AnimatedPath d={ORBIT_D} stroke={CHAMPAGNE} strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={strokes.sweepOpacity} strokeDasharray={[SWEEP, GAP]} strokeDashoffset={strokes.sweep} />
              </>
            ) : null}
          </Svg>
        </Animated.View>

        {/* The A: haze → sharp, drawn inside the orbit. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: view.breath }] }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.markHaze }]}>
            <Svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
              {/* Stacked soft strokes stand in for a blur; they draw just ahead of the sharp mark. */}
              {HAZE.map(([width, opacity]) => (
                <AnimatedPath
                  key={width}
                  d={MARK_D}
                  stroke={MINT}
                  strokeOpacity={opacity}
                  strokeWidth={width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={[MARK_LENGTH, MARK_LENGTH]}
                  strokeDashoffset={reduced ? 0 : strokes.haze}
                />
              ))}
            </Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.markIn, transform: [{ scale: view.markScale }] }]}>
            <Svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
              <Defs>
                <LinearGradient id="splashMark" gradientUnits="userSpaceOnUse" x1={0} y1={APEX.y} x2={0} y2={FOOT_L.y}>
                  <Stop offset="0" stopColor={SOFT_WHITE} />
                  <Stop offset="1" stopColor={MINT} />
                </LinearGradient>
              </Defs>
              <AnimatedPath
                d={MARK_D}
                stroke="url(#splashMark)"
                strokeWidth={MARK_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray={[MARK_LENGTH, MARK_LENGTH]}
                strokeDashoffset={reduced ? 0 : strokes.mark}
              />
            </Svg>
          </Animated.View>
        </Animated.View>

        <View style={styles.copy}>
          <Animated.View style={{ opacity: view.nameIn, transform: [{ translateY: view.nameY }] }}>
            <Text style={[typography.headingMedium, styles.name]} accessibilityRole="header">
              {nameLead}
              {nameAccent ? <Text style={styles.nameAccent}>{nameAccent}</Text> : null}
            </Text>
          </Animated.View>
          <Animated.View style={{ opacity: view.tagIn }}>
            {taglineDisplay.map((line) => (
              <Text key={line} style={styles.tagline}>
                {line}
              </Text>
            ))}
          </Animated.View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  canvas: { width: CW, height: CH },
  mote: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5 },
  copy: { position: 'absolute', left: 0, right: 0, top: CY + R + 34, alignItems: 'center' },
  name: { color: SOFT_WHITE, textAlign: 'center', marginBottom: 10 },
  nameAccent: { color: MINT },
  tagline: {
    color: 'rgba(234, 247, 241, 0.62)',
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: 2.4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

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
 *   initiate (0–0.7 s)   a wide ribbon of overlapping translucent strands
 *                         sweeps up from below in an S-curve
 *   form     (0.7–1.5 s)  it curves into the orbit — its tail is drawn in
 *                         after it, so the light itself becomes the circle
 *   Λ        (1.2–2.0 s)  the mark emerges from a soft haze, then sharpens
 *   wordmark (2.0–2.5 s) → tagline (2.35–2.7 s)
 *   settle   (2.7–3.2 s)  a faint lower horizon glow and one shimmer along
 *                         the orbit; hold until the app is ready → fade out.
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
const EMERALD = '#2FBF8F';
const TEAL = '#4FD1C5';
const SOFT_WHITE = '#EAF7F1';
const MINT = '#9FE6CF';
const CHAMPAGNE = '#E6D3A3';

// Canvas for the light: the orbit is centred at (CX, CY); the ribbon rises
// from below it, inside the same box.
const CW = 320;
const CH = 480;
const CX = 160;
const CY = 150;
const R = 70;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Point = { x: number; y: number };
type Cubic = [Point, Point, Point, Point];

// The ribbon's centre line: an S-curve from the lower centre that bows right,
// sweeps left, then rises into the left side of the orbit travelling upward —
// the orbit continues it clockwise without a kink. Each strand of the ribbon
// is this curve displaced by an offset that tapers to zero at the orbit, so
// the strands spread apart low down and gather as they enter the circle.
const SPINE: Point[] = [
  { x: CX + 0.4 * R, y: CY + 4.4 * R }, // start
  { x: CX + 1.35 * R, y: CY + 3.4 * R },
  { x: CX + 0.6 * R, y: CY + 2.3 * R },
  { x: CX - 0.4 * R, y: CY + 2.0 * R }, // inflection
  { x: CX - 1.4 * R, y: CY + 1.7 * R },
  { x: CX - R, y: CY + 0.9 * R },
  { x: CX - R, y: CY }, // enters the orbit
];
const TAPER = [1, 1, 0.8, 0.6, 0.35, 0, 0];

function strandPoints(dx: number, dy: number): Point[] {
  return SPINE.map((p, i) => ({ x: p.x + dx * TAPER[i], y: p.y + dy * TAPER[i] }));
}
function strandPath(p: Point[]): string {
  return `M ${p[0].x} ${p[0].y} C ${p[1].x} ${p[1].y} ${p[2].x} ${p[2].y} ${p[3].x} ${p[3].y} C ${p[4].x} ${p[4].y} ${p[5].x} ${p[5].y} ${p[6].x} ${p[6].y}`;
}
function bezier([p0, p1, p2, p3]: Cubic, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}
function cubicLength(c: Cubic, steps = 200): number {
  let length = 0;
  let prev = c[0];
  for (let i = 1; i <= steps; i++) {
    const pt = bezier(c, i / steps);
    length += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return length;
}
const segments = (p: Point[]): [Cubic, Cubic] => [
  [p[0], p[1], p[2], p[3]],
  [p[3], p[4], p[5], p[6]],
];
function strandLength(p: Point[]): number {
  const [a, b] = segments(p);
  return cubicLength(a) + cubicLength(b);
}
/** A point along the spine, u in [0, 1] (by curve parameter). */
function spineAt(u: number): Point {
  const [a, b] = segments(SPINE);
  return u < 0.5 ? bezier(a, u * 2) : bezier(b, (u - 0.5) * 2);
}

// Strands, back to front: wide translucent teal and emerald veils, a mint
// band, the champagne core and a fine white highlight — together they read
// as one band of flowing silk-like light.
type Strand = { dx: number; dy: number; width: number; color: string; opacity: number };
const STRANDS: Strand[] = [
  { dx: 30, dy: 10, width: 42, color: TEAL, opacity: 0.035 },
  { dx: 14, dy: 5, width: 28, color: EMERALD, opacity: 0.06 },
  { dx: -14, dy: -4, width: 17, color: EMERALD, opacity: 0.1 },
  { dx: 9, dy: 4, width: 6, color: MINT, opacity: 0.22 },
  { dx: -24, dy: -8, width: 1.4, color: CHAMPAGNE, opacity: 0.6 },
  { dx: 18, dy: 6, width: 1, color: SOFT_WHITE, opacity: 0.35 },
  { dx: 0, dy: 0, width: 3, color: 'url(#splashCore)', opacity: 0.95 },
  { dx: 0, dy: 0, width: 1, color: SOFT_WHITE, opacity: 0.8 },
];
const STRAND_GEOMETRY = STRANDS.map((s) => {
  const points = strandPoints(s.dx, s.dy);
  return { d: strandPath(points), length: strandLength(points) };
});
const SPINE_D = strandPath(SPINE);
const SPINE_LENGTH = strandLength(SPINE);
const TRAVEL = SPINE_LENGTH + CIRCUMFERENCE;

// Full circle from the left, clockwise on screen (upwards first).
const ORBIT_D = `M ${CX - R} ${CY} A ${R} ${R} 0 1 1 ${CX + R} ${CY} A ${R} ${R} 0 1 1 ${CX - R} ${CY}`;
const HEAD = 16; // bright head of the moving light
const TRAIL = 70; // softer champagne light trailing the head
const SWEEP = CIRCUMFERENCE * 0.2; // final shimmer along the orbit
const GAP = CIRCUMFERENCE * 6; // keeps repeated dashes off the path

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
  [MARK_STROKE * 3.4, 0.04],
  [MARK_STROKE * 2.4, 0.07],
  [MARK_STROKE * 1.6, 0.11],
];

// Fine motes shed by the brightest part of the flow, appearing as the head
// passes them. [position along the spine, sideways offset, colour].
const MOTE_SPECS: [number, number, string][] = [
  [0.1, 12, CHAMPAGNE],
  [0.18, -10, SOFT_WHITE],
  [0.26, 16, MINT],
  [0.34, -14, CHAMPAGNE],
  [0.42, 9, SOFT_WHITE],
  [0.5, -18, MINT],
  [0.58, 13, CHAMPAGNE],
  [0.66, -9, SOFT_WHITE],
  [0.76, 15, CHAMPAGNE],
  [0.86, -12, MINT],
];
const MOTES = MOTE_SPECS.map(([u, side, color], i) => {
  const p = spineAt(u);
  const q = spineAt(Math.min(1, u + 0.01));
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  // Sideways = perpendicular to the direction of travel.
  const nx = -(q.y - p.y) / len;
  const ny = (q.x - p.x) / len;
  return { x: p.x + nx * side, y: p.y + ny * side, color, at: 80 + u * 700, size: i % 3 === 0 ? 2.5 : 2 };
});

// Faint horizon glow beneath the tagline in the settled frame.
const GLOW_Y = CY + R + 128;

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
        bloom: 1,
        markHaze: 0.5,
        markIn: 1,
        markScale: 1,
        breath: 1,
        nameIn: 1,
        nameY: 0,
        tagIn: 1,
        horizon: 1,
      } as const;
    }
    return {
      reduced: false,
      all: 1,
      field: at([0, 450], [0, 1]),
      // The light around the orbit swells as the ribbon closes into it.
      bloom: at([300, 1500, 2300], [0.35, 1, 0.85]),
      // The Λ emerges from the same light: a soft haze first, then the sharp
      // mark draws through it and settles.
      markHaze: at([1200, 1500, 2000, 2250, 2500], [0, 1, 0.5, 0.7, 0.5]),
      markIn: at([1300, 1600], [0, 1], out),
      markScale: at([1300, 2000], [0.94, 1], out),
      breath: at([2000, 2250, 2500], [1, 1.01, 1]),
      nameIn: at([2000, 2500], [0, 1], out),
      nameY: at([2000, 2500], [6, 0], out),
      tagIn: at([2350, 2700], [0, 1], out),
      horizon: at([2600, 3150], [0, 1], out),
    } as const;
  }, [at, reduceMotion]);

  const strokes = useMemo(() => {
    // One travelling distance drives the light along the spine and on round
    // the orbit; each strand moves in proportion so they all arrive together.
    const travel = svgAt([60, 1500], [0, TRAVEL], Easing.inOut(Easing.cubic));
    const lin = Easing.linear;
    const along = (inRange: number[], outRange: number[]) =>
      travel.interpolate({ inputRange: inRange, outputRange: outRange, extrapolate: 'clamp' });
    return {
      // A fixed-length dash slides along each strand, so its tail follows the
      // head into the orbit and the ribbon is absorbed into the circle.
      strands: STRAND_GEOMETRY.map(({ length }) => along([0, TRAVEL], [length, length - (TRAVEL * length) / SPINE_LENGTH])),
      leadHead: along([0, TRAVEL], [HEAD, HEAD - TRAVEL]),
      orbit: along([0, SPINE_LENGTH, TRAVEL], [CIRCUMFERENCE, CIRCUMFERENCE, 0]),
      orbitHead: along([0, TRAVEL], [HEAD + SPINE_LENGTH, HEAD - CIRCUMFERENCE]),
      orbitTrail: along([0, TRAVEL], [TRAIL + SPINE_LENGTH, TRAIL - CIRCUMFERENCE]),
      headOpacity: svgAt([0, 80, 1400, 1700], [0, 1, 1, 0], lin),
      haze: svgAt([1200, 1600], [MARK_LENGTH, 0], Easing.inOut(Easing.cubic)),
      mark: svgAt([1300, 1850], [MARK_LENGTH, 0], Easing.inOut(Easing.cubic)),
      sweep: svgAt([2750, 3150], [SWEEP - CIRCUMFERENCE * 0.02, SWEEP - CIRCUMFERENCE * 0.55], Easing.inOut(Easing.quad)),
      sweepOpacity: svgAt([2750, 2900, 3150], [0, 0.7, 0], lin),
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

      {/* Atmosphere: emerald body with darker forest edges, a soft champagne
          warmth low down, and a vignette. Many stops keep it free of banding. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.field }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="splashField" cx="50%" cy="40%" rx="80%" ry="62%">
              <Stop offset="0" stopColor="#0F4436" />
              <Stop offset="0.2" stopColor="#0D3D31" />
              <Stop offset="0.4" stopColor="#0A332A" />
              <Stop offset="0.6" stopColor="#082A22" />
              <Stop offset="0.8" stopColor="#06211B" />
              <Stop offset="1" stopColor="#041813" />
            </RadialGradient>
            <RadialGradient id="splashWarm" cx="50%" cy="80%" rx="60%" ry="26%">
              <Stop offset="0" stopColor={CHAMPAGNE} stopOpacity={0.07} />
              <Stop offset="0.5" stopColor={CHAMPAGNE} stopOpacity={0.03} />
              <Stop offset="1" stopColor={CHAMPAGNE} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="splashVignette" cx="50%" cy="45%" rx="75%" ry="70%">
              <Stop offset="0.55" stopColor="#020D0A" stopOpacity={0} />
              <Stop offset="0.8" stopColor="#020D0A" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#020D0A" stopOpacity={0.55} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashField)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashWarm)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashVignette)" />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.canvas, { opacity: view.all }]}>
        {/* Soft green bloom around the orbit. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.bloom }]} pointerEvents="none">
          <Svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
            <Defs>
              <RadialGradient id="splashBloom" cx={CX} cy={CY} r={R * 2.3} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={EMERALD} stopOpacity={0.16} />
                <Stop offset="0.35" stopColor={EMERALD} stopOpacity={0.09} />
                <Stop offset="0.7" stopColor={TEAL} stopOpacity={0.03} />
                <Stop offset="1" stopColor={TEAL} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width={CW} height={CH} fill="url(#splashBloom)" />
          </Svg>
        </Animated.View>

        {/* Fine motes shed by the flow. */}
        {MOTES.map((m) => (
          <Animated.View
            key={`${m.x}-${m.y}`}
            style={[
              styles.mote,
              {
                left: m.x - m.size / 2,
                top: m.y - m.size / 2,
                width: m.size,
                height: m.size,
                borderRadius: m.size / 2,
                backgroundColor: m.color,
                opacity: reduced ? 0 : at([m.at, m.at + 150, m.at + 650], [0, 0.85, 0]),
                transform: [{ translateY: reduced ? 0 : at([m.at, m.at + 650], [0, -8]) }],
              },
            ]}
          />
        ))}

        {/* The light: ribbon strands, orbit, moving head, final shimmer. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: view.breath }] }]}>
          <Svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
            <Defs>
              <LinearGradient id="splashCore" gradientUnits="userSpaceOnUse" x1={SPINE[0].x} y1={SPINE[0].y} x2={CX} y2={CY - R}>
                <Stop offset="0" stopColor={MINT} />
                <Stop offset="0.45" stopColor={CHAMPAGNE} />
                <Stop offset="1" stopColor={SOFT_WHITE} />
              </LinearGradient>
              <LinearGradient id="splashOrbit" gradientUnits="userSpaceOnUse" x1={CX - R} y1={CY + R} x2={CX + R} y2={CY - R}>
                <Stop offset="0" stopColor={MINT} />
                <Stop offset="0.5" stopColor={CHAMPAGNE} />
                <Stop offset="1" stopColor={SOFT_WHITE} />
              </LinearGradient>
            </Defs>

            {/* Ribbon: overlapping translucent strands. */}
            {!reduced
              ? STRANDS.map((s, i) => (
                  <AnimatedPath
                    key={`strand-${i}`}
                    d={STRAND_GEOMETRY[i].d}
                    stroke={s.color}
                    strokeOpacity={s.opacity}
                    strokeWidth={s.width}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={[STRAND_GEOMETRY[i].length, GAP]}
                    strokeDashoffset={strokes.strands[i]}
                  />
                ))
              : null}

            {/* Orbit, drawn by the same light, with the same layering. */}
            <AnimatedPath d={ORBIT_D} stroke={EMERALD} strokeOpacity={0.18} strokeWidth={11} strokeLinecap="round" fill="none" strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.orbit} />
            <AnimatedPath d={ORBIT_D} stroke={MINT} strokeOpacity={0.32} strokeWidth={3.6} strokeLinecap="round" fill="none" strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.orbit} />
            <AnimatedPath d={ORBIT_D} stroke="url(#splashOrbit)" strokeWidth={1.8} strokeLinecap="round" fill="none" strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.orbit} />

            {!reduced ? (
              <>
                {/* Bright head of the moving light, with a champagne trail. */}
                <AnimatedPath d={SPINE_D} stroke={SOFT_WHITE} strokeWidth={3.4} strokeLinecap="round" fill="none" opacity={strokes.headOpacity} strokeDasharray={[HEAD, GAP]} strokeDashoffset={strokes.leadHead} />
                <AnimatedPath d={ORBIT_D} stroke={CHAMPAGNE} strokeOpacity={0.5} strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={strokes.headOpacity} strokeDasharray={[TRAIL, GAP]} strokeDashoffset={strokes.orbitTrail} />
                <AnimatedPath d={ORBIT_D} stroke={SOFT_WHITE} strokeWidth={3.4} strokeLinecap="round" fill="none" opacity={strokes.headOpacity} strokeDasharray={[HEAD, GAP]} strokeDashoffset={strokes.orbitHead} />
                <AnimatedPath d={ORBIT_D} stroke={CHAMPAGNE} strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={strokes.sweepOpacity} strokeDasharray={[SWEEP, GAP]} strokeDashoffset={strokes.sweep} />
              </>
            ) : null}
          </Svg>
        </Animated.View>

        {/* The Λ: haze → sharp, drawn inside the orbit. */}
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

        {/* Settled frame: a faint horizon of light beneath the tagline. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.horizon }]} pointerEvents="none">
          <Svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`}>
            <Defs>
              <RadialGradient id="splashHorizonGlow" cx={CX} cy={GLOW_Y} rx={130} ry={16} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={CHAMPAGNE} stopOpacity={0.22} />
                <Stop offset="0.5" stopColor={MINT} stopOpacity={0.07} />
                <Stop offset="1" stopColor={MINT} stopOpacity={0} />
              </RadialGradient>
              <LinearGradient id="splashHorizonLine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={CHAMPAGNE} stopOpacity={0} />
                <Stop offset="0.5" stopColor={CHAMPAGNE} stopOpacity={0.55} />
                <Stop offset="1" stopColor={CHAMPAGNE} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Ellipse cx={CX} cy={GLOW_Y} rx={130} ry={16} fill="url(#splashHorizonGlow)" />
            <Rect x={CX - 90} y={GLOW_Y - 0.5} width={180} height={1} fill="url(#splashHorizonLine)" />
          </Svg>
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
  mote: { position: 'absolute' },
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

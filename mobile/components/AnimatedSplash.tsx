import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BRAND, taglineLines, wordmarkParts } from '../config/brand';

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
 * starts on the same forest green as the native launch screen (app.json), so
 * launch reads as one continuous screen. Four moments, as in the storyboard:
 *
 *   initiate (0–0.7 s)   a tall S of silky, overlapping light sweeps up the
 *                         screen, gold at its heart, with fine sparkles
 *   form     (0.7–1.5 s)  the strands curl round the centre in swirling arcs
 *                         while the ring draws; the Λ emerges (1.2–2.0 s) and
 *                         the swirls dissolve into one clean ring
 *   reveal   (2.0–2.7 s)  wordmark, then tagline; a gold horizon line glows
 *                         low on the screen
 *   settle   (2.7–3.2 s)  the horizon rises slightly and warms; one shimmer
 *                         on the ring — hold until the app is ready → fade.
 *
 * Everything is laid out on a 390 × 844 stage scaled to cover the screen, so
 * the ribbon, ring and text keep their relationship on every phone. Two
 * clocks: native driver for opacity/transforms, JS driver for the SVG
 * stroke-dash offsets that draw the light. No animation library. Honours
 * reduce-motion: the finished composition simply fades in.
 */

const TIMELINE_MS = 3200;
const REDUCED_MS = 500;
const EXIT_MS = 280;
// If the reveal's completion callback never arrives, settle anyway so the
// splash can never be what keeps the app hidden.
const FALLBACK_MS = 1000;
const EASE_SAMPLES = 8;

// Launch-only palette. FIELD matches the native launch screen in app.json.
const FIELD = '#0E2A1B';
const GOLD = '#F2D58A';
const SOFT_WHITE = '#F6F9EF';
const SAGE = '#BFE0B5';
const GREEN_LIGHT = '#8FCF9A';
const LIME_GOLD = '#C9DC86';
const RING_GREEN = '#A9CF86';

// Stage: every coordinate below is in this box.
const SW = 390;
const SH = 844;
const CX = 195;
const CY = 315;
const R = 84;

type Point = { x: number; y: number };
type Cubic = [Point, Point, Point, Point];

// The ribbon's centre line: a tall S from below the screen — bowing right,
// crossing the centre, bowing left — that arrives at the top of the ring
// travelling right, so it carries on round the ring without a kink.
const SPINE: Point[] = [
  { x: 70, y: 900 },
  { x: 400, y: 760 },
  { x: 380, y: 520 },
  { x: 205, y: 470 }, // heart of the S
  { x: 30, y: 420 },
  { x: 80, y: CY - R },
  { x: CX, y: CY - R }, // top of the ring
];
const TAPER = [1, 1, 0.8, 0.6, 0.35, 0, 0];

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
/** A point along the spine, u in [0, 1] (by curve parameter). */
function spineAt(u: number): Point {
  const [a, b] = segments(SPINE);
  return u < 0.5 ? bezier(a, u * 2) : bezier(b, (u - 0.5) * 2);
}
const ringPoint = (deg: number, r = R): Point => ({
  x: CX + r * Math.cos((deg * Math.PI) / 180),
  y: CY + r * Math.sin((deg * Math.PI) / 180),
});

// Strands of the ribbon, back to front: broad translucent veils, then fine
// gold and white threads, then the bright core. Each follows the spine
// displaced by (dx, dy) — wide apart low down — and then circles twice round
// its own ring (radius R + dr, centre nudged by ox/oy), so as the light flows
// in, the strands swirl round the centre at slightly different radii.
type Strand = { dx: number; dy: number; dr: number; ox: number; oy: number; width: number; color: string; opacity: number };
const STRANDS: Strand[] = [
  { dx: 48, dy: 14, dr: 18, ox: 4, oy: 3, width: 84, color: SAGE, opacity: 0.07 },
  { dx: -38, dy: -10, dr: -12, ox: -3, oy: 2, width: 52, color: GREEN_LIGHT, opacity: 0.1 },
  { dx: 22, dy: 7, dr: 9, ox: -2, oy: -3, width: 28, color: SOFT_WHITE, opacity: 0.12 },
  { dx: -18, dy: -5, dr: 24, ox: 3, oy: -2, width: 2.4, color: GOLD, opacity: 0.75 },
  { dx: 12, dy: 4, dr: -18, ox: -2, oy: 2, width: 1.4, color: SOFT_WHITE, opacity: 0.6 },
  { dx: 32, dy: 10, dr: 5, ox: 2, oy: 4, width: 1, color: GOLD, opacity: 0.5 },
  { dx: 0, dy: 0, dr: 0, ox: 0, oy: 0, width: 3.2, color: 'url(#splashCore)', opacity: 0.95 },
  { dx: 0, dy: 0, dr: 0, ox: 0, oy: 0, width: 1.2, color: SOFT_WHITE, opacity: 0.9 },
];
const STRAND_GEOMETRY = STRANDS.map((s) => {
  const r = R + s.dr;
  const cx = CX + s.ox;
  const cy = CY + s.oy;
  const shift = { x: s.ox, y: s.oy - s.dr };
  const pts = SPINE.map((p, i) => ({
    x: p.x + s.dx * TAPER[i] + shift.x * (1 - TAPER[i]),
    y: p.y + s.dy * TAPER[i] + shift.y * (1 - TAPER[i]),
  }));
  const [a, b] = segments(pts);
  const sLength = cubicLength(a) + cubicLength(b);
  const loop = `A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
  const d = `M ${pts[0].x} ${pts[0].y} C ${pts[1].x} ${pts[1].y} ${pts[2].x} ${pts[2].y} ${pts[3].x} ${pts[3].y} C ${pts[4].x} ${pts[4].y} ${pts[5].x} ${pts[5].y} ${pts[6].x} ${pts[6].y} ${loop} ${loop}`;
  return { d, sLength, total: sLength + 2 * 2 * Math.PI * r };
});
const CORE = STRAND_GEOMETRY[STRAND_GEOMETRY.length - 1];
const CIRCUMFERENCE = 2 * Math.PI * R;
// Clean ring, from the top, clockwise — drawn by the core as it passes.
const RING_D = `M ${CX} ${CY - R} A ${R} ${R} 0 1 1 ${CX} ${CY + R} A ${R} ${R} 0 1 1 ${CX} ${CY - R}`;
const HEAD = 18; // bright head of the moving light
const SWEEP = CIRCUMFERENCE * 0.18; // final shimmer on the ring
const GAP = 4000; // keeps repeated dashes off the paths
const FLARE = ringPoint(-52); // gold highlight on the ring, top right

// The existing chevron mark (same proportions as the app icon), centred in
// the ring.
const APEX = { x: CX, y: CY - 0.5 * R };
const FOOT_L = { x: CX - 0.57 * R, y: CY + 0.48 * R };
const FOOT_R = { x: CX + 0.57 * R, y: CY + 0.48 * R };
const MARK_D = `M ${FOOT_L.x} ${FOOT_L.y} L ${APEX.x} ${APEX.y} L ${FOOT_R.x} ${FOOT_R.y}`;
const MARK_LENGTH = Math.hypot(APEX.x - FOOT_L.x, APEX.y - FOOT_L.y) * 2;
const MARK_STROKE = 14;
// [stroke width, opacity] layers of the soft glow the mark emerges from.
const HAZE: [number, number][] = [
  [MARK_STROKE * 3.4, 0.05],
  [MARK_STROKE * 2.4, 0.08],
  [MARK_STROKE * 1.6, 0.12],
];

// Fine sparkles: along the S as the light passes, then round the ring while
// it forms. { x, y, colour, appear-at ms, size }.
const SPARKS = [
  ...[0.12, 0.2, 0.28, 0.36, 0.42, 0.47, 0.52, 0.58, 0.64, 0.72, 0.8, 0.88].map((u, i) => {
    const p = spineAt(u);
    const side = (i % 2 ? -1 : 1) * (10 + ((i * 7) % 22));
    return { x: p.x + side, y: p.y - side * 0.4, color: i % 3 ? GOLD : SOFT_WHITE, at: 60 + u * 650, size: i % 4 === 0 ? 2.6 : 1.8 };
  }),
  ...[200, 235, 260, 300, 340, 20, 60, 110, 150].map((deg, i) => {
    const p = ringPoint(deg, R + 14 + ((i * 9) % 20));
    return { x: p.x, y: p.y, color: i % 2 ? GOLD : SOFT_WHITE, at: 850 + i * 60, size: i % 3 === 0 ? 2.4 : 1.6 };
  }),
];

// Copy and the horizon glow, in stage coordinates.
const COPY_TOP = CY + R + 34;
const HORIZON_Y = 690;

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
  const { width, height } = useWindowDimensions();
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
        heart: 0,
        swirlGlow: 0,
        strandsOut: 0,
        flare: 1,
        markHaze: 0.5,
        markIn: 1,
        markScale: 1,
        breath: 1,
        nameIn: 1,
        nameY: 0,
        tagIn: 1,
        horizon: 1,
        horizonY: 0,
      } as const;
    }
    return {
      reduced: false,
      all: 1,
      field: at([0, 450], [0, 1]),
      // Gold heart of the S while the ribbon is whole.
      heart: at([300, 700, 1150], [0, 0.9, 0]),
      // Gold glows on the swirling arcs as the ring forms.
      swirlGlow: at([850, 1200, 1700], [0, 0.7, 0]),
      // The swirling strands dissolve, leaving one clean ring.
      strandsOut: at([1350, 1850], [1, 0]),
      flare: at([1500, 1850, 2800, 3000, 3200], [0, 1, 1, 1.35, 1]),
      // The Λ emerges from the same light: a soft haze, then the sharp mark
      // draws through it and settles.
      markHaze: at([1200, 1500, 2000, 2250, 2500], [0, 1, 0.5, 0.7, 0.5]),
      markIn: at([1300, 1600], [0, 1], out),
      markScale: at([1300, 2000], [0.94, 1], out),
      breath: at([2000, 2250, 2500], [1, 1.01, 1]),
      nameIn: at([2000, 2500], [0, 1], out),
      nameY: at([2000, 2500], [8, 0], out),
      tagIn: at([2350, 2700], [0, 1], out),
      horizon: at([2300, 2800, 3200], [0, 0.75, 1], out),
      horizonY: at([2700, 3200], [0, -30], out),
    } as const;
  }, [at, reduceMotion]);

  const strokes = useMemo(() => {
    // One progress value drives every strand from the bottom of its S to the
    // end of its second loop, so they move together.
    const q = svgAt([60, 1550], [0, 1], Easing.inOut(Easing.cubic));
    const lin = Easing.linear;
    const byQ = (inRange: number[], outRange: number[]) =>
      q.interpolate({ inputRange: inRange, outputRange: outRange, extrapolate: 'clamp' });
    const coreEntry = CORE.sLength / CORE.total;
    const coreRingDone = (CORE.sLength + CIRCUMFERENCE) / CORE.total;
    return {
      // Each strand shows a dash as long as its S, sliding along: the whole S
      // is lit when the light reaches the ring, then its tail follows the
      // head round, leaving swirling arcs.
      strands: STRAND_GEOMETRY.map(({ sLength, total }) => byQ([0, 1], [sLength, sLength - total])),
      head: byQ([0, 1], [HEAD, HEAD - CORE.total]),
      ring: byQ([0, coreEntry, coreRingDone], [CIRCUMFERENCE, CIRCUMFERENCE, 0]),
      headOpacity: svgAt([0, 60, 1350, 1600], [0, 1, 1, 0], lin),
      haze: svgAt([1200, 1600], [MARK_LENGTH, 0], Easing.inOut(Easing.cubic)),
      mark: svgAt([1300, 1850], [MARK_LENGTH, 0], Easing.inOut(Easing.cubic)),
      sweep: svgAt([2750, 3150], [SWEEP - CIRCUMFERENCE * 0.02, SWEEP - CIRCUMFERENCE * 0.55], Easing.inOut(Easing.quad)),
      sweepOpacity: svgAt([2750, 2900, 3150], [0, 0.7, 0], lin),
    };
  }, [svgAt]);

  const reduced = view.reduced;
  // Scale the stage to cover the screen, centred.
  const scale = Math.max(width / SW, height / SH);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: FIELD, opacity: exitOpacity }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading ${BRAND.wordmark}`}
    >
      <StatusBar style="light" />

      {/* Atmosphere: forest green, lit softly from above, darker at the edges,
          with a few faint out-of-focus highlights. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.field }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="splashField" cx="50%" cy="32%" rx="85%" ry="70%">
              <Stop offset="0" stopColor="#2C5A36" />
              <Stop offset="0.25" stopColor="#22492C" />
              <Stop offset="0.5" stopColor="#183A23" />
              <Stop offset="0.75" stopColor="#11301D" />
              <Stop offset="1" stopColor="#0A2215" />
            </RadialGradient>
            <RadialGradient id="splashSky" cx="50%" cy="0%" rx="62%" ry="42%">
              <Stop offset="0" stopColor={LIME_GOLD} stopOpacity={0.18} />
              <Stop offset="0.5" stopColor={LIME_GOLD} stopOpacity={0.06} />
              <Stop offset="1" stopColor={LIME_GOLD} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="splashVignette" cx="50%" cy="42%" rx="75%" ry="70%">
              <Stop offset="0.55" stopColor="#04110A" stopOpacity={0} />
              <Stop offset="0.8" stopColor="#04110A" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#04110A" stopOpacity={0.55} />
            </RadialGradient>
            <RadialGradient id="splashBokeh">
              <Stop offset="0" stopColor="#E6EFC0" stopOpacity={0.07} />
              <Stop offset="1" stopColor="#E6EFC0" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashField)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashSky)" />
          <Circle cx="28%" cy="10%" r="16%" fill="url(#splashBokeh)" />
          <Circle cx="74%" cy="7%" r="12%" fill="url(#splashBokeh)" />
          <Circle cx="60%" cy="19%" r="8%" fill="url(#splashBokeh)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#splashVignette)" />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          styles.stage,
          { left: (width - SW) / 2, top: (height - SH) / 2, opacity: view.all, transform: [{ scale }] },
        ]}
        pointerEvents="none"
      >
        {/* Gold heart of the S, and gold glows on the swirls. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.heart }]}>
          <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
            <Defs>
              <RadialGradient id="splashGold">
                <Stop offset="0" stopColor={GOLD} stopOpacity={0.55} />
                <Stop offset="0.4" stopColor={GOLD} stopOpacity={0.18} />
                <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={SPINE[3].x} cy={SPINE[3].y} rx={120} ry={90} fill="url(#splashGold)" />
          </Svg>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.swirlGlow }]}>
          <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
            <Defs>
              <RadialGradient id="splashSwirlGold">
                <Stop offset="0" stopColor={GOLD} stopOpacity={0.5} />
                <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={ringPoint(205, R + 10).x} cy={ringPoint(205, R + 10).y} r={60} fill="url(#splashSwirlGold)" />
            <Circle cx={ringPoint(25, R + 10).x} cy={ringPoint(25, R + 10).y} r={50} fill="url(#splashSwirlGold)" />
          </Svg>
        </Animated.View>

        {/* Fine sparkles. */}
        {SPARKS.map((m) => (
          <Animated.View
            key={`${m.x}-${m.y}`}
            style={[
              styles.spark,
              {
                left: m.x - m.size / 2,
                top: m.y - m.size / 2,
                width: m.size,
                height: m.size,
                borderRadius: m.size / 2,
                backgroundColor: m.color,
                opacity: reduced ? 0 : at([m.at, m.at + 150, m.at + 700], [0, 0.9, 0]),
                transform: [{ translateY: reduced ? 0 : at([m.at, m.at + 700], [0, -10]) }],
              },
            ]}
          />
        ))}

        {/* The ribbon: silky strands that swirl into the ring. */}
        {!reduced ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.strandsOut }]}>
            <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
              <Defs>
                <LinearGradient id="splashCore" gradientUnits="userSpaceOnUse" x1={SPINE[0].x} y1={SPINE[0].y} x2={CX} y2={CY - R}>
                  <Stop offset="0" stopColor={SAGE} />
                  <Stop offset="0.5" stopColor={GOLD} />
                  <Stop offset="1" stopColor={SOFT_WHITE} />
                </LinearGradient>
              </Defs>
              {STRANDS.map((s, i) => (
                <AnimatedPath
                  key={`strand-${i}`}
                  d={STRAND_GEOMETRY[i].d}
                  stroke={s.color}
                  strokeOpacity={s.opacity}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={[STRAND_GEOMETRY[i].sLength, GAP]}
                  strokeDashoffset={strokes.strands[i]}
                />
              ))}
              <AnimatedPath d={CORE.d} stroke={SOFT_WHITE} strokeWidth={3.6} strokeLinecap="round" fill="none" opacity={strokes.headOpacity} strokeDasharray={[HEAD, GAP]} strokeDashoffset={strokes.head} />
            </Svg>
          </Animated.View>
        ) : null}

        {/* The clean ring, drawn by the core light; flare and final shimmer. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: view.breath }] }]}>
          <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
            <Defs>
              <LinearGradient id="splashRing" gradientUnits="userSpaceOnUse" x1={CX + R} y1={CY - R} x2={CX - R} y2={CY + R}>
                <Stop offset="0" stopColor={GOLD} />
                <Stop offset="1" stopColor={RING_GREEN} />
              </LinearGradient>
            </Defs>
            <AnimatedPath d={RING_D} stroke={LIME_GOLD} strokeOpacity={0.16} strokeWidth={9} strokeLinecap="round" fill="none" strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.ring} />
            <AnimatedPath d={RING_D} stroke="url(#splashRing)" strokeWidth={2.4} strokeLinecap="round" fill="none" strokeDasharray={[CIRCUMFERENCE, GAP]} strokeDashoffset={reduced ? 0 : strokes.ring} />
            {!reduced ? (
              <AnimatedPath d={RING_D} stroke={GOLD} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={strokes.sweepOpacity} strokeDasharray={[SWEEP, GAP]} strokeDashoffset={strokes.sweep} />
            ) : null}
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.flare }]}>
            <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
              <Defs>
                <RadialGradient id="splashFlare">
                  <Stop offset="0" stopColor={SOFT_WHITE} stopOpacity={0.95} />
                  <Stop offset="0.2" stopColor={GOLD} stopOpacity={0.6} />
                  <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={FLARE.x} cy={FLARE.y} r={22} fill="url(#splashFlare)" />
            </Svg>
          </Animated.View>
        </Animated.View>

        {/* The Λ: haze → sharp, drawn inside the ring. */}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: view.breath }] }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.markHaze }]}>
            <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
              {/* Stacked soft strokes stand in for a blur; they draw just ahead of the sharp mark. */}
              {HAZE.map(([w, o]) => (
                <AnimatedPath
                  key={w}
                  d={MARK_D}
                  stroke={GOLD}
                  strokeOpacity={o}
                  strokeWidth={w}
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
            <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
              <Defs>
                <LinearGradient id="splashMark" gradientUnits="userSpaceOnUse" x1={0} y1={APEX.y} x2={0} y2={FOOT_L.y}>
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="1" stopColor="#D5E4CC" />
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

        {/* Gold horizon line low on the screen. */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.horizon, transform: [{ translateY: view.horizonY }] }]}>
          <Svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`}>
            <Defs>
              <RadialGradient id="splashHorizonGlow" cx={CX} cy={HORIZON_Y} rx={160} ry={22} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={GOLD} stopOpacity={0.3} />
                <Stop offset="0.5" stopColor={GOLD} stopOpacity={0.08} />
                <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
              </RadialGradient>
              <LinearGradient id="splashHorizonLine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={GOLD} stopOpacity={0} />
                <Stop offset="0.5" stopColor={GOLD} stopOpacity={0.85} />
                <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
              </LinearGradient>
              <RadialGradient id="splashHorizonCore">
                <Stop offset="0" stopColor={SOFT_WHITE} stopOpacity={0.9} />
                <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={CX} cy={HORIZON_Y} rx={160} ry={22} fill="url(#splashHorizonGlow)" />
            <Rect x={CX - 120} y={HORIZON_Y - 0.75} width={240} height={1.5} fill="url(#splashHorizonLine)" />
            <Ellipse cx={CX} cy={HORIZON_Y} rx={30} ry={5} fill="url(#splashHorizonCore)" />
          </Svg>
        </Animated.View>

        <View style={styles.copy}>
          <Animated.View style={{ opacity: view.nameIn, transform: [{ translateY: view.nameY }] }}>
            <Text style={styles.name} accessibilityRole="header">
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
  stage: { position: 'absolute', width: SW, height: SH },
  spark: { position: 'absolute' },
  copy: { position: 'absolute', left: 0, right: 0, top: COPY_TOP, alignItems: 'center' },
  name: { color: SOFT_WHITE, fontSize: 34, lineHeight: 42, fontWeight: '500', letterSpacing: 0.2, textAlign: 'center', marginBottom: 10 },
  nameAccent: { color: LIME_GOLD, fontWeight: '600' },
  tagline: {
    color: 'rgba(246, 249, 239, 0.8)',
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: 2.8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});

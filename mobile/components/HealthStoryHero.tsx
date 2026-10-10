import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { FOREST } from '../design/brandSurface';

/**
 * Welcome's hero: the AneviaONE story in three timed scenes that loop.
 *
 *   0–3 s  COLLECT     health records flow into view as translucent layers:
 *                      a record arcs in from the left, a verified one from
 *                      the right, and both settle onto one glowing stack
 *   3–6 s  CONNECT     a luminous line draws across from the documents to
 *                      each health marker; a gold pulse travels the markers
 *                      and the final one glows gold
 *   6–9 s  UNDERSTAND  streams converge on a gauge, its needle sweeps, and
 *                      the final milestone glows gold
 *
 * Icons and shapes only — no values, dates, names, readings or claims, so
 * nothing in it can be read as someone's data. Decorative: hidden from
 * screen readers.
 *
 * Motion: one clock in SECONDS (`t`, 0 → 9, looping) drives every layer
 * through opacity/transform interpolations on the native driver — no
 * animation library, no per-frame JS. Scenes crossfade over 0.35 s.
 * `playing` starts the loop (Welcome passes it once the splash has gone);
 * `still` (Reduce Motion) shows the settled CONNECT scene with nothing moving.
 *
 * Drawn on a 390 × 240 stage, scaled to fit its box and sat on the box's
 * bottom edge, so it rests just above the sign-in sheet.
 */

const STAGE_W = 390;
const STAGE_H = 240;
const LOOP_S = 9;
const FADE = 0.35;
/** Reduce Motion: CONNECT, line drawn, the pulse home and the final marker gold. */
const STILL_T = 5.5;

const EMERALD = '#3FD39A';
const MINT = '#A8F0CF';
const BRIGHT = '#E9FFF5';
const GOLD = FOREST.gold;
// Reference palette per scene: CONNECT's blue → cyan line and coloured markers; UNDERSTAND's cyan streams.
const BLUE = '#3D8BFF';
const CYAN = '#4FD8F0';
const ROSE = '#FF5C74';
const AMBER = '#FFB347';
const MARKER_COLORS = [ROSE, BLUE, GOLD];

type Point = { x: number; y: number };
type Cubic = [Point, Point, Point, Point];

function cubic([p0, p1, p2, p3]: Cubic, s: number): Point {
  const u = 1 - s;
  return {
    x: u * u * u * p0.x + 3 * u * u * s * p1.x + 3 * u * s * s * p2.x + s * s * s * p3.x,
    y: u * u * u * p0.y + 3 * u * u * s * p1.y + 3 * u * s * s * p2.y + s * s * s * p3.y,
  };
}

// ---------------------------------------------------------------- COLLECT --
const STACK_X = 135;
const STACK_W = 120;
const LEFT_CARD = { x: 30, y: 40, w: 70, h: 50 };
const RIGHT_CARD = { x: 292, y: 30, w: 70, h: 50 };
const STACK_TOP: Point = { x: 195, y: 150 };
const centre = (c: { x: number; y: number; w: number; h: number }): Point => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

// ---------------------------------------------------------------- CONNECT --
// A gently flowing, mostly level line through three health markers.
const LINE_START: Point = { x: 86, y: 166 };
const MARKERS: Point[] = [
  { x: 152, y: 156 },
  { x: 242, y: 150 },
  { x: 332, y: 146 },
];
const SEGMENTS: Cubic[] = [
  [LINE_START, { x: 108, y: 164 }, { x: 128, y: 154 }, MARKERS[0]],
  [MARKERS[0], { x: 182, y: 162 }, { x: 208, y: 138 }, MARKERS[1]],
  [MARKERS[1], { x: 276, y: 160 }, { x: 300, y: 134 }, MARKERS[2]],
  [MARKERS[2], { x: 356, y: 152 }, { x: 380, y: 148 }, { x: 400, y: 150 }],
];
const LINE = `M ${LINE_START.x} ${LINE_START.y} ${SEGMENTS.map(([, a, b, c]) => `C ${a.x} ${a.y} ${b.x} ${b.y} ${c.x} ${c.y}`).join(' ')}`;
const DRAW_FROM = 3.3;
const DRAW_TO = 4.5;
/** Seconds at which the drawing line reaches a given x. */
const reachedAt = (x: number) => DRAW_FROM + (DRAW_TO - DRAW_FROM) * (x / STAGE_W);
// Gold pulse: from the first marker to the last.
const PULSE_FROM = 4.55;
const PULSE_TO = 5.4;
const PULSE_POINTS = [
  ...Array.from({ length: 6 }, (_, i) => cubic(SEGMENTS[1], i / 6)),
  ...Array.from({ length: 7 }, (_, i) => cubic(SEGMENTS[2], i / 6)),
];
const PULSE_AT = PULSE_POINTS.map((_, i) => PULSE_FROM + ((PULSE_TO - PULSE_FROM) * i) / (PULSE_POINTS.length - 1));

// ------------------------------------------------------------- UNDERSTAND --
const GAUGE: Point = { x: 195, y: 196 };
const GAUGE_R = 66;
const NEEDLE_LEN = 52;
/** Where the needle settles (degrees from straight up), and the arc point it lights. */
const NEEDLE_REST = 38;
const NEEDLE_TIP: Point = {
  x: GAUGE.x + GAUGE_R * Math.sin((NEEDLE_REST * Math.PI) / 180),
  y: GAUGE.y - GAUGE_R * Math.cos((NEEDLE_REST * Math.PI) / 180),
};

export function HealthStoryHero({ playing = false, still = false, testID }: { playing?: boolean; still?: boolean; testID?: string }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [t] = useState(() => new Animated.Value(still ? STILL_T : 0));

  useEffect(() => {
    if (still) {
      t.stopAnimation();
      t.setValue(STILL_T);
      return undefined;
    }
    if (!playing) return undefined;
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: LOOP_S, duration: LOOP_S * 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [playing, still, t]);

  // Fit the stage inside the box, centred across and resting on its floor.
  const scale = box.w && box.h ? Math.min(box.w / STAGE_W, box.h / STAGE_H) : 0;
  const stage = { width: STAGE_W * scale, height: STAGE_H * scale, left: (box.w - STAGE_W * scale) / 2, top: box.h - STAGE_H * scale };

  const m = useMemo(() => storyMotion(t, scale), [t, scale]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID={testID}
    >
      {scale > 0 ? (
        <View style={[styles.stage, stage]}>
          <Layer>
            <Defs>
              <RadialGradient id="heroField">
                <Stop offset="0" stopColor={EMERALD} stopOpacity={0.12} />
                <Stop offset="1" stopColor={EMERALD} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="195" cy="150" r="180" fill="url(#heroField)" />
          </Layer>

          {/* 1 · COLLECT (0–3 s) */}
          <Animated.View style={[StyleSheet.absoluteFill, m.collect]} testID="hero-scene-collect">
            <Animated.View style={[StyleSheet.absoluteFill, m.arrows]}>
              <CollectArrows />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, m.stackGlow]}>
              <Glow at={{ x: 195, y: 172 }} r={95} color={EMERALD} o={0.35} id="heroStackGlow" />
            </Animated.View>
            {[0, 1, 2].map((i) => (
              <Animated.View key={i} style={[StyleSheet.absoluteFill, m.plate(i)]}>
                <Plate i={i} />
              </Animated.View>
            ))}
            <Animated.View style={[StyleSheet.absoluteFill, m.stackCard]}>
              <StackCard />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, m.leftCard]}>
              <IncomingRecord />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, m.rightCard]}>
              <VerifiedRecord />
            </Animated.View>
          </Animated.View>

          {/* 2 · CONNECT (3–6 s) */}
          <Animated.View style={[StyleSheet.absoluteFill, m.connect]} testID="hero-scene-connect">
            <Animated.View style={[StyleSheet.absoluteFill, m.pdf]}>
              <PdfStack />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.clip, m.revealOuter]}>
              <Animated.View style={[StyleSheet.absoluteFill, m.revealInner]}>
                <ConnectLine />
              </Animated.View>
            </Animated.View>
            {MARKERS.map((p, i) => (
              <Animated.View key={p.x} style={[StyleSheet.absoluteFill, m.marker(i)]}>
                <Marker at={p} i={i} />
              </Animated.View>
            ))}
            <Animated.View style={[StyleSheet.absoluteFill, m.finalGold]}>
              <Glow at={MARKERS[2]} r={22} color={GOLD} o={0.6} id="heroFinalNode" />
              <Glow at={{ x: MARKERS[2].x, y: MARKERS[2].y - 36 }} r={30} color={GOLD} o={0.45} id="heroFinalIcon" />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, m.pulse]}>
              <Glow at={MARKERS[0]} r={15} color={GOLD} o={0.85} id="heroPulse" />
              <Layer>
                <Circle cx={MARKERS[0].x} cy={MARKERS[0].y} r={3.6} fill={GOLD} />
              </Layer>
            </Animated.View>
          </Animated.View>

          {/* 3 · UNDERSTAND OVER TIME (6–9 s) */}
          <Animated.View style={[StyleSheet.absoluteFill, m.understand]} testID="hero-scene-understand">
            <Animated.View style={[StyleSheet.absoluteFill, m.streamsLeft]}>
              <Streams side="left" />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, m.streamsRight]}>
              <Streams side="right" />
            </Animated.View>
            {[0, 1, 2, 3].map((i) => (
              <Animated.View key={i} style={[StyleSheet.absoluteFill, m.tile(i)]}>
                <Tile i={i} />
              </Animated.View>
            ))}
            <Animated.View style={[StyleSheet.absoluteFill, m.gauge]}>
              <GaugeDial />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, m.goldMilestone]}>
              <Glow at={NEEDLE_TIP} r={24} color={GOLD} o={0.7} id="heroGaugeGold" />
              <Glow at={{ x: 294, y: 226 }} r={40} color={GOLD} o={0.4} id="heroPedestalGold" />
            </Animated.View>
            <Animated.View style={m.needle}>
              <Needle />
            </Animated.View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

/** Every moving part, as interpolations of the one clock (seconds). */
function storyMotion(t: Animated.Value, scale: number) {
  const width = STAGE_W * scale;
  const at = (inputRange: number[], outputRange: number[]) => t.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const px = (inputRange: number[], outputRange: number[]) => at(inputRange, outputRange.map((v) => v * scale));
  const show = (from: number, dur = 0.35) => at([from, from + dur], [0, 1]);
  const rise = (from: number, dy = 10, dur = 0.35) => ({ opacity: show(from, dur), transform: [{ translateY: px([from, from + dur], [dy, 0]) }] });

  // A card arcs from where it starts onto the top of the stack, fading as it lands.
  const incoming = (card: { x: number; y: number; w: number; h: number }, from: number, to: number, lift: number) => {
    const c = centre(card);
    const dx = STACK_TOP.x - c.x;
    const dy = STACK_TOP.y - c.y;
    const mid = (from + to) / 2;
    return {
      opacity: at([from - 0.3, from, to - 0.2, to + 0.05], [0, 1, 1, 0]),
      transform: [
        { translateX: px([from, mid, to], [0, dx * 0.5, dx]) },
        { translateY: px([from, mid, to], [0, dy * 0.5 - lift, dy]) },
      ],
    };
  };

  return {
    // Scene windows, crossfading; 9 ≡ 0, so the loop is seamless.
    collect: { opacity: at([0, FADE, 3 - FADE, 3], [0, 1, 1, 0]) },
    connect: { opacity: at([3 - FADE, 3, 6 - FADE, 6], [0, 1, 1, 0]) },
    understand: { opacity: at([6 - FADE, 6, LOOP_S - FADE, LOOP_S], [0, 1, 1, 0]) },

    // COLLECT
    arrows: { opacity: at([0.4, 0.8, 2.2, 2.5], [0, 0.9, 0.9, 0]) },
    plate: (i: number) => rise(0.15 + i * 0.22, -14),
    stackCard: rise(0.85, -16, 0.4),
    leftCard: incoming(LEFT_CARD, 0.7, 1.9, 24),
    rightCard: incoming(RIGHT_CARD, 1.1, 2.3, 30),
    stackGlow: { opacity: at([1.8, 2.3, 2.75], [0, 1, 0.6]) },

    // CONNECT
    pdf: rise(3.05, 8),
    revealOuter: { transform: [{ translateX: at([DRAW_FROM, DRAW_TO], [-width, 0]) }] },
    revealInner: { transform: [{ translateX: at([DRAW_FROM, DRAW_TO], [width, 0]) }] },
    marker: (i: number) => rise(reachedAt(MARKERS[i].x) - 0.1, 8),
    pulse: {
      opacity: at([PULSE_FROM - 0.1, PULSE_FROM, PULSE_TO, PULSE_TO + 0.15], [0, 1, 1, 0]),
      transform: [
        { translateX: px(PULSE_AT, PULSE_POINTS.map((p) => p.x - MARKERS[0].x)) },
        { translateY: px(PULSE_AT, PULSE_POINTS.map((p) => p.y - MARKERS[0].y)) },
      ],
    },
    finalGold: { opacity: at([PULSE_TO - 0.1, PULSE_TO + 0.15], [0, 1]) },

    // UNDERSTAND
    streamsLeft: { opacity: at([6.1, 6.7], [0, 1]), transform: [{ translateX: px([6.1, 6.9], [-14, 0]) }] },
    streamsRight: { opacity: at([6.2, 6.8], [0, 1]), transform: [{ translateX: px([6.2, 7.0], [14, 0]) }] },
    tile: (i: number) => rise(6.5 + i * 0.15, 8),
    gauge: rise(6.15, 10, 0.4),
    // The needle's view is centred on the gauge pivot, so a plain rotation turns it about the pivot.
    needle: {
      position: 'absolute' as const,
      left: (GAUGE.x - NEEDLE_LEN) * scale,
      top: (GAUGE.y - NEEDLE_LEN) * scale,
      width: NEEDLE_LEN * 2 * scale,
      height: NEEDLE_LEN * 2 * scale,
      opacity: show(6.3, 0.25),
      transform: [{ rotate: t.interpolate({ inputRange: [6.4, 7.45, 7.75], outputRange: ['-70deg', `${NEEDLE_REST + 7}deg`, `${NEEDLE_REST}deg`], extrapolate: 'clamp' }) }],
    },
    goldMilestone: { opacity: at([7.55, 8.0, 8.65], [0, 1, 0.85]) },
  };
}

// ------------------------------------------------------------- primitives --

/** One full-stage SVG layer. */
function Layer({ children }: { children: React.ReactNode }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
      {children}
    </Svg>
  );
}

function Glow({ at, r, color, o, id }: { at: Point; r: number; color: string; o: number; id: string }) {
  return (
    <Layer>
      <Defs>
        <RadialGradient id={id}>
          <Stop offset="0" stopColor={color} stopOpacity={o} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={at.x} cy={at.y} r={r} fill={`url(#${id})`} />
    </Layer>
  );
}

const TextLine = ({ x1, x2, y, o = 0.5, color = FOREST.ivory }: { x1: number; x2: number; y: number; o?: number; color?: string }) => (
  <Line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeOpacity={o} strokeWidth={2} strokeLinecap="round" />
);

const ICON = { stroke: BRIGHT, strokeOpacity: 0.92, strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

// ---------------------------------------------------------------- COLLECT --

function CollectArrows() {
  return (
    <Layer>
      <Path d="M 98 54 Q 150 34 170 108" stroke={GOLD} strokeOpacity={0.75} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M 163 100 L 170 110 L 176 99" stroke={GOLD} strokeOpacity={0.75} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M 292 48 Q 240 30 222 108" stroke={GOLD} strokeOpacity={0.75} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <Path d="M 215 99 L 222 110 L 229 100" stroke={GOLD} strokeOpacity={0.75} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Layer>
  );
}

/** A translucent layer of the stack; the middle one is gold-edged. */
function Plate({ i }: { i: number }) {
  const y = 206 - i * 13;
  const gold = i !== 0;
  return (
    <Layer>
      <Rect x={STACK_X} y={y} width={STACK_W} height={10} rx={4} fill={gold ? GOLD : FOREST.ivory} fillOpacity={gold ? 0.32 : 0.12} stroke={gold ? GOLD : MINT} strokeOpacity={0.6} />
    </Layer>
  );
}

/** The top of the stack: a glass record. */
function StackCard() {
  return (
    <Layer>
      <Rect x={STACK_X + 6} y={124} width={STACK_W - 12} height={52} rx={9} fill={FOREST.ivory} fillOpacity={0.12} stroke={MINT} strokeOpacity={0.75} />
      <Line x1={STACK_X + 18} y1={125} x2={STACK_X + STACK_W - 18} y2={125} stroke={FOREST.ivory} strokeOpacity={0.45} />
      <TextLine x1={160} x2={208} y={140} o={0.65} />
      <TextLine x1={160} x2={196} y={150} o={0.45} />
      <TextLine x1={160} x2={188} y={160} o={0.35} />
      <TextLine x1={212} x2={232} y={160} o={0.9} color={GOLD} />
    </Layer>
  );
}

/** A record arriving from the left, shedding light particles behind it. */
function IncomingRecord() {
  const { x, y, w, h } = LEFT_CARD;
  return (
    <Layer>
      {[
        [x - 6, y + 12, 1.6],
        [x - 14, y + 22, 1.2],
        [x - 8, y + 34, 1.4],
        [x - 20, y + 30, 1],
        [x - 4, y + 44, 1.1],
      ].map(([cx, cy, r]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={MINT} fillOpacity={0.6} />
      ))}
      <G transform={`rotate(-10 ${x + w / 2} ${y + h / 2})`}>
        <Rect x={x} y={y} width={w} height={h} rx={8} fill={FOREST.ivory} fillOpacity={0.14} stroke={FOREST.ivory} strokeOpacity={0.5} />
        <TextLine x1={x + 12} x2={x + 48} y={y + 16} o={0.6} />
        <TextLine x1={x + 12} x2={x + 40} y={y + 26} o={0.45} />
        <TextLine x1={x + 12} x2={x + 52} y={y + 36} o={0.35} />
      </G>
    </Layer>
  );
}

/** A verified record arriving from the right. */
function VerifiedRecord() {
  const { x, y, w, h } = RIGHT_CARD;
  return (
    <Layer>
      <G transform={`rotate(8 ${x + w / 2} ${y + h / 2})`}>
        <Rect x={x} y={y} width={w} height={h} rx={8} fill={FOREST.ivory} fillOpacity={0.92} />
        <TextLine x1={x + 12} x2={x + 46} y={y + 14} o={0.6} color={FOREST.field} />
        <TextLine x1={x + 12} x2={x + 40} y={y + 23} o={0.4} color={EMERALD} />
        <TextLine x1={x + 12} x2={x + 34} y={y + 32} o={0.4} color={FOREST.field} />
        <Path d={`M ${x + 46} ${y + 34} L ${x + 51} ${y + 39} L ${x + 60} ${y + 28}`} stroke={GOLD} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </G>
    </Layer>
  );
}

// ---------------------------------------------------------------- CONNECT --

/** The person's documents, where the line begins. */
function PdfStack() {
  return (
    <Layer>
      {[0, 1, 2].map((i) => (
        <Rect key={i} x={22 + i * 6} y={110 - i * 6} width={46} height={60} rx={6} fill={FOREST.ivory} fillOpacity={0.1 + i * 0.05} stroke={MINT} strokeOpacity={0.35 + i * 0.15} />
      ))}
      <Rect x={34} y={104} width={46} height={60} rx={6} fill={FOREST.ivory} fillOpacity={0.9} />
      <TextLine x1={42} x2={70} y={116} o={0.5} color={FOREST.field} />
      <TextLine x1={42} x2={64} y={124} o={0.35} color={FOREST.field} />
      <Rect x={38} y={134} width={26} height={13} rx={3} fill="#D9534F" />
      <SvgText x={51} y={144} fontSize={8} fontWeight="700" fill="#FFFFFF" textAnchor="middle">
        PDF
      </SvgText>
      <TextLine x1={42} x2={72} y={155} o={0.3} color={FOREST.field} />
      {/* The documents' base glows where the line leaves them. */}
      <Ellipse cx={56} cy={174} rx={40} ry={6} fill={EMERALD} fillOpacity={0.25} />
    </Layer>
  );
}

function ConnectLine() {
  return (
    <Layer>
      <Defs>
        <LinearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={BLUE} stopOpacity={0.8} />
          <Stop offset="0.55" stopColor={CYAN} stopOpacity={1} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      <Path d={LINE} stroke={CYAN} strokeOpacity={0.12} strokeWidth={22} strokeLinecap="round" fill="none" />
      <Path d={LINE} stroke={BLUE} strokeOpacity={0.3} strokeWidth={7} strokeLinecap="round" fill="none" />
      <Path d={LINE} stroke="url(#heroLine)" strokeWidth={2.2} strokeLinecap="round" fill="none" />
    </Layer>
  );
}

/** A health marker: its node on the line, an icon above, a plain chip below (no values). */
function Marker({ at, i }: { at: Point; i: number }) {
  const color = MARKER_COLORS[i];
  const iy = at.y - 36;
  // Hearts for the first two markers (as in the reference), a gold spark for the last.
  const heart = `M ${at.x} ${iy + 6} C ${at.x - 9} ${iy} ${at.x - 7} ${iy - 7} ${at.x - 3} ${iy - 6} C ${at.x - 1} ${iy - 6} ${at.x} ${iy - 4} ${at.x} ${iy - 3.5} C ${at.x} ${iy - 4} ${at.x + 1} ${iy - 6} ${at.x + 3} ${iy - 6} C ${at.x + 7} ${iy - 7} ${at.x + 9} ${iy} ${at.x} ${iy + 6} Z`;
  const spark = `M ${at.x} ${iy - 8} Q ${at.x + 1} ${iy - 1} ${at.x + 8} ${iy} Q ${at.x + 1} ${iy + 1} ${at.x} ${iy + 8} Q ${at.x - 1} ${iy + 1} ${at.x - 8} ${iy} Q ${at.x - 1} ${iy - 1} ${at.x} ${iy - 8} Z`;
  const bar = at.x - 22;
  return (
    <Layer>
      <Defs>
        <RadialGradient id={`heroMarkerGlow${i}`}>
          <Stop offset="0" stopColor={color} stopOpacity={0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Line x1={at.x} y1={iy + 14} x2={at.x} y2={at.y - 6} stroke={color} strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="2 3" />
      <Circle cx={at.x} cy={iy} r={22} fill={`url(#heroMarkerGlow${i})`} />
      <Circle cx={at.x} cy={iy} r={14} fill={FOREST.ivory} fillOpacity={0.1} stroke={color} strokeOpacity={0.9} strokeWidth={1.3} />
      <Path d={i < 2 ? heart : spark} fill={color} />
      <Circle cx={at.x} cy={at.y} r={5.5} fill={FOREST.field} stroke={color} strokeWidth={1.6} />
      <Circle cx={at.x} cy={at.y} r={2.4} fill={color} />
      {/* The marker's chip: a label line and a plain three-tone bar (no values). */}
      <Rect x={at.x - 30} y={at.y + 16} width={60} height={26} rx={6} fill="#0B1A2E" fillOpacity={0.55} stroke={color} strokeOpacity={0.55} />
      <TextLine x1={at.x - 22} x2={at.x + 4} y={at.y + 24} o={0.6} />
      <Rect x={bar} y={at.y + 31} width={15} height={4} rx={2} fill={ROSE} fillOpacity={0.85} />
      <Rect x={bar + 15} y={at.y + 31} width={14} height={4} fill={AMBER} fillOpacity={0.85} />
      <Rect x={bar + 29} y={at.y + 31} width={15} height={4} rx={2} fill={EMERALD} fillOpacity={0.85} />
    </Layer>
  );
}

// ------------------------------------------------------------- UNDERSTAND --

function Streams({ side }: { side: 'left' | 'right' }) {
  const left = ['M -10 96 C 60 96 110 160 160 182', 'M -10 128 C 60 128 110 172 156 188', 'M -10 160 C 50 160 100 184 150 194'];
  const right = ['M 400 86 C 330 86 280 160 230 182', 'M 400 118 C 330 118 282 172 234 188', 'M 400 152 C 340 152 290 184 240 194'];
  const id = `heroStream${side}`;
  return (
    <Layer>
      <Defs>
        <LinearGradient id={id} x1={side === 'left' ? '0' : '1'} y1="0" x2={side === 'left' ? '1' : '0'} y2="0">
          <Stop offset="0" stopColor={CYAN} stopOpacity={0.15} />
          <Stop offset="0.7" stopColor={CYAN} stopOpacity={0.7} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0.8} />
        </LinearGradient>
      </Defs>
      {(side === 'left' ? left : right).map((d, i) => (
        <G key={d}>
          <Path d={d} stroke={CYAN} strokeOpacity={0.12} strokeWidth={8} fill="none" strokeLinecap="round" />
          <Path d={d} stroke={`url(#${id})`} strokeWidth={i === 1 ? 1.6 : 1} fill="none" strokeLinecap="round" />
        </G>
      ))}
    </Layer>
  );
}

/** Small glass tiles of what the records hold (abstract icons). */
function Tile({ i }: { i: number }) {
  const tiles = [
    { x: 316, y: 52 },
    { x: 344, y: 88 },
    { x: 318, y: 120 },
    { x: 24, y: 142 },
  ];
  const { x, y } = tiles[i];
  const c = { x: x + 12, y: y + 12 };
  return (
    <Layer>
      <Rect x={x} y={y} width={24} height={24} rx={6} fill={FOREST.ivory} fillOpacity={0.1} stroke={MINT} strokeOpacity={0.5} />
      {i === 0 ? (
        <Circle cx={c.x} cy={c.y} r={5} {...ICON} />
      ) : i === 1 ? (
        <Path d={`M ${c.x - 5} ${c.y + 4} L ${c.x - 1} ${c.y} L ${c.x + 2} ${c.y + 3} L ${c.x + 6} ${c.y - 4}`} {...ICON} />
      ) : i === 2 ? (
        <Path d={`M ${c.x - 4} ${c.y - 5} L ${c.x - 4} ${c.y + 3} Q ${c.x - 4} ${c.y + 6} ${c.x - 1} ${c.y + 6} Q ${c.x + 2} ${c.y + 6} ${c.x + 2} ${c.y + 3} L ${c.x + 2} ${c.y - 5}`} {...ICON} />
      ) : (
        <Path d={`M ${c.x} ${c.y - 6} C ${c.x + 4} ${c.y - 1} ${c.x + 5} ${c.y + 1} ${c.x + 5} ${c.y + 2} A 5 5 0 0 1 ${c.x - 5} ${c.y + 2} C ${c.x - 5} ${c.y + 1} ${c.x - 4} ${c.y - 1} ${c.x} ${c.y - 6} Z`} {...ICON} />
      )}
    </Layer>
  );
}

/** The gauge face and its pedestals — no numbers. */
function GaugeDial() {
  const ticks = Array.from({ length: 9 }, (_, k) => -80 + k * 20);
  return (
    <Layer>
      <Defs>
        <LinearGradient id="heroGauge" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={EMERALD} stopOpacity={0.6} />
          <Stop offset="0.6" stopColor={MINT} stopOpacity={0.9} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      {/* Pedestals: left and centre glass, right one (the final milestone) warm. */}
      <Ellipse cx={96} cy={226} rx={36} ry={7} fill={FOREST.ivory} fillOpacity={0.08} stroke={MINT} strokeOpacity={0.35} />
      <Circle cx={92} cy={212} r={7} {...ICON} strokeOpacity={0.7} />
      <Line x1={97} y1={217} x2={104} y2={224} {...ICON} strokeOpacity={0.7} />
      <Ellipse cx={GAUGE.x} cy={228} rx={52} ry={8} fill={FOREST.ivory} fillOpacity={0.08} stroke={MINT} strokeOpacity={0.35} />
      <Ellipse cx={294} cy={226} rx={36} ry={7} fill={GOLD} fillOpacity={0.12} stroke={GOLD} strokeOpacity={0.5} />
      <Rect x={284} y={210} width={5} height={12} rx={1.5} fill={GOLD} fillOpacity={0.7} />
      <Rect x={292} y={204} width={5} height={18} rx={1.5} fill={GOLD} fillOpacity={0.8} />
      <Rect x={300} y={214} width={5} height={8} rx={1.5} fill={GOLD} fillOpacity={0.6} />
      {/* Dial. */}
      <Path d={`M ${GAUGE.x - GAUGE_R} ${GAUGE.y} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE.x + GAUGE_R} ${GAUGE.y}`} stroke={FOREST.ivory} strokeOpacity={0.1} strokeWidth={12} fill="none" />
      <Path d={`M ${GAUGE.x - GAUGE_R} ${GAUGE.y} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE.x + GAUGE_R} ${GAUGE.y}`} stroke="url(#heroGauge)" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      {ticks.map((deg) => {
        const r = (deg * Math.PI) / 180;
        const x1 = GAUGE.x + (GAUGE_R - 12) * Math.sin(r);
        const y1 = GAUGE.y - (GAUGE_R - 12) * Math.cos(r);
        const x2 = GAUGE.x + (GAUGE_R - 7) * Math.sin(r);
        const y2 = GAUGE.y - (GAUGE_R - 7) * Math.cos(r);
        return <Line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={FOREST.ivory} strokeOpacity={0.35} strokeWidth={1.2} strokeLinecap="round" />;
      })}
    </Layer>
  );
}

/** The needle, in a square centred on the gauge pivot, pointing straight up (rotated by the clock). */
function Needle() {
  const c = NEEDLE_LEN;
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${c * 2} ${c * 2}`}>
      <Line x1={c} y1={c} x2={c} y2={4} stroke={GOLD} strokeWidth={3} strokeLinecap="round" />
      <Circle cx={c} cy={4} r={3} fill="#FFF6D8" />
      <Circle cx={c} cy={c} r={7} fill={FOREST.field} stroke={GOLD} strokeWidth={2} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute' },
  clip: { overflow: 'hidden' },
});

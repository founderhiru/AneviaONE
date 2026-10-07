import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { FOREST } from '../design/brandSurface';

/**
 * Welcome's story, told in three quiet scenes that loop:
 *
 *   CONNECT          records joined to one thread of light through time; a
 *                    pulse of light travels to the newest point
 *   UNDERSTAND       the thread becomes a trend: bars rise, a line joins them
 *   STAY INFORMED    a "what changed" card, then a question and its answer
 *
 * Abstract line-work only — no values, dates, names, diagnoses or claims, so
 * nothing in it can be read as someone's data. Decorative: hidden from
 * screen readers.
 *
 * Motion: one clock (`t`, 0 → 3, one unit per scene, 2.4 s each) drives
 * every layer through opacity/transform interpolations on the native driver
 * — no animation library, no per-frame JS. Scenes crossfade with a few
 * points of drift. `playing` starts the loop (Welcome passes it once the
 * splash has gone); `still` (Reduce Motion) shows the settled CONNECT
 * composition with nothing moving.
 *
 * Drawn on a 390 × 240 stage (the artwork's own bounds), scaled to fit its box and sat on the box's
 * bottom edge, so it rests just above the sign-in sheet.
 */

const STAGE_W = 390;
const STAGE_H = 240;
const SCENE_MS = 2400;
/** A settled moment of CONNECT: fully shown, the light pulse already home. */
const STILL_T = 0.85;

// ---------------------------------------------------------------- CONNECT --
const THREAD = 'M -10 212 C 70 222 112 156 186 142 S 300 80 400 30';
const NODES = [
  { x: 58, y: 204 },
  { x: 140, y: 156 },
  { x: 236, y: 120 },
];
const LATEST = { x: 334, y: 58 };
/** Points along the thread the light pulse passes through, oldest first. */
const PULSE_PATH = [NODES[0], NODES[1], { x: 186, y: 142 }, NODES[2], LATEST];
const PULSE_AT = [0.05, 0.25, 0.38, 0.52, 0.75];

// ------------------------------------------------------------- UNDERSTAND --
const BAR_BASE = 176;
const BARS = [52, 74, 60, 96, 84, 118].map((h, i) => ({ x: 96 + i * 36, h }));
const TREND = BARS.map((b) => ({ x: b.x + 9, y: BAR_BASE - b.h - 10 }));

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
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 3, duration: SCENE_MS * 3, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [playing, still, t]);

  // Fit the stage inside the box, centred across and resting on its floor.
  const scale = box.w && box.h ? Math.min(box.w / STAGE_W, box.h / STAGE_H) : 0;
  const stage = { width: STAGE_W * scale, height: STAGE_H * scale, left: (box.w - STAGE_W * scale) / 2, top: box.h - STAGE_H * scale };

  const motion = useMemo(() => sceneMotion(t, scale), [t, scale]);

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
          {/* Shared glow behind every scene. */}
          <Layer>
            <Defs>
              <RadialGradient id="heroTeal">
                <Stop offset="0" stopColor="#5FC4A4" stopOpacity={0.16} />
                <Stop offset="1" stopColor="#5FC4A4" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="205" cy="130" r="150" fill="url(#heroTeal)" />
          </Layer>

          <Animated.View style={[StyleSheet.absoluteFill, motion.connect]} testID="hero-scene-connect">
            <ConnectThread />
            <Animated.View style={[StyleSheet.absoluteFill, motion.cards]}>
              <ConnectCards />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, motion.pulse]}>
              <Layer>
                <Defs>
                  <RadialGradient id="heroPulse">
                    <Stop offset="0" stopColor={FOREST.gold} stopOpacity={0.55} />
                    <Stop offset="1" stopColor={FOREST.gold} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={NODES[0].x} cy={NODES[0].y} r={14} fill="url(#heroPulse)" />
                <Circle cx={NODES[0].x} cy={NODES[0].y} r={3} fill={FOREST.gold} />
              </Layer>
            </Animated.View>
          </Animated.View>

          <Animated.View style={[StyleSheet.absoluteFill, motion.understand]} testID="hero-scene-understand">
            <UnderstandFrame />
            <Animated.View style={[StyleSheet.absoluteFill, motion.bars]}>
              <UnderstandBars />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, motion.trend]}>
              <UnderstandTrend />
            </Animated.View>
          </Animated.View>

          <Animated.View style={[StyleSheet.absoluteFill, motion.inform]} testID="hero-scene-inform">
            <Animated.View style={[StyleSheet.absoluteFill, motion.changeCard]}>
              <InformChange />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, motion.question]}>
              <InformQuestion />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, motion.answer]}>
              <InformAnswer />
            </Animated.View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Every moving part, as interpolations of the one clock. Scene windows (in
 * scene units): CONNECT 0–1, UNDERSTAND 1–2, STAY INFORMED 2–3, with a
 * 0.15-unit crossfade at each hand-over; 3 ≡ 0, so the loop is seamless.
 */
function sceneMotion(t: Animated.Value, scale: number) {
  const at = (inputRange: number[], outputRange: number[]) => t.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  const drift = (inputRange: number[], outputRange: number[]) => at(inputRange, outputRange.map((v) => v * scale));
  return {
    connect: {
      opacity: at([0, 0.85, 1, 2.85, 3], [1, 1, 0, 0, 1]),
      transform: [{ translateY: drift([0, 0.85, 1, 2.85, 3], [0, 0, -6, 6, 0]) }],
    },
    // Cards settle in as the scene arrives.
    cards: { transform: [{ translateY: drift([0, 2.85, 3], [0, 8, 0]) }] },
    // A pulse of light runs along the thread to the newest point, then fades into it.
    pulse: {
      opacity: at([0, 0.08, 0.68, 0.8], [0, 1, 1, 0]),
      transform: [
        { translateX: drift(PULSE_AT, PULSE_PATH.map((p) => p.x - NODES[0].x)) },
        { translateY: drift(PULSE_AT, PULSE_PATH.map((p) => p.y - NODES[0].y)) },
      ],
    },
    understand: {
      opacity: at([0.85, 1, 1.85, 2], [0, 1, 1, 0]),
      transform: [{ translateY: drift([0.85, 1, 1.85, 2], [6, 0, 0, -6]) }],
    },
    // Bars rise from the baseline, then the trend line joins them.
    bars: { transformOrigin: `50% ${(BAR_BASE / STAGE_H) * 100}%`, transform: [{ scaleY: at([0.9, 1.35], [0.25, 1]) }] },
    trend: { opacity: at([1.25, 1.55], [0, 1]), transform: [{ translateY: drift([1.25, 1.55], [4, 0]) }] },
    inform: {
      opacity: at([1.85, 2, 2.85, 3], [0, 1, 1, 0]),
      transform: [{ translateY: drift([1.85, 2, 2.85, 3], [6, 0, 0, -6]) }],
    },
    changeCard: { opacity: at([1.9, 2.05], [0, 1]) },
    question: { opacity: at([2.15, 2.35], [0, 1]), transform: [{ translateX: drift([2.15, 2.35], [10, 0]) }] },
    answer: { opacity: at([2.4, 2.6], [0, 1]), transform: [{ translateX: drift([2.4, 2.6], [-10, 0]) }] },
  };
}

/** One full-stage SVG layer. */
function Layer({ children }: { children: React.ReactNode }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
      {children}
    </Svg>
  );
}

/** A record, as an outline: translucent ivory on the field. */
function Card({ x, y, w = 86, h = 60, r = 12 }: { x: number; y: number; w?: number; h?: number; r?: number }) {
  return <Rect x={x} y={y} width={w} height={h} rx={r} fill={FOREST.ivory} fillOpacity={0.07} stroke={FOREST.ivory} strokeOpacity={0.22} strokeWidth={1} />;
}

const TextLine = ({ x1, x2, y, o = 0.4 }: { x1: number; x2: number; y: number; o?: number }) => (
  <Line x1={x1} y1={y} x2={x2} y2={y} stroke={FOREST.ivory} strokeOpacity={o} strokeWidth={2} strokeLinecap="round" />
);

// ---------------------------------------------------------------- CONNECT --

function ConnectThread() {
  return (
    <Layer>
      <Defs>
        <LinearGradient id="heroThread" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={FOREST.sage} stopOpacity={0.12} />
          <Stop offset="0.55" stopColor={FOREST.sage} stopOpacity={0.55} />
          <Stop offset="1" stopColor={FOREST.gold} stopOpacity={0.95} />
        </LinearGradient>
        <RadialGradient id="heroGlow">
          <Stop offset="0" stopColor={FOREST.gold} stopOpacity={0.45} />
          <Stop offset="1" stopColor={FOREST.gold} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={THREAD} stroke={FOREST.sage} strokeOpacity={0.05} strokeWidth={34} strokeLinecap="round" fill="none" />
      <Path d={THREAD} stroke="url(#heroThread)" strokeWidth={1.6} fill="none" />
      {/* Connectors from each record to its point in time. */}
      <Line x1="58" y1="204" x2="62" y2="158" stroke={FOREST.ivory} strokeOpacity={0.25} strokeDasharray="2 4" />
      <Line x1="140" y1="156" x2="146" y2="94" stroke={FOREST.ivory} strokeOpacity={0.25} strokeDasharray="2 4" />
      <Line x1="236" y1="120" x2="242" y2="174" stroke={FOREST.ivory} strokeOpacity={0.25} strokeDasharray="2 4" />
      {NODES.map((n) => (
        <G key={`${n.x}`}>
          <Circle cx={n.x} cy={n.y} r={7} fill={FOREST.field} stroke={FOREST.sage} strokeOpacity={0.7} strokeWidth={1.4} />
          <Circle cx={n.x} cy={n.y} r={2.6} fill={FOREST.sage} />
        </G>
      ))}
      <Circle cx={LATEST.x} cy={LATEST.y} r={30} fill="url(#heroGlow)" />
      <Circle cx={LATEST.x} cy={LATEST.y} r={9} fill={FOREST.field} stroke={FOREST.gold} strokeWidth={1.6} />
      <Circle cx={LATEST.x} cy={LATEST.y} r={3.6} fill={FOREST.gold} />
    </Layer>
  );
}

function ConnectCards() {
  return (
    <Layer>
      {/* Lab result. */}
      <Card x={18} y={98} />
      <Line x1="32" y1="146" x2="98" y2="146" stroke={FOREST.ivory} strokeOpacity={0.25} />
      <Rect x="38" y="130" width="8" height="16" rx="2" fill={FOREST.sage} fillOpacity={0.5} />
      <Rect x="52" y="122" width="8" height="24" rx="2" fill={FOREST.sage} fillOpacity={0.6} />
      <Rect x="66" y="126" width="8" height="20" rx="2" fill={FOREST.sage} fillOpacity={0.5} />
      <Rect x="80" y="116" width="8" height="30" rx="2" fill={FOREST.limeGold} fillOpacity={0.75} />
      {/* Prescription. */}
      <Card x={102} y={34} />
      <Rect x="116" y="52" width="32" height="13" rx="6.5" fill={FOREST.sage} fillOpacity={0.55} />
      <Line x1="132" y1="52" x2="132" y2="65" stroke={FOREST.field} strokeOpacity={0.7} strokeWidth={1.4} />
      <TextLine x1={116} x2={176} y={76} />
      <TextLine x1={116} x2={158} y={83} o={0.25} />
      {/* Consultation note. */}
      <Card x={200} y={174} />
      <Circle cx="220" cy="196" r="7" fill={FOREST.sage} fillOpacity={0.5} />
      <TextLine x1={234} x2={276} y={192} />
      <TextLine x1={234} x2={262} y={200} o={0.25} />
      <TextLine x1={214} x2={276} y={214} o={0.2} />
    </Layer>
  );
}

// ------------------------------------------------------------- UNDERSTAND --

function UnderstandFrame() {
  return (
    <Layer>
      {/* Record fragments feeding the trend. */}
      <Card x={10} y={112} w={56} h={42} r={10} />
      <TextLine x1={20} x2={54} y={127} o={0.35} />
      <TextLine x1={20} x2={44} y={137} o={0.22} />
      <Line x1="66" y1="133" x2="76" y2="133" stroke={FOREST.ivory} strokeOpacity={0.25} strokeDasharray="2 3" />
      <Card x={324} y={44} w={56} h={42} r={10} />
      <TextLine x1={334} x2={368} y={59} o={0.35} />
      <TextLine x1={334} x2={358} y={69} o={0.22} />
      <Line x1="314" y1="65" x2="324" y2="65" stroke={FOREST.ivory} strokeOpacity={0.25} strokeDasharray="2 3" />
      {/* The trend card. */}
      <Card x={76} y={20} w={238} h={176} r={18} />
      <TextLine x1={94} x2={150} y={38} o={0.35} />
      <Line x1="90" y1={BAR_BASE} x2="300" y2={BAR_BASE} stroke={FOREST.ivory} strokeOpacity={0.22} />
    </Layer>
  );
}

function UnderstandBars() {
  return (
    <Layer>
      {BARS.map((b, i) => (
        <Rect
          key={b.x}
          x={b.x}
          y={BAR_BASE - b.h}
          width={18}
          height={b.h}
          rx={4}
          fill={i === BARS.length - 1 ? FOREST.limeGold : FOREST.sage}
          fillOpacity={i === BARS.length - 1 ? 0.75 : 0.4}
        />
      ))}
    </Layer>
  );
}

function UnderstandTrend() {
  return (
    <Layer>
      <Defs>
        <LinearGradient id="heroTrend" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={FOREST.sage} stopOpacity={0.6} />
          <Stop offset="1" stopColor={FOREST.gold} stopOpacity={0.95} />
        </LinearGradient>
      </Defs>
      <Path d={`M ${TREND.map((p) => `${p.x} ${p.y}`).join(' L ')}`} stroke="url(#heroTrend)" strokeWidth={1.8} fill="none" strokeLinejoin="round" />
      {TREND.map((p, i) => (
        <Circle key={p.x} cx={p.x} cy={p.y} r={i === TREND.length - 1 ? 4 : 3} fill={i === TREND.length - 1 ? FOREST.gold : FOREST.ivory} fillOpacity={i === TREND.length - 1 ? 1 : 0.8} />
      ))}
    </Layer>
  );
}

// ---------------------------------------------------------- STAY INFORMED --

function InformChange() {
  return (
    <Layer>
      {/* What changed: a change marker beside two lines of summary. */}
      <Card x={40} y={18} w={230} h={70} r={16} />
      <Circle cx="70" cy="53" r="15" fill={FOREST.limeGold} fillOpacity={0.18} stroke={FOREST.limeGold} strokeOpacity={0.6} />
      <Path d="M 64 59 L 76 47 M 69 47 L 76 47 L 76 54" stroke={FOREST.gold} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <TextLine x1={96} x2={196} y={46} o={0.45} />
      <TextLine x1={96} x2={168} y={60} o={0.25} />
      <Rect x="214" y="40" width="40" height="14" rx="7" fill={FOREST.sage} fillOpacity={0.35} />
    </Layer>
  );
}

function InformQuestion() {
  return (
    <Layer>
      {/* Ask: a question, in the ivory of the person's own words. */}
      <Rect x="150" y="106" width="200" height="44" rx="22" fill={FOREST.ivory} fillOpacity={0.9} />
      <Line x1="172" y1="124" x2="300" y2="124" stroke={FOREST.field} strokeOpacity={0.55} strokeWidth={2} strokeLinecap="round" />
      <Line x1="172" y1="133" x2="252" y2="133" stroke={FOREST.field} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
    </Layer>
  );
}

function InformAnswer() {
  return (
    <Layer>
      {/* …and an answer drawn from the records. */}
      <Card x={40} y={164} w={240} h={60} r={20} />
      <Path
        d="M 66 180 Q 67 191 76 194 Q 67 197 66 208 Q 65 197 56 194 Q 65 191 66 180 Z"
        fill={FOREST.gold}
        fillOpacity={0.85}
      />
      <TextLine x1={90} x2={250} y={186} o={0.45} />
      <TextLine x1={90} x2={220} y={196} o={0.3} />
      <TextLine x1={90} x2={186} y={206} o={0.2} />
    </Layer>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute' },
});

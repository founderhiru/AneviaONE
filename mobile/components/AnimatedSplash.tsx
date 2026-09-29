import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { BRAND, taglineLines } from '../config/brand';
import { useTheme } from '../design/theme';

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
 * Full-screen launch sequence, shown once per cold start above the app:
 *
 *   deep navy field → points of health information appear and link into
 *   fragments → they assemble into the chevron mark from the app icon → the
 *   mark settles → the field warms into the app's own background
 *   (information → clarity) → product name and tagline → fade into the app.
 *
 * One `Animated.Value` drives everything on the native driver (opacity and
 * transforms only) — no animation library. Honours reduce-motion with a
 * short static fade.
 */

const TIMELINE_MS = 2400;
const REDUCED_MS = 500;
const EXIT_MS = 250;
const EASE_SAMPLES = 8;

// Launch-only colours: deep navy with blue → teal → aqua and a touch of indigo.
const NAVY_FIELD = '#0A1426';
const BLUE = '#4A86E8';
const TEAL = '#2FA89C';
const AQUA = '#6CCFD8';
const INDIGO = '#6B72D9';
const VIOLET = '#8A7FE0';
const MARK_BLUE = '#2F72DA';
const PULSE = '#BDF1F4';

// The chevron mark from the app icon, in a MARK_W × MARK_H box.
const MARK_W = 168;
const MARK_H = 150;
const APEX = { x: 84, y: 16 };
const FOOT_L = { x: 16, y: 134 };
const FOOT_R = { x: 152, y: 134 };
const DOT = 7;
const BAR = 20;

type Point = { x: number; y: number };
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function pathColor(t: number): string {
  if (t < 0.2) return TEAL;
  if (t < 0.4) return BLUE;
  if (t < 0.6) return INDIGO;
  if (t < 0.8) return BLUE;
  return AQUA;
}

// 23 points along the chevron: left foot → apex → right foot.
const PATH: Point[] = [
  ...Array.from({ length: 12 }, (_, i) => lerp(FOOT_L, APEX, i / 11)),
  ...Array.from({ length: 11 }, (_, i) => lerp(APEX, FOOT_R, (i + 1) / 11)),
];

// Points travel in small fragments so the links inside each stay attached.
const FRAGMENT_SIZES = [3, 3, 3, 3, 3, 3, 3, 2];
const FRAGMENT_OFFSETS: Point[] = [
  { x: -120, y: 70 },
  { x: -150, y: -60 },
  { x: -70, y: -150 },
  { x: 30, y: -170 },
  { x: 110, y: -120 },
  { x: 160, y: -20 },
  { x: 120, y: 110 },
  { x: -20, y: 170 },
];
type Fragment = { start: number; indices: number[]; offset: Point };
const FRAGMENTS: Fragment[] = (() => {
  let cursor = 0;
  return FRAGMENT_SIZES.map((size, f) => {
    const indices = Array.from({ length: size }, (_, i) => cursor + i);
    cursor += size;
    return { start: indices[0], indices, offset: FRAGMENT_OFFSETS[f] };
  });
})();

// Ambient points that sparkle in the field but never join the mark.
const AMBIENT: (Point & { color: string })[] = [
  { x: -70, y: -40, color: VIOLET },
  { x: 230, y: 10, color: TEAL },
  { x: 200, y: 170, color: BLUE },
  { x: -40, y: 190, color: AQUA },
  { x: 90, y: -110, color: INDIGO },
];

function appearAt(pathIndex: number): number {
  const early = FRAGMENTS.findIndex((f) => f.start === pathIndex);
  if (early >= 0 && early % 2 === 0) return 40 + early * 45;
  return 300 + ((pathIndex * 37) % 480);
}

const [taglineFirst, taglineSecond] = taglineLines();

type At = (input: number[], output: number[], ease?: (value: number) => number) => Animated.AnimatedInterpolation<number>;

export function AnimatedSplash({ ready, onFinished }: AnimatedSplashProps) {
  const theme = useTheme();
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [settled, setSettled] = useState(false);
  const [onLight, setOnLight] = useState(false);
  const [clock] = useState(() => new Animated.Value(0));
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
    const animation = Animated.timing(clock, {
      toValue: TIMELINE_MS,
      duration: reduceMotion ? REDUCED_MS : TIMELINE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => finished && setSettled(true));
    const toLight = setTimeout(() => setOnLight(true), reduceMotion ? 0 : 1700);
    return () => {
      animation.stop();
      clearTimeout(toLight);
    };
  }, [reduceMotion, clock]);

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

  // The native driver doesn't accept `easing` in interpolate(), so eased
  // curves are baked into the ranges by sampling each segment.
  const at = useCallback<At>(
    (input, output, ease = Easing.inOut(Easing.quad)) => {
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
    },
    [clock]
  );

  const view = useMemo(
    () => ({
      solidMark: at([1250, 1550], [0, 1]),
      pointsFade: at([1400, 1700], [1, 0]),
      settle: at([0, 1300, 1600], [1.045, 1.045, 1], Easing.out(Easing.cubic)),
      field: at([1500, 1900], [0, 1]),
      nameIn: at([1700, 2100], [0, 1], Easing.out(Easing.cubic)),
      nameY: at([1700, 2100], [8, 0], Easing.out(Easing.cubic)),
      line1In: at([1900, 2250], [0, 1], Easing.out(Easing.cubic)),
      line2In: at([2050, 2400], [0, 1], Easing.out(Easing.cubic)),
      joins: at([950, 1300], [0, 0.55]),
    }),
    [at]
  );

  const labelProps = {
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel: `Loading ${BRAND.name}`,
  };

  if (reduceMotion) {
    // Reduced motion: the settled composition, faded in — no convergence.
    const fadeIn = clock.interpolate({ inputRange: [0, TIMELINE_MS], outputRange: [0, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.colors.background, opacity: exitOpacity }]} {...labelProps}>
        <Animated.View style={[styles.center, { opacity: fadeIn }]}>
          <View style={styles.mark}>
            <Bar from={FOOT_L} to={APEX} />
            <Bar from={APEX} to={FOOT_R} />
          </View>
          <Wordmark theme={theme} />
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: NAVY_FIELD, opacity: exitOpacity }]} {...labelProps}>
      <StatusBar style={onLight ? 'auto' : 'light'} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background, opacity: view.field }]} />

      <Animated.View style={[styles.mark, { transform: [{ scale: view.settle }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.solidMark }]}>
          <Bar from={FOOT_L} to={APEX} />
          <Bar from={APEX} to={FOOT_R} />
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.pointsFade }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: view.joins }]}>
            {FRAGMENTS.slice(1).map((f) => (
              <Line key={`join-${f.start}`} a={PATH[f.start - 1]} b={PATH[f.start]} />
            ))}
          </Animated.View>
          {FRAGMENTS.map((f, fi) => (
            <FragmentView key={`frag-${fi}`} fragment={f} at={at} />
          ))}
          {AMBIENT.map((p, i) => {
            const t0 = 60 + i * 90;
            return (
              <Animated.View
                key={`amb-${i}`}
                style={[
                  styles.dot,
                  styles.ambient,
                  {
                    left: p.x - DOT / 2,
                    top: p.y - DOT / 2,
                    backgroundColor: p.color,
                    opacity: at([t0, t0 + 250, 900, 1250], [0, 0.7, 0.7, 0]),
                    transform: [
                      { translateX: at([t0, 1250], [0, (MARK_W / 2 - p.x) * 0.25]) },
                      { translateY: at([t0, 1250], [0, (MARK_H / 2 - p.y) * 0.25]) },
                    ],
                  },
                ]}
              />
            );
          })}
        </Animated.View>
      </Animated.View>

      <View style={styles.copy}>
        <Animated.View style={{ opacity: view.nameIn, transform: [{ translateY: view.nameY }] }}>
          <Animated.Text
            style={[theme.typography.headingLarge, { color: theme.colors.textPrimary, textAlign: 'center', marginBottom: 10 }]}
            accessibilityRole="header"
          >
            {BRAND.name}
          </Animated.Text>
        </Animated.View>
        <Animated.Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, textAlign: 'center', opacity: view.line1In }]}>
          {taglineFirst}
        </Animated.Text>
        {taglineSecond ? (
          <Animated.Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, textAlign: 'center', opacity: view.line2In }]}>
            {taglineSecond}
          </Animated.Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Wordmark({ theme }: { theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 32 }}>
      <Animated.Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary, marginBottom: 10 }]} accessibilityRole="header">
        {BRAND.name}
      </Animated.Text>
      <Animated.Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
        {taglineFirst}
      </Animated.Text>
      {taglineSecond ? (
        <Animated.Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary, textAlign: 'center' }]}>
          {taglineSecond}
        </Animated.Text>
      ) : null}
    </View>
  );
}

function FragmentView({ fragment, at }: { fragment: Fragment; at: At }) {
  const { indices, offset } = fragment;
  const first = Math.min(...indices.map(appearAt));
  // 0.3–0.8 s drift toward each other; 0.8–1.3 s lock into the mark.
  const land = 1180 + (fragment.start % 5) * 25;
  const tx = at([0, 300, 800, land], [offset.x * 1.05, offset.x, offset.x * 0.4, 0]);
  const ty = at([0, 300, 800, land], [offset.y * 1.05, offset.y, offset.y * 0.4, 0]);
  const linksStart = Math.max(first + 150, 350);
  const linksIn = at([linksStart, Math.max(linksStart + 150, 800)], [0, 0.6]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateX: tx }, { translateY: ty }] }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: linksIn }]}>
        {indices.slice(1).map((idx) => (
          <Line key={`l-${idx}`} a={PATH[idx - 1]} b={PATH[idx]} />
        ))}
      </Animated.View>
      {indices.map((idx) => {
        const p = PATH[idx];
        const t = appearAt(idx);
        // 0.8–1.5 s: a soft colour pulse travels foot → apex → foot.
        const pulseAt = 850 + idx * 26;
        return (
          <Animated.View
            key={`d-${idx}`}
            style={[
              styles.dot,
              {
                left: p.x - DOT / 2,
                top: p.y - DOT / 2,
                backgroundColor: pathColor(idx / (PATH.length - 1)),
                opacity: at([t, t + 200], [0, 1]),
                transform: [{ scale: at([t, t + 220], [0.4, 1], Easing.out(Easing.cubic)) }],
              },
            ]}
          >
            <Animated.View style={[styles.pulse, { opacity: at([pulseAt - 120, pulseAt, pulseAt + 180], [0, 0.85, 0]) }]} />
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

function Line({ a, b }: { a: Point; b: Point }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.line,
        {
          width: length,
          left: (a.x + b.x) / 2 - length / 2,
          top: (a.y + b.y) / 2,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        },
      ]}
    />
  );
}

function Bar({ from, to }: { from: Point; to: Point }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) + BAR;
  return (
    <View
      style={[
        styles.bar,
        {
          width: length,
          left: (from.x + to.x) / 2 - length / 2,
          top: (from.y + to.y) / 2 - BAR / 2,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  mark: { width: MARK_W, height: MARK_H, marginTop: -40 },
  bar: { position: 'absolute', height: BAR, borderRadius: BAR / 2, backgroundColor: MARK_BLUE },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, overflow: 'hidden' },
  ambient: { width: DOT - 2, height: DOT - 2 },
  pulse: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: PULSE },
  line: { position: 'absolute', height: StyleSheet.hairlineWidth * 2, backgroundColor: AQUA },
  copy: { position: 'absolute', left: 24, right: 24, top: '50%', marginTop: 70, alignItems: 'center' },
});

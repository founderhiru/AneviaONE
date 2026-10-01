import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { BRAND, wordmarkParts } from '../config/brand';
import { darkColors } from '../design/colors';
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
 * Full-screen launch sequence, shown once per cold start above the app.
 * It sits on the same solid navy as the native launch screen (app.json), so
 * launch reads as one continuous screen:
 *
 *   navy → the chevron mark from the app icon draws itself (0–0.9 s) →
 *   one barely perceptible breath (0.9–1.15 s) → product name (1.15–1.55 s)
 *   → launch tagline (1.45–1.9 s) → hold until the app is ready → fade out.
 *
 * The stroke draw animates an SVG dash offset (JS driver — it is not a
 * transform or opacity); everything else runs on the native driver. No
 * animation library. Honours reduce-motion: the mark appears complete and
 * only the text fades in.
 */

const TIMELINE_MS = 1900;
const REDUCED_MS = 500;
const EXIT_MS = 280;
const DRAW_MS = 900;
// If the reveal's completion callback never arrives, settle anyway so the
// splash can never be what keeps the app hidden.
const FALLBACK_MS = 1000;
const EASE_SAMPLES = 8;

// Matches the native launch screen background in app.json.
const NAVY_FIELD = '#0A1426';
// Launch-only mark colours: warm white with a very subtle champagne.
const WARM_WHITE = '#F7F1E4';
const CHAMPAGNE = '#E3D1A8';

// The chevron mark from the app icon, in a MARK_W × MARK_H box.
const MARK_W = 168;
const MARK_H = 150;
const APEX = { x: 84, y: 16 };
const FOOT_L = { x: 16, y: 134 };
const FOOT_R = { x: 152, y: 134 };
const BAR = 20;
const CHEVRON = `M ${FOOT_L.x} ${FOOT_L.y} L ${APEX.x} ${APEX.y} L ${FOOT_R.x} ${FOOT_R.y}`;
// Drawn left foot → apex → right foot as one continuous stroke.
const CHEVRON_LENGTH = Math.hypot(APEX.x - FOOT_L.x, APEX.y - FOOT_L.y) + Math.hypot(FOOT_R.x - APEX.x, FOOT_R.y - APEX.y);

const AnimatedPath = Animated.createAnimatedComponent(Path);

const [nameLead, nameAccent] = wordmarkParts();

type At = (input: number[], output: number[], ease?: (value: number) => number) => Animated.AnimatedInterpolation<number>;

export function AnimatedSplash({ ready, onFinished }: AnimatedSplashProps) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [settled, setSettled] = useState(false);
  const [clock] = useState(() => new Animated.Value(0));
  const [draw] = useState(() => new Animated.Value(0));
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
    const stroke = Animated.timing(draw, {
      toValue: 1,
      duration: reduceMotion ? 0 : DRAW_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    timeline.start(({ finished }) => finished && setSettled(true));
    stroke.start();
    const fallback = setTimeout(() => setSettled(true), duration + FALLBACK_MS);
    return () => {
      timeline.stop();
      stroke.stop();
      clearTimeout(fallback);
    };
  }, [reduceMotion, clock, draw]);

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

  const view = useMemo(() => {
    const out = Easing.out(Easing.cubic);
    if (reduceMotion) {
      // Reduced motion: the mark is already complete; only the text fades in
      // (the clock covers TIMELINE_MS in REDUCED_MS).
      return {
        breath: 1,
        nameIn: at([0, TIMELINE_MS * 0.6], [0, 1], out),
        nameY: 0,
        tagIn: at([TIMELINE_MS * 0.4, TIMELINE_MS], [0, 1], out),
      };
    }
    return {
      breath: at([900, 1025, 1150], [1, 1.01, 1]),
      nameIn: at([1150, 1550], [0, 1], out),
      nameY: at([1150, 1550], [6, 0], out),
      tagIn: at([1450, 1900], [0, 1], out),
    };
  }, [at, reduceMotion]);

  // The stroke's dash slides along the path so the chevron draws itself.
  // Hidden until drawing starts, so the round cap never shows as a dot.
  const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [CHEVRON_LENGTH, 0] });
  const strokeOpacity = draw.interpolate({ inputRange: [0, 0.02], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: NAVY_FIELD, opacity: exitOpacity }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading ${BRAND.productName}`}
    >
      <StatusBar style="light" />

      <Animated.View style={[styles.mark, { transform: [{ scale: view.breath }] }]}>
        <Svg width={MARK_W} height={MARK_H} viewBox={`0 0 ${MARK_W} ${MARK_H}`}>
          <Defs>
            <LinearGradient id="splashMark" gradientUnits="userSpaceOnUse" x1={0} y1={APEX.y} x2={0} y2={FOOT_L.y}>
              <Stop offset="0" stopColor={WARM_WHITE} />
              <Stop offset="1" stopColor={CHAMPAGNE} />
            </LinearGradient>
          </Defs>
          <AnimatedPath
            d={CHEVRON}
            stroke="url(#splashMark)"
            strokeWidth={BAR}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={[CHEVRON_LENGTH, CHEVRON_LENGTH]}
            strokeDashoffset={dashOffset}
            opacity={strokeOpacity}
          />
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
          <Text style={[typography.bodySmall, styles.tagline]}>{BRAND.launchTagline}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  mark: { width: MARK_W, height: MARK_H },
  copy: { marginTop: 36, paddingHorizontal: 24, alignItems: 'center' },
  name: { color: darkColors.textPrimary, textAlign: 'center', marginBottom: 6 },
  nameAccent: { color: CHAMPAGNE },
  tagline: { color: darkColors.textTertiary, textAlign: 'center', letterSpacing: 0.3 },
});

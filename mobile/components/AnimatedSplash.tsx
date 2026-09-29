import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { BRAND } from '../config/brand';
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

type Phase = 'entering' | 'settled';

const REVEAL_DURATION_MS = 1900;
const REDUCED_REVEAL_DURATION_MS = 500;
const EXIT_DURATION_MS = 260;

// A small constellation of points that converge into the resting mark —
// this stands in for a future logo asset (`BRAND.logo` is intentionally
// null until a final brand is chosen; see config/brand.ts). Positions are
// hand-placed to read as a loose ring settling into a center mark, not a
// literal medical icon.
const DOTS: { dx: number; dy: number; size: number }[] = [
  { dx: -46, dy: -10, size: 6 },
  { dx: -26, dy: -34, size: 5 },
  { dx: 4, dy: -42, size: 6 },
  { dx: 34, dy: -28, size: 5 },
  { dx: 46, dy: 6, size: 6 },
  { dx: 22, dy: 34, size: 5 },
  { dx: -18, dy: 36, size: 5 },
];

const [taglineFirst, taglineSecond] = splitTagline(BRAND.tagline);

function splitTagline(tagline: string): [string, string] {
  const parts = tagline.split(/(?<=\.)\s+/);
  return [parts[0] ?? tagline, parts[1] ?? ''];
}

/**
 * Animated launch sequence: a few points fade in, converge toward the
 * center into a simple resting mark, then the product name and tagline
 * settle in beneath it. Driven by a single progress value interpolated
 * across stages, entirely on the native driver (opacity/transform only) —
 * no react-native-reanimated, per this project's Expo Go constraint.
 */
export function AnimatedSplash({ ready, onFinished }: AnimatedSplashProps) {
  const theme = useTheme();
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('entering');
  const [progress] = useState(() => new Animated.Value(0));
  const [exitOpacity] = useState(() => new Animated.Value(1));
  const exitStarted = useRef(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        if (mounted) setReduceMotion(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return undefined;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: reduceMotion ? REDUCED_REVEAL_DURATION_MS : REVEAL_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setPhase('settled');
    });
    return () => animation.stop();
  }, [reduceMotion, progress]);

  useEffect(() => {
    if (phase !== 'settled' || !ready || exitStarted.current) return undefined;
    exitStarted.current = true;
    const animation = Animated.timing(exitOpacity, {
      toValue: 0,
      duration: EXIT_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onFinished();
    });
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ready]);

  const dotsOpacity = progress.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const convergence = progress.interpolate({ inputRange: [0.1, 0.55, 1], outputRange: [1, 0, 0], extrapolate: 'clamp' });
  const markScale = progress.interpolate({ inputRange: [0.4, 0.65, 0.78, 1], outputRange: [0.85, 1.04, 0.99, 1], extrapolate: 'clamp' });
  const markOpacity = progress.interpolate({ inputRange: [0.35, 0.55, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const nameOpacity = progress.interpolate({ inputRange: [0.55, 0.75, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const nameTranslateY = progress.interpolate({ inputRange: [0.55, 0.75, 1], outputRange: [8, 0, 0], extrapolate: 'clamp' });
  const taglineOneOpacity = progress.interpolate({ inputRange: [0.75, 0.86, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  const taglineTwoOpacity = progress.interpolate({ inputRange: [0.86, 0.97, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });

  return (
    <Animated.View
      style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', opacity: exitOpacity }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading ${BRAND.name}`}
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
        <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
          {reduceMotion ? (
            <Animated.View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: theme.colors.brandPrimary,
                opacity: markOpacity,
              }}
            />
          ) : (
            <>
              {DOTS.map((dot, index) => (
                <Animated.View
                  key={index}
                  style={{
                    position: 'absolute',
                    width: dot.size,
                    height: dot.size,
                    borderRadius: dot.size / 2,
                    backgroundColor: theme.colors.accent,
                    opacity: dotsOpacity,
                    transform: [
                      { translateX: Animated.multiply(convergence, dot.dx) },
                      { translateY: Animated.multiply(convergence, dot.dy) },
                    ],
                  }}
                />
              ))}
              <Animated.View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: theme.colors.brandPrimary,
                  opacity: markOpacity,
                  transform: [{ scale: markScale }],
                }}
              />
            </>
          )}
        </View>

        <Animated.Text
          style={[
            theme.typography.headingMedium,
            {
              color: theme.colors.textPrimary,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              opacity: nameOpacity,
              transform: [{ translateY: nameTranslateY }],
            },
          ]}
          accessibilityRole="header"
        >
          {BRAND.name}
        </Animated.Text>

        <View style={{ alignItems: 'center', gap: 2 }}>
          <Animated.Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, opacity: taglineOneOpacity }]}>
            {taglineFirst}
          </Animated.Text>
          {taglineSecond ? (
            <Animated.Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary, opacity: taglineTwoOpacity }]}>
              {taglineSecond}
            </Animated.Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

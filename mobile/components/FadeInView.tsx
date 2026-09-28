import React, { useEffect, useState } from 'react';
import { Animated } from 'react-native';

export type FadeInViewProps = {
  children: React.ReactNode;
  /** Stagger delay in ms — pass index * 40 or similar when animating a list. */
  delay?: number;
  style?: React.ComponentProps<typeof Animated.View>['style'];
};

/**
 * A subtle, fast entrance for cards and list rows: a short fade paired with
 * a small upward slide. Deliberately restrained (short duration, small
 * distance, no bounce/spring) per the design system's "premium, not
 * gamified" microinteraction rule. Uses React Native's built-in Animated
 * API — react-native-reanimated is not part of this project.
 */
export function FadeInView({ children, delay = 0, style }: FadeInViewProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(6));

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, delay, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, translateY, delay]);

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

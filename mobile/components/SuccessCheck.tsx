import React, { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../design/theme';

export type SuccessCheckProps = {
  size?: number;
};

/**
 * A small, restrained scale-and-fade entrance for a success checkmark —
 * used on the "Added to Health Memory" screen. No bounce, no gamification;
 * just a quick, premium-feeling confirmation using React Native's built-in
 * Animated API (react-native-reanimated is not used in this project).
 */
export function SuccessCheck({ size = 56 }: SuccessCheckProps) {
  const theme = useTheme();
  const [scale] = useState(() => new Animated.Value(0.8));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Ionicons name="checkmark-circle" size={size} color={theme.colors.success} />
    </Animated.View>
  );
}

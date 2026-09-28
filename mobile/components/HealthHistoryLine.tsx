import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../design/theme';

export type HealthHistoryLineProps = {
  years: string[];
  activeYear?: string;
};

/**
 * The product's signature visual motif: a quiet timeline of years connected
 * by a hairline rule (e.g. "2019 ─── 2021 ─── 2023 ─── 2026"). Used
 * wherever the product wants to say "this is about your history over
 * time" without a chart or a card — Home's "Your Health Story" section,
 * and available for reuse on Timeline. Deliberately not a Card: it's a
 * piece of typography/line-work, not a content surface.
 */
export function HealthHistoryLine({ years, activeYear }: HealthHistoryLineProps) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityLabel={`Health history from ${years[0]} to ${years[years.length - 1]}`}>
      {years.map((year, index) => {
        const isActive = activeYear ? year === activeYear : index === years.length - 1;
        return (
          <React.Fragment key={year}>
            <View style={{ alignItems: 'center', gap: theme.spacing.xxs }}>
              <View
                style={{
                  width: isActive ? 7 : 5,
                  height: isActive ? 7 : 5,
                  borderRadius: 4,
                  backgroundColor: isActive ? theme.colors.brandPrimary : theme.colors.borderStrong,
                }}
              />
              <Text
                style={[
                  isActive ? theme.typography.labelMedium : theme.typography.labelSmall,
                  { color: isActive ? theme.colors.textPrimary : theme.colors.textTertiary },
                ]}
              >
                {year}
              </Text>
            </View>
            {index < years.length - 1 ? (
              <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.border, marginHorizontal: 4, marginBottom: 16 }} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

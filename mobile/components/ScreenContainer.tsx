import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../design/theme';

/**
 * True when a screen is shown inside another screen that already keeps clear of the status bar
 * (the Health hub's sections). The inner screen then skips its own top inset, so the space is
 * not added twice.
 */
export const EmbeddedScreenContext = React.createContext(false);

export type ScreenContainerProps = {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
};

/** Standard screen wrapper: safe area + background + consistent padding.
 * Every screen should render through this (or a FlatList with the same
 * padding) instead of a bare View, so spacing stays consistent. */
export function ScreenContainer({
  children,
  scroll = true,
  edges: requestedEdges = ['top', 'left', 'right'],
  contentStyle,
  refreshing,
  onRefresh,
}: ScreenContainerProps) {
  const theme = useTheme();
  const embedded = React.useContext(EmbeddedScreenContext);
  const edges = embedded ? requestedEdges.filter((e) => e !== 'top') : requestedEdges;

  if (!scroll) {
    return (
      <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.content, { padding: theme.spacing.lg }, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        // Fills the screen and always scrolls vertically; the extra bottom
        // space keeps the last control (e.g. Sign out on Me) clear of the tab
        // bar so it can always be scrolled fully into view on small screens.
        style={styles.flex}
        contentContainerStyle={[
          { padding: theme.spacing.lg, paddingBottom: theme.spacing.huge, gap: theme.spacing.lg, flexGrow: 1 },
          contentStyle,
        ]}
        alwaysBounceVertical
        showsVerticalScrollIndicator
        testID="screen-scroll"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.colors.brandPrimary} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1 },
});

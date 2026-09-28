import React from 'react';
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../design/theme';

export type ModalProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/** Full-screen modal used for focused tasks (e.g. confirmation dialogs). */
export function Modal({ visible, onClose, title, children }: ModalProps) {
  const theme = useTheme();
  return (
    <RNModal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <SafeAreaView style={{ width: '100%' }}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radius.lg,
                padding: theme.spacing.lg,
                margin: theme.spacing.lg,
              },
            ]}
          >
            {title ? (
              <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary, marginBottom: theme.spacing.sm }]}>
                {title}
              </Text>
            ) : null}
            {children}
          </View>
        </SafeAreaView>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
  },
  sheet: {
    maxHeight: '80%',
  },
});

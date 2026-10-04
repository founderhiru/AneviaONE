import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthOptions } from '../../components/AuthOptions';
import { BrandMark } from '../../components/BrandMark';
import { EmeraldField, EXPLORE } from '../../components/explore/ExploreUI';
import { BRAND } from '../../config/brand';
import { spacing } from '../../design/spacing';
import { typography } from '../../design/typography';

/**
 * The close of the Explore experience: from the sample to the person's own
 * history, through the existing sign-in. Deliberately quiet — no features
 * list, no pricing, nothing to dismiss.
 */
export default function MakeItYoursScreen() {
  const backIcon = Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back';
  return (
    <View style={styles.root} testID="make-it-yours-screen">
      <StatusBar style="light" />
      <EmeraldField id="makeItYoursScreen" />
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={styles.back}
          testID="make-it-yours-back"
        >
          <Ionicons name={backIcon} size={24} color={EXPLORE.onDark} />
        </Pressable>

        <View style={styles.hero}>
          <BrandMark size={132} id="makeItYoursScreenMark" />
          <Text style={styles.eyebrow}>MAKE IT YOURS</Text>
          <Text style={styles.title} accessibilityRole="header">
            Your health has a history.
          </Text>
          <Text style={styles.copy}>
            {`Bring your own health records into ${BRAND.wordmark} and keep your health history connected over time.`}
          </Text>
        </View>

        <View style={styles.actions}>
          <AuthOptions />
          <Text style={styles.fine}>Your health information belongs to you.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: EXPLORE.field },
  safe: { flex: 1, paddingHorizontal: spacing.xl },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center', marginLeft: -spacing.xs },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  eyebrow: { ...typography.labelSmall, color: EXPLORE.gold, letterSpacing: 3, marginTop: spacing.xs },
  title: { ...typography.displayMedium, color: EXPLORE.onDark, textAlign: 'center' },
  copy: { ...typography.bodyLarge, color: EXPLORE.onDarkMuted, textAlign: 'center', maxWidth: 340 },
  actions: { gap: spacing.sm, paddingBottom: spacing.xs },
  fine: { ...typography.bodySmall, color: EXPLORE.onDarkMuted, textAlign: 'center', marginTop: spacing.xxs },
});

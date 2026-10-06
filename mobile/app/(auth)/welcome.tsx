import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthOptions } from '../../components/AuthOptions';
import { BrandAtmosphere } from '../../components/BrandAtmosphere';
import { BrandMark } from '../../components/BrandMark';
import { BrandTagline, BrandWordmark } from '../../components/BrandWordmark';
import { BRAND } from '../../config/brand';
import { BRAND_TYPE, FOREST } from '../../design/brandSurface';
import { SESSION_EXPIRED_MESSAGE, useAuth } from '../../hooks/useAuth';

/**
 * Welcome continues the launch splash: the same forest field, the same mark,
 * wordmark and tagline, now with the ways in. Splash and Welcome render the
 * same components, so there is only ever one AneviaONE mark.
 */
export default function WelcomeScreen() {
  const { notice } = useAuth();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <BrandAtmosphere id="welcomeField" strands />
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <View style={styles.hero}>
          {notice === 'session_expired' ? (
            <Text style={styles.notice} accessibilityRole="alert" testID="session-expired-notice">
              {SESSION_EXPIRED_MESSAGE}
            </Text>
          ) : null}
          <BrandMark size={168} />
          <View style={styles.copy}>
            <BrandWordmark />
            <BrandTagline />
          </View>
        </View>

        <View style={styles.actions}>
          <AuthOptions />
          <Pressable
            onPress={() => router.push('/explore')}
            accessibilityRole="button"
            accessibilityLabel={`Explore ${BRAND.wordmark}`}
            accessibilityHint="Opens a sample health history. No sign-in needed."
            testID="explore-cta"
            style={({ pressed }) => [styles.explore, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={styles.exploreLabel} maxFontSizeMultiplier={1.6}>
              {`Explore ${BRAND.wordmark}`}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={FOREST.champagne} />
          </Pressable>
          <Text style={styles.fine}>By continuing, you agree that your health information belongs to you.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FOREST.field },
  safe: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 },
  copy: { alignItems: 'center' },
  notice: { ...BRAND_TYPE.fine, fontSize: 14, color: FOREST.champagne, textAlign: 'center' },
  actions: { gap: 12, paddingBottom: 8 },
  explore: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  exploreLabel: { ...BRAND_TYPE.button, fontSize: 16, color: FOREST.champagne },
  fine: { ...BRAND_TYPE.fine, color: FOREST.textMuted, textAlign: 'center' },
});

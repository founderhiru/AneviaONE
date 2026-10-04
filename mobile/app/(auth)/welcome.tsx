import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '../../components/BrandMark';
import { BRAND, taglineLines, wordmarkParts } from '../../config/brand';
import { SESSION_EXPIRED_MESSAGE, useAuth } from '../../hooks/useAuth';

// Welcome continues the emerald launch splash; these colours are local to it.
const FIELD = '#07291F';
const WHITE = '#F6F9F4';
const WARM_WHITE = '#FBF8EF';
const DEEP_EMERALD = '#0B3D2C';
const MINT = '#7FE3C0';
const GOLD = '#F1E3B0';

const [nameLead, nameAccent] = wordmarkParts();
const supportLines = taglineLines(BRAND.welcomeTagline).filter(Boolean);

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function AuthButton({
  label,
  icon,
  onPress,
  primary = false,
  testID,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  primary?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.button, primary ? styles.primary : styles.secondary, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name={icon} size={20} color={primary ? DEEP_EMERALD : WHITE} style={styles.buttonIcon} />
      <Text style={[styles.buttonLabel, { color: primary ? DEEP_EMERALD : WHITE }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Soft emerald atmosphere with two faint sweeps of light at the edges. */
function Atmosphere() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <RadialGradient id="welcomeField" cx="50%" cy="34%" rx="85%" ry="70%">
          <Stop offset="0" stopColor="#11523F" />
          <Stop offset="0.3" stopColor="#0D4535" />
          <Stop offset="0.55" stopColor="#0A382B" />
          <Stop offset="0.8" stopColor="#082D22" />
          <Stop offset="1" stopColor="#051F17" />
        </RadialGradient>
        <RadialGradient id="welcomeVignette" cx="50%" cy="42%" rx="75%" ry="70%">
          <Stop offset="0.55" stopColor="#020D09" stopOpacity={0} />
          <Stop offset="1" stopColor="#020D09" stopOpacity={0.5} />
        </RadialGradient>
        <RadialGradient id="welcomeFloor" cx="50%" cy="100%" rx="55%" ry="12%">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.16} />
          <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="welcomeSweep" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.55} />
          <Stop offset="0.6" stopColor={MINT} stopOpacity={0.25} />
          <Stop offset="1" stopColor={MINT} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="welcomeSweepR" x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor={GOLD} stopOpacity={0.5} />
          <Stop offset="0.6" stopColor={MINT} stopOpacity={0.22} />
          <Stop offset="1" stopColor={MINT} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="390" height="844" fill="url(#welcomeField)" />
      {/* Upper-left sweep */}
      <Path d="M -20 150 C 60 220 160 220 300 120" stroke={MINT} strokeOpacity={0.015} strokeWidth={64} strokeLinecap="round" fill="none" />
      <Path d="M -20 155 C 64 224 164 222 304 124" stroke={MINT} strokeOpacity={0.02} strokeWidth={30} strokeLinecap="round" fill="none" />
      <Path d="M -20 160 C 70 230 170 225 310 130" stroke="url(#welcomeSweep)" strokeWidth={1.4} fill="none" />
      <Path d="M -20 178 C 80 240 180 232 320 150" stroke="url(#welcomeSweep)" strokeWidth={0.8} fill="none" />
      {/* Lower-right sweep */}
      <Path d="M 410 520 C 330 600 220 640 60 640" stroke={MINT} strokeOpacity={0.015} strokeWidth={68} strokeLinecap="round" fill="none" />
      <Path d="M 410 525 C 326 605 216 646 56 648" stroke={MINT} strokeOpacity={0.02} strokeWidth={32} strokeLinecap="round" fill="none" />
      <Path d="M 410 530 C 320 610 210 650 50 655" stroke="url(#welcomeSweepR)" strokeWidth={1.4} fill="none" />
      <Path d="M 410 548 C 330 625 230 668 70 676" stroke="url(#welcomeSweepR)" strokeWidth={0.8} fill="none" />
      <Rect x="0" y="0" width="390" height="844" fill="url(#welcomeFloor)" />
      <Rect x="0" y="0" width="390" height="844" fill="url(#welcomeVignette)" />
    </Svg>
  );
}

export default function WelcomeScreen() {
  const { notice } = useAuth();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Atmosphere />
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
        <View style={styles.hero}>
          {notice === 'session_expired' ? (
            <Text style={styles.notice} accessibilityRole="alert" testID="session-expired-notice">
              {SESSION_EXPIRED_MESSAGE}
            </Text>
          ) : null}
          <BrandMark size={176} />
          <Text style={styles.name} accessibilityRole="header">
            {nameLead}
            {nameAccent ? <Text style={styles.nameAccent}>{nameAccent}</Text> : null}
          </Text>
          <View accessible accessibilityLabel={BRAND.welcomeTagline}>
            {supportLines.map((line) => (
              <Text key={line} style={styles.support}>
                {line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <AuthButton
            primary
            label="Continue with Mobile"
            icon="phone-portrait-outline"
            onPress={() => router.push('/(auth)/login?method=mobile')}
            testID="continue-with-mobile"
          />
          <AuthButton
            label="Continue with Email"
            icon="mail-outline"
            onPress={() => router.push('/(auth)/login?method=email')}
            testID="continue-with-email"
          />
          <AuthButton
            label="Continue with Google"
            icon="logo-google"
            onPress={() => router.push('/(auth)/login?method=google')}
            testID="continue-with-google"
          />
          <Text style={styles.fine}>By continuing, you agree that your health information belongs to you.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: FIELD },
  safe: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  notice: { color: GOLD, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  name: { color: WHITE, fontSize: 40, lineHeight: 48, fontWeight: '600', letterSpacing: 0.2, textAlign: 'center', marginTop: 6 },
  nameAccent: { color: MINT },
  support: {
    color: 'rgba(246, 249, 244, 0.82)',
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '500',
    letterSpacing: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  actions: { gap: 12, paddingBottom: 8 },
  button: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: WARM_WHITE },
  secondary: { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderWidth: 1, borderColor: 'rgba(246, 249, 244, 0.38)' },
  buttonIcon: { marginRight: 12 },
  buttonLabel: { fontSize: 17, fontWeight: '600', letterSpacing: 0.1 },
  fine: { color: 'rgba(246, 249, 244, 0.7)', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 10 },
});

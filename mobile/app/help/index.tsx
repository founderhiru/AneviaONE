import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { Card, ScreenContainer, ScreenHeader, StatusBadge } from '../../components';
import { BRAND } from '../../config/brand';
import { FAQ_TOPICS, isFaqTopic, mobileFaq, type ResolvedFaqEntry } from '../../config/faq';
import { useTheme } from '../../design/theme';

/**
 * Me → Help & FAQ. The data & security topic (`?topic=data-security`) is no longer linked from Me.
 *
 * The questions and answers come from the shared FAQ (shared/faq.ts, also
 * used by the website) — only entries marked `mobileVisible`. Each question is
 * a button that expands its answer in place; expanded state is exposed to
 * screen readers, and the expand animation is skipped under Reduce Motion.
 */
export default function HelpFaqScreen() {
  const theme = useTheme();
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const activeTopic = isFaqTopic(topic) ? topic : undefined;
  const entries = mobileFaq(activeTopic);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const reduceMotion = useReduceMotion();

  function toggle(id: string) {
    if (!reduceMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));
    }
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <ScreenContainer>
      <ScreenHeader title={activeTopic ? FAQ_TOPICS[activeTopic].title : 'Help & FAQ'} />

      <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
        {activeTopic
          ? `How ${BRAND.productName} handles your records and data today, and what is still to come.`
          : `Straight answers about what ${BRAND.productName} does today, what’s coming next, and what it doesn’t do.`}
      </Text>

      <View style={{ gap: theme.spacing.sm }}>
        {entries.map((entry) => (
          <FaqRow key={entry.id} entry={entry} open={openIds.has(entry.id)} onToggle={() => toggle(entry.id)} />
        ))}
      </View>

      <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <Ionicons name="medkit-outline" size={20} color={theme.colors.brandSecondary} />
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, flex: 1 }]}>
            {BRAND.productName} is not for emergencies and doesn&rsquo;t give medical advice. If you think you may have
            a medical emergency, contact your local emergency number.
          </Text>
        </View>
      </Card>

      <Card padded={false}>
        <LinkRow label="Privacy & Security" onPress={() => router.push('/privacy')} />
        <LinkRow label="Terms of Service" onPress={() => router.push('/help/terms')} divider />
      </Card>
    </ScreenContainer>
  );
}

function FaqRow({ entry, open, onToggle }: { entry: ResolvedFaqEntry; open: boolean; onToggle: () => void }) {
  const theme = useTheme();
  return (
    <Card padded={false}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Hides the answer' : 'Shows the answer'}
        testID={`faq-question-${entry.id}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: theme.minTouchTarget,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{entry.question}</Text>
          {entry.statusLabel ? (
            <StatusBadge label={entry.statusLabel} tone={entry.status === 'partial' ? 'accent' : 'neutral'} />
          ) : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.accent} />
      </Pressable>
      {open ? (
        <View
          testID={`faq-answer-${entry.id}`}
          style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md, gap: theme.spacing.xs }}
        >
          {entry.answer.map((paragraph) => (
            <Text key={paragraph} style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]}>
              {paragraph}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function LinkRow({ label, onPress, divider }: { label: string; onPress: () => void; divider?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: theme.minTouchTarget,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: theme.colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={[theme.typography.bodyLarge, { color: theme.colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

/** Mirrors the OS Reduce Motion setting (same approach as AnimatedSplash). */
function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setReduceMotion(enabled))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);
  return reduceMotion;
}

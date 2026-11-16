import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../Card';
import { StatusBadge, type StatusTone } from '../StatusBadge';
import { useTheme } from '../../design/theme';
import { STATUS_LABEL, viaText, type Integration, type SourceStatus } from '../../services/connected/integrations';

const TONE: Record<SourceStatus, StatusTone> = { coming_soon: 'neutral', available: 'accent', connected: 'success' };

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  return <StatusBadge label={STATUS_LABEL[status]} tone={TONE[status]} />;
}

export function IconTile({ icon, active }: { icon: keyof typeof Ionicons.glyphMap; active?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.colors.accentSubtle : theme.colors.surfaceAlt,
      }}
    >
      <Ionicons name={icon} size={22} color={active ? theme.colors.accent : theme.colors.textTertiary} />
    </View>
  );
}

/** Four-way switch: one panel at a time keeps the page short. */
export function Segments<T extends string>({ options, value, onChange, testIDPrefix }: { options: { key: T; label: string }[]; value: T; onChange: (key: T) => void; testIDPrefix: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: 3 }}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`${testIDPrefix}-${o.key}`}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: 2, borderRadius: theme.radius.sm, backgroundColor: selected ? theme.colors.surface : 'transparent' }}
          >
            <Text style={[theme.typography.labelMedium, { color: selected ? theme.colors.textPrimary : theme.colors.textTertiary }]} numberOfLines={1} adjustsFontSizeToFit>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A full source card: what it is, what it could share, and its honest status. Pressable only when it leads somewhere real. */
export function SourceCard({ item, onOpen }: { item: Integration; onOpen?: (route: NonNullable<Integration['route']>) => void }) {
  const theme = useTheme();
  const go = item.status !== 'coming_soon' && item.route && onOpen ? () => onOpen(item.route as NonNullable<Integration['route']>) : undefined;
  const via = viaText(item);
  const body = (
    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
      <IconTile icon={item.icon} active={item.status !== 'coming_soon'} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.xs }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, flex: 1 }]}>{item.name}</Text>
          <SourceStatusBadge status={item.status} />
        </View>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{item.summary}</Text>
        {via ? <Text style={[theme.typography.labelSmall, { color: theme.colors.textTertiary }]}>{via}</Text> : null}
        {item.dataTypes.length > 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{item.dataTypes.join(' · ')}</Text>
        ) : null}
        {item.note ? <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{item.note}</Text> : null}
      </View>
      {go ? <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} style={{ alignSelf: 'center' }} /> : null}
    </View>
  );
  return (
    <Card onPress={go} accessibilityLabel={go ? `${item.name}, ${STATUS_LABEL[item.status]}` : undefined} testID={`source-${item.id}`}>
      {body}
    </Card>
  );
}

/** A compact tile for the wearables grid. */
export function WearableTile({ item }: { item: Integration }) {
  const theme = useTheme();
  return (
    <View
      testID={`source-${item.id}`}
      accessible
      accessibilityLabel={`${item.name}. ${viaText(item) ?? ''}. ${STATUS_LABEL[item.status]}`}
      style={{ width: '48.5%', gap: 6, padding: theme.spacing.sm, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
    >
      <IconTile icon={item.icon} />
      <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{item.name}</Text>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{viaText(item) ?? ''}</Text>
      <SourceStatusBadge status={item.status} />
    </View>
  );
}

export function ActionButton({ label, onPress, primary, testID, icon }: { label: string; onPress: () => void; primary?: boolean; testID?: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: theme.minTouchTarget,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor: primary ? theme.colors.brandPrimary : theme.colors.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={18} color={primary ? theme.colors.textOnDark : theme.colors.textPrimary} /> : null}
      <Text style={[theme.typography.labelLarge, { color: primary ? theme.colors.textOnDark : theme.colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

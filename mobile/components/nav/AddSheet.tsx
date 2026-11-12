import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { BottomSheet } from '../BottomSheet';
import { VAULT_ENABLED } from '../../config/vaultFlag';
import { useTheme } from '../../design/theme';
import { usePeople } from '../../hooks/usePeople';
import { canAddReports, canAddVaultFiles, isOwnRecord, type Person } from '../../services/people/peopleService';

/**
 * The centre Add button (new navigation): two clear choices. A health report goes to the
 * existing Add flow unchanged (own record and relatives you control, as before); a Personal Document
 * goes to the Documents add flow (Choose a file / Take a photo / Choose a photo) and can also be
 * added for someone who made you their manager.
 */
export function AddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const { people, active, switchTo } = usePeople();
  const canAddHealth = canAddReports(active);
  const canAddDocument = VAULT_ENABLED && canAddVaultFiles(active);
  const canAdd = canAddHealth || canAddDocument;
  const name = active && !isOwnRecord(active) ? active.name.split(' ')[0] : null;
  const label = (p: Person) => (isOwnRecord(p) ? 'Me' : p.name.split(' ')[0]);
  const open = (path: '/add' | '/vault?add=1') => {
    onClose();
    router.push(path);
  };
  return (
    <BottomSheet visible={visible} onClose={onClose} title={name && canAdd ? `Add for ${name}` : 'Add'}>
      {people.length > 1 && active ? (
        <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.md }} testID="add-for">
          <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Adding for</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {people.map((p) => {
              const selected = p.id === active.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => switchTo(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`add-for-${p.id}`}
                  style={{ minHeight: theme.minTouchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing.md, borderRadius: 999, borderWidth: 1, borderColor: selected ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surface }}
                >
                  <Text style={[theme.typography.labelMedium, { color: selected ? '#FFFFFF' : theme.colors.textPrimary }]}>{label(p)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {!canAdd ? (
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textSecondary }]} testID="add-blocked">
          You can view {active?.name}&rsquo;s records, but only they can add to them. Switch to Me to add something.
        </Text>
      ) : (
        <View style={{ gap: theme.spacing.xs }}>
          {canAddHealth ? <AddRow icon="heart-outline" title="Add a Health Report" detail="Upload a PDF, take a photo, choose a photo or scan" testID="add-health" onPress={() => open('/add')} /> : null}
          {canAddDocument ? (
            <AddRow icon="folder-open-outline" title="Add a Personal Document" detail="Passport, insurance, certificates and more" testID="add-document" onPress={() => open('/vault?add=1')} />
          ) : null}
        </View>
      )}
    </BottomSheet>
  );
}

function AddRow({ icon, title, detail, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: theme.minTouchTarget + 8 }}>
      <Ionicons name={icon} size={22} color={theme.colors.success} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.typography.bodyLarge, { color: theme.colors.textPrimary }]}>{title}</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

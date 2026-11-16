import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { Button, Card, EmptyState, ErrorState, LoadingState, ScreenContainer, ScreenHeader, StatusBadge } from '../../components';
import { useTheme } from '../../design/theme';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { usePeople } from '../../hooks/usePeople';
import { canAddReports } from '../../services/people/peopleService';
import { healthService } from '../../services/health/healthService';
import type { Medication } from '../../types';

const statusLabel: Record<Medication['status'], string> = {
  active: 'Active',
  past: 'Past',
  as_needed: 'As needed',
  recorded: 'Recorded',
};

export default function MedicationsScreen() {
  const theme = useTheme();
  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setMedications(await healthService.getMedications());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);
  // A medicine was added, changed or removed (or another person was chosen): show the list as it is now.
  useHealthMemoryUpdates(load);
  const { active } = usePeople();
  const canChange = canAddReports(active);
  const originLabel: Partial<Record<NonNullable<Medication['origin']>, string>> = { user_entered: 'Added by you', user_corrected: 'Changed by you' };

  return (
    <ScreenContainer>
      <ScreenHeader title="Medications" />
      {error ? (
        <ErrorState onRetry={load} />
      ) : medications === null ? (
        <LoadingState label="Loading medications…" />
      ) : medications.length === 0 ? (
        <EmptyState
          icon={<Ionicons name="medkit-outline" size={40} color={theme.colors.textDisabled} />}
          title="No medications yet"
          description="Medicines read from your reports and prescriptions show up here. If a prescription can't be read, you can add them yourself."
          actionLabel={canChange ? 'Add a medicine' : 'Add your first record'}
          onActionPress={() => router.push(canChange ? '/medications/form' : '/add')}
        />
      ) : (
        medications.map((med) => (
          <Card
            key={med.id}
            // Yours to change: open it. Otherwise open the report it came from, when there is one.
            onPress={
              canChange && med.recordId
                ? () => router.push({ pathname: '/medications/form', params: { id: med.recordId as string } })
                : med.sourceDocumentId
                  ? () => router.push(`/documents/${med.sourceDocumentId}`)
                  : undefined
            }
            accessibilityLabel={`${med.name}${canChange && med.recordId ? ', change' : ''}`}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{med.name}</Text>
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                  {/* Production records carry the dose as written and no frequency. */}
                  {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' · ') || (med.origin && med.origin !== 'extracted' ? 'No dose added' : 'As written on your report')}
                </Text>
                {med.instructions ? (
                  <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} testID={`med-instructions-${med.id}`}>
                    {med.instructions}
                  </Text>
                ) : null}
                {med.prescribedBy ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                    Prescribed by {med.prescribedBy}
                  </Text>
                ) : null}
                {med.origin && originLabel[med.origin] ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} testID={`med-origin-${med.id}`}>
                    {originLabel[med.origin]}
                  </Text>
                ) : null}
              </View>
              <StatusBadge label={statusLabel[med.status]} tone={med.status === 'active' ? 'success' : 'neutral'} />
            </View>
          </Card>
        ))
      )}
      {canChange && medications && medications.length > 0 ? (
        <Button label="Add a medicine" variant="secondary" onPress={() => router.push('/medications/form')} testID="medications-add" />
      ) : null}
    </ScreenContainer>
  );
}

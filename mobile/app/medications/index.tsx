import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, ErrorState, LoadingState, ScreenContainer, ScreenHeader, StatusBadge } from '../../components';
import { useTheme } from '../../design/theme';
import { healthService } from '../../services/health/healthService';
import type { Medication } from '../../types';

const statusLabel: Record<Medication['status'], string> = {
  active: 'Active',
  past: 'Past',
  as_needed: 'As needed',
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

  return (
    <ScreenContainer>
      <ScreenHeader title="Medications" />
      {error ? (
        <ErrorState onRetry={load} />
      ) : medications === null ? (
        <LoadingState label="Loading medications…" />
      ) : (
        medications.map((med) => (
          <Card key={med.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{med.name}</Text>
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                  {med.dosage} · {med.frequency}
                </Text>
                {med.prescribedBy ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                    Prescribed by {med.prescribedBy}
                  </Text>
                ) : null}
              </View>
              <StatusBadge label={statusLabel[med.status]} tone={med.status === 'active' ? 'success' : 'neutral'} />
            </View>
          </Card>
        ))
      )}
    </ScreenContainer>
  );
}

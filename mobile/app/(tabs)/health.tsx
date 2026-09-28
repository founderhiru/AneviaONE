import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { Card, ErrorState, LoadingState, ScreenContainer, SectionHeader, StatusBadge, TrendCard } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { healthService } from '../../services/health/healthService';
import type { Allergy, Condition, Medication, Procedure, Trend, Vaccination } from '../../types';

type HealthData = {
  trends: Trend[];
  medications: Medication[];
  conditions: Condition[];
  allergies: Allergy[];
  vaccinations: Vaccination[];
  procedures: Procedure[];
};

const HEART_KEYWORDS = ['blood pressure', 'heart', 'pulse', 'ecg', 'ekg', 'cardiac'];

/** Groups trends into the brief's named health categories. This is a light
 * keyword heuristic over metric names — a real system would tag this at
 * the observation level (see Observation['category'] for the closer, but
 * still coarse, equivalent used elsewhere). Everything else falls under
 * "Blood & Metabolic" since that covers the current mock dataset. */
function isHeartMetric(metricName: string): boolean {
  const lower = metricName.toLowerCase();
  return HEART_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export default function HealthScreen() {
  const theme = useTheme();
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const [trends, medications, conditions, allergies, vaccinations, procedures] = await Promise.all([
        healthService.getTrends(),
        healthService.getMedications(),
        healthService.getConditions(),
        healthService.getAllergies(),
        healthService.getVaccinations(),
        healthService.getProcedures(),
      ]);
      setData({ trends, medications, conditions, allergies, vaccinations, procedures });
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (error) {
    return (
      <ScreenContainer>
        <ErrorState onRetry={load} />
      </ScreenContainer>
    );
  }

  if (!data) {
    return (
      <ScreenContainer>
        <LoadingState label="Loading your health details…" />
      </ScreenContainer>
    );
  }

  const heartTrends = data.trends.filter((t) => isHeartMetric(t.metricName));
  const bloodMetabolicTrends = data.trends.filter((t) => !isHeartMetric(t.metricName));

  return (
    <ScreenContainer>
      <Text style={[theme.typography.displayMedium, { color: theme.colors.textPrimary }]} accessibilityRole="header">
        Health
      </Text>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Blood & Metabolic" />
        {bloodMetabolicTrends.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            {PRODUCT_TERMS.healthTrends} for blood and metabolic markers will appear here once you add a report.
          </Text>
        ) : (
          bloodMetabolicTrends.map((trend) => (
            <TrendCard key={trend.id} trend={trend} onPress={() => router.push(`/trends/${encodeURIComponent(trend.metricName)}`)} />
          ))
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Heart" />
        {heartTrends.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            Blood pressure and other heart-related trends appear here once they&rsquo;re added to your Health
            Memory.
          </Text>
        ) : (
          heartTrends.map((trend) => (
            <TrendCard key={trend.id} trend={trend} onPress={() => router.push(`/trends/${encodeURIComponent(trend.metricName)}`)} />
          ))
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Medications" actionLabel="View All" onActionPress={() => router.push('/medications')} />
        {data.medications.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>None on file.</Text>
        ) : (
          data.medications.slice(0, 3).map((med) => (
            <Card key={med.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{med.name}</Text>
                  <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                    {med.dosage} · {med.frequency}
                  </Text>
                </View>
                <StatusBadge label={med.status === 'active' ? 'Active' : med.status === 'past' ? 'Past' : 'As needed'} tone={med.status === 'active' ? 'success' : 'neutral'} />
              </View>
            </Card>
          ))
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Conditions" />
        {data.conditions.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>None on file.</Text>
        ) : (
          data.conditions.map((c) => (
            <Card key={c.id}>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{c.name}</Text>
            </Card>
          ))
        )}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Vitals" />
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
          Blood pressure and other vitals appear here as they&rsquo;re added to your Health Memory.
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Procedures" />
        {data.procedures.map((p) => (
          <Card key={p.id}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{p.name}</Text>
          </Card>
        ))}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Allergies" />
        {data.allergies.map((a) => (
          <Card key={a.id}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{a.substance}</Text>
            {a.reaction ? (
              <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{a.reaction}</Text>
            ) : null}
          </Card>
        ))}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Vaccinations" />
        {data.vaccinations.map((v) => (
          <Card key={v.id}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{v.name}</Text>
          </Card>
        ))}
      </View>
    </ScreenContainer>
  );
}

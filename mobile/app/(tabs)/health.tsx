import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { Card, ErrorState, LoadingState, ScreenContainer, SectionHeader, StatusBadge, TrendCard } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { healthService } from '../../services/health/healthService';
import type { Allergy, Condition, Medication, Procedure, RecordedObservation, Trend, Vaccination } from '../../types';

type HealthData = {
  results: RecordedObservation[];
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
      const [results, trends, medications, conditions, allergies, vaccinations, procedures] = await Promise.all([
        healthService.getRecordedObservations(),
        healthService.getTrends(),
        healthService.getMedications(),
        healthService.getConditions(),
        healthService.getAllergies(),
        healthService.getVaccinations(),
        healthService.getProcedures(),
      ]);
      setData({ results, trends, medications, conditions, allergies, vaccinations, procedures });
    } catch {
      setError(true);
    }
  }

  // A report finished reading: show its new records.
  useHealthMemoryUpdates(load);

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

      <View style={{ gap: theme.spacing.sm }} testID="test-results">
        <SectionHeader title="Test results" />
        {data.results.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            Results read from your reports appear here, each with the report and page it came from.
          </Text>
        ) : (
          data.results.slice(0, 20).map((r) => <TestResultCard key={r.id} result={r} />)
        )}
      </View>

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
                    {[med.dosage, med.frequency].filter(Boolean).join(' · ') || 'As written on your report'}
                  </Text>
                </View>
                <StatusBadge label={med.status === 'active' ? 'Active' : med.status === 'past' ? 'Past' : med.status === 'as_needed' ? 'As needed' : 'Recorded'} tone={med.status === 'active' ? 'success' : 'neutral'} />
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
            <Card key={c.id} onPress={c.sourceDocumentId ? () => router.push(`/documents/${c.sourceDocumentId}`) : undefined}>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{c.name}</Text>
              {c.assertion ? (
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                  {c.assertion === 'diagnosed' ? 'Recorded as diagnosed' : c.assertion === 'reported' ? 'Reported' : 'Mentioned in a report (not a diagnosis)'}
                </Text>
              ) : null}
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
        {data.procedures.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>None recorded.</Text>
        ) : null}
        {data.procedures.map((p) => (
          <Card key={p.id}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{p.name}</Text>
          </Card>
        ))}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <SectionHeader title="Allergies" />
        {data.allergies.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>None recorded.</Text>
        ) : null}
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
        {data.vaccinations.length === 0 ? (
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>None recorded.</Text>
        ) : null}
        {data.vaccinations.map((v) => (
          <Card key={v.id}>
            <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{v.name}</Text>
          </Card>
        ))}
      </View>
    </ScreenContainer>
  );
}

function formatResultDate(iso: string | null): string {
  if (!iso) return 'Date not clear on report';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** One result, exactly as printed, with its source: tapping opens the stored report. */
function TestResultCard({ result }: { result: RecordedObservation }) {
  const theme = useTheme();
  const page = result.source.pageNumber ? `, page ${result.source.pageNumber}` : '';
  return (
    <Card
      onPress={result.source.documentId ? () => router.push(`/documents/${result.source.documentId}`) : undefined}
      accessibilityLabel={`${result.name} ${result.value}${result.unit ? ` ${result.unit}` : ''}, from ${result.source.documentName}${page}`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{result.name}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{formatResultDate(result.date)}</Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} numberOfLines={1}>
            From {result.source.documentName}
            {page}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>
            {result.value}
            {result.unit ? ` ${result.unit}` : ''}
          </Text>
          {result.referenceRange ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Range {result.referenceRange}</Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

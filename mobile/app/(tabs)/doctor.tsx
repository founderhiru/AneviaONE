import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Print from 'expo-print';

import { Button, Card, EmptyState, ErrorState, LoadingState, ScreenContainer } from '../../components';
import { useTheme } from '../../design/theme';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { documentsService } from '../../services/documents/documentsService';
import { buildDoctorBrief, briefDate, type BriefResult, type DoctorBrief } from '../../services/doctor/doctorBrief';
import { doctorBriefHtml } from '../../services/doctor/briefHtml';
import { healthService } from '../../services/health/healthService';
import { profileService } from '../../services/profile/profileService';

/**
 * For Doctor: a one-page summary of the person's own trusted records, for a visit.
 * Built from stored facts only — no AI, no interpretation. "Hand-over view"
 * shows it in large type, read-only, to hold up to a Doctor.
 */
export default function DoctorScreen() {
  const theme = useTheme();
  const [brief, setBrief] = useState<DoctorBrief | null>(null);
  const [error, setError] = useState(false);
  const [handover, setHandover] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [results, documents, medications, conditions, allergies, identity] = await Promise.all([
        healthService.getRecordedObservations(),
        documentsService.listDocuments(),
        healthService.getMedications(),
        healthService.getConditions(),
        healthService.getAllergies(),
        profileService.getMyIdentity().catch(() => ({ fullName: null, dateOfBirth: null })),
      ]);
      setBrief(buildDoctorBrief({ person: { name: identity.fullName, dateOfBirth: identity.dateOfBirth }, results, documents, medications, conditions, allergies }));
    } catch {
      setError(true);
    }
  }, []);

  useHealthMemoryUpdates(load);
  useEffect(() => {
    load();
  }, [load]);

  async function sharePdf() {
    if (!brief || sharing) return;
    setSharing(true);
    setShareError(false);
    try {
      const { uri } = await Print.printToFileAsync({ html: doctorBriefHtml(brief) });
      await Share.share({ url: uri, message: undefined });
    } catch {
      setShareError(true);
    } finally {
      setSharing(false);
    }
  }

  const big = handover;
  const body = [theme.typography.bodyMedium, { color: theme.colors.textPrimary }] as const;
  const bigBody = big ? { fontSize: 20, lineHeight: 28 } : null;

  const Row = ({ r, scope }: { r: BriefResult; scope: 'outside' | 'report' }) => {
    const side = r.position === 'above' ? 'Above' : r.position === 'below' ? 'Below' : null;
    const line = [r.range ? `Report range ${r.range}` : null, side, r.reportTitle].filter(Boolean).join(' · ');
    return (
      <Pressable
        onPress={() => router.push(`/documents/${r.documentId}`)}
        accessibilityRole="button"
        accessibilityLabel={`${r.name}, ${r.value}${r.range ? `, report range ${r.range}` : ''}, ${r.reportTitle}`}
        testID={`doctor-${scope}-${r.id}`}
        style={{ paddingVertical: theme.spacing.xs }}
      >
        <Text style={[...body, bigBody, { fontWeight: '600' }]}>{r.name}  {r.value}</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }, big ? { fontSize: 16 } : null]}>
          {line} · {briefDate(r.date)}
        </Text>
        {r.previous ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }, big ? { fontSize: 16 } : null]}>
            was {r.previous.value} in {briefDate(r.previous.date)}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }, big ? { fontSize: 22 } : null]}>{title}</Text>
      <Card>{children}</Card>
    </View>
  );

  const Plain = ({ items }: { items: string[] }) => (
    <View style={{ gap: 4 }}>
      {items.map((i) => (
        <Text key={i} style={[...body, bigBody]}>{i}</Text>
      ))}
    </View>
  );

  return (
    <ScreenContainer>
      <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">Summary for your Doctor</Text>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>Built only from your own reports, ready to show or send before a visit.</Text>

      {error ? (
        <ErrorState description="We couldn’t prepare your summary. Please try again." onRetry={load} />
      ) : brief === null ? (
        <LoadingState label="Preparing your summary…" />
      ) : brief.resultCount === 0 && brief.medications.length === 0 && brief.conditions.length === 0 && brief.allergies.length === 0 ? (
        <EmptyState
          title="Nothing to show a Doctor yet."
          description="Add a health report and your summary appears here, built only from what is written on it."
          actionLabel="Add health record"
          onActionPress={() => router.push('/add')}
        />
      ) : (
        <View style={{ gap: theme.spacing.md }} testID="doctor-brief">
          <View style={{ gap: 2 }}>
            <Text style={[...body, bigBody, { fontWeight: '600' }]} testID="doctor-person">
              {brief.person.name ?? 'Name not provided'}{brief.person.dateOfBirth ? ` · Born ${briefDate(brief.person.dateOfBirth)}` : ''}
            </Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }, big ? { fontSize: 16 } : null]}>
              {brief.reportCount} {brief.reportCount === 1 ? 'report' : 'reports'} · {brief.resultCount} {brief.resultCount === 1 ? 'result' : 'results'} · Prepared {briefDate(brief.preparedOn)}
            </Text>
            {brief.heldReports > 0 ? (
              <Text style={[theme.typography.caption, { color: theme.colors.warning }, big ? { fontSize: 16 } : null]} testID="doctor-held-note">
                {brief.heldReports} {brief.heldReports === 1 ? 'report has' : 'reports have'} results not yet checked — not included here.
              </Text>
            ) : null}
            {brief.heldReports > 0 && !big ? (
              <Pressable onPress={() => router.push({ pathname: '/documents', params: { filter: 'verify' } })} accessibilityRole="link" testID="doctor-review-link">
                <Text style={[theme.typography.caption, { color: theme.colors.brandPrimary, fontWeight: '600' }]}>Review</Text>
              </Pressable>
            ) : null}
          </View>

          {!big ? (
            <View style={{ gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                <View style={{ flex: 1 }}><Button label="Show to Doctor" onPress={() => setHandover(true)} testID="doctor-handover" /></View>
                <View style={{ flex: 1 }}><Button label={sharing ? 'Preparing…' : 'Send PDF'} variant="secondary" onPress={sharePdf} loading={sharing} testID="doctor-share-pdf" /></View>
              </View>
              {shareError ? <Text style={[theme.typography.caption, { color: theme.colors.danger }]} testID="doctor-share-error">We couldn’t create the PDF. Please try again.</Text> : null}
            </View>
          ) : null}

          <Section title={`Results to mention (${brief.outsideRange.length})`}>
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }, big ? { fontSize: 16 } : null]}>Outside the range printed on the report.</Text>
            {brief.outsideRange.length ? (
              brief.outsideRange.map((r) => <Row key={r.id} r={r} scope="outside" />)
            ) : (
              <Text style={[...body, bigBody]} testID="doctor-none-outside">No result is outside the range printed on its own report.</Text>
            )}
          </Section>

          {brief.trends.length ? (
            <Section title="Changes over time">
              {brief.trends.map((t) => (
                <View key={`${t.name}|${t.unit ?? ''}`} style={{ paddingVertical: theme.spacing.xs }}>
                  <Text style={[...body, bigBody, { fontWeight: '600' }]}>{t.name}</Text>
                  <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }, big ? { fontSize: 18, lineHeight: 26 } : null]}>
                    {t.points.map((p) => `${briefDate(p.date)}: ${p.value}${t.unit ? ' ' + t.unit : ''}`).join('  →  ')}
                  </Text>
                </View>
              ))}
            </Section>
          ) : null}

          {brief.medications.length ? <Section title="Medications listed on reports"><Plain items={brief.medications} /></Section> : null}
          {brief.conditions.length ? <Section title="Conditions stated on reports"><Plain items={brief.conditions} /></Section> : null}
          {brief.allergies.length ? <Section title="Allergies stated on reports"><Plain items={brief.allergies} /></Section> : null}

          {!big ? (
            <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" testID="doctor-see-all">
              <Text style={[theme.typography.bodyMedium, { color: theme.colors.brandPrimary, fontWeight: '600' }]}>
                {showAll ? 'Hide all results' : 'See all results'}
              </Text>
            </Pressable>
          ) : null}
          {showAll || big ? (
            <Section title="All results by report">
              {brief.reports.map((rep) => (
                <View key={rep.documentId} style={{ paddingVertical: theme.spacing.xs, gap: 2 }}>
                  <Text style={[...body, bigBody, { fontWeight: '700' }]}>{rep.title}</Text>
                  {rep.results.map((r) => <Row key={r.id} r={r} scope="report" />)}
                </View>
              ))}
            </Section>
          ) : null}

          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
            Built from your own reports, as written on them. Ranges are the ones printed on each report. Not a diagnosis.
          </Text>

          {big ? <Button label="Done" variant="secondary" onPress={() => setHandover(false)} testID="doctor-handover-done" /> : null}
        </View>
      )}
    </ScreenContainer>
  );
}

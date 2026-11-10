import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Print from 'expo-print';

import { Button, EmptyState, ErrorState, LoadingState, PersonBar, ScreenContainer } from '../../components';
import { FOREST } from '../../design/brandSurface';
import { useTheme } from '../../design/theme';
import { TrendLine } from '../../components/home/HomeV2UI';
import { useHealthMemoryUpdates } from '../../hooks/useHealthMemoryUpdates';
import { documentsService } from '../../services/documents/documentsService';
import { buildDoctorBrief, briefDate, type BriefResult, type DoctorBrief } from '../../services/doctor/doctorBrief';
import { doctorBriefHtml } from '../../services/doctor/briefHtml';
import { healthService } from '../../services/health/healthService';
import { profileService } from '../../services/profile/profileService';
import { getActivePerson, isOwnRecord } from '../../services/people/peopleService';

const BigContext = React.createContext(false);

/** A date is added only when the report's own title doesn't already carry it. */
const where = (r: BriefResult) => {
  const d = briefDate(r.date);
  return r.reportTitle.includes(d) || d === 'Date not clear' ? r.reportTitle : `${r.reportTitle} · ${d}`;
};

function useType() {
  const theme = useTheme();
  const big = React.useContext(BigContext);
  const body = [theme.typography.bodyMedium, { color: theme.colors.textPrimary }, big ? { fontSize: 20, lineHeight: 28 } : null];
  const small = [theme.typography.caption, { color: theme.colors.textTertiary }, big ? { fontSize: 16, lineHeight: 22 } : null];
  return { theme, big, body, small };
}

function Hairline() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.colors.border }} />;
}

function ResultRow({ r, scope }: { r: BriefResult; scope: 'outside' | 'report' }) {
  const { theme, big, body, small } = useType();
  const side = r.position === 'above' ? 'Above' : r.position === 'below' ? 'Below' : null;
  return (
    <Pressable
      onPress={() => router.push(`/documents/${r.documentId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${r.name}, ${r.value}${r.range ? `, report range ${r.range}` : ''}, ${r.reportTitle}`}
      testID={`doctor-${scope}-${r.id}`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[...body, { fontWeight: '600' }]}>{r.name}</Text>
        <Text style={small}>{[r.range ? `Printed range ${r.range}` : null, where(r)].filter(Boolean).join(' · ')}</Text>
        {r.previous ? <Text style={[...small, { color: theme.colors.textSecondary }]}>was {r.previous.value} in {briefDate(r.previous.date)}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '45%' }}>
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary,  }, big ? { fontSize: 24 } : null]} numberOfLines={2}>{r.value}</Text>
        {side ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: theme.colors.warningSubtle }}>
            <Text style={[theme.typography.labelSmall, { color: theme.colors.warning }, big ? { fontSize: 14 } : null]}>{side === 'Above' ? '▲ Above range' : '▼ Below range'}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const { theme, big, small } = useType();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ gap: 2 }}>
        <Text style={[theme.typography.labelMedium, { color: theme.colors.accent, letterSpacing: 1.2 }, big ? { fontSize: 15 } : null]} accessibilityRole="header">{title.toUpperCase()}</Text>
        {hint ? <Text style={small}>{hint}</Text> : null}
      </View>
      <View style={{ padding: theme.spacing.md, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: theme.spacing.xs }}>{children}</View>
    </View>
  );
}

function Plain({ items }: { items: string[] }) {
  const { theme, body } = useType();
  return (
    <View>
      {items.map((i, n) => (
        <View key={i}>
          {n > 0 ? <Hairline /> : null}
          <Text style={[...body, { paddingVertical: theme.spacing.xs }]}>{i}</Text>
        </View>
      ))}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const { theme, big } = useType();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: big ? 34 : 28, color: FOREST.text }}>{value}</Text>
      <Text style={[theme.typography.caption, { color: FOREST.textMuted }, big ? { fontSize: 15 } : null]}>{label}</Text>
    </View>
  );
}

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
      // For someone else's records the summary names THAT person, never the signed-in account.
      const viewed = getActivePerson();
      const person = isOwnRecord(viewed) || !viewed ? { name: identity.fullName, dateOfBirth: identity.dateOfBirth } : { name: viewed.name, dateOfBirth: viewed.dateOfBirth };
      setBrief(buildDoctorBrief({ person, results, documents, medications, conditions, allergies }));
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
  const small = [theme.typography.caption, { color: theme.colors.textTertiary }, big ? { fontSize: 16, lineHeight: 22 } : null];

  return (
    <BigContext.Provider value={big}>
    <ScreenContainer>
      <PersonBar />
      <Text style={[theme.typography.headingLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">Summary for your Doctor</Text>

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
          <View style={{ gap: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radius.xl, backgroundColor: FOREST.field }}>
            <View style={{ gap: 4 }}>
              <Text style={[theme.typography.labelSmall, { color: FOREST.gold, letterSpacing: 1.4 }]}>HEALTH SUMMARY · PREPARED {briefDate(brief.preparedOn).toUpperCase()}</Text>
              <Text style={{ fontSize: big ? 30 : 24, lineHeight: big ? 38 : 30, color: FOREST.text }} testID="doctor-person">
                {brief.person.name ?? 'Name not provided'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Stat value={brief.reportCount} label={brief.reportCount === 1 ? 'Report' : 'Reports'} />
              <Stat value={brief.resultCount} label={brief.resultCount === 1 ? 'Result' : 'Results'} />
              <Stat value={brief.outsideRange.length} label="To mention" />
            </View>
            <Text style={[theme.typography.caption, { color: FOREST.textFaint }]}>Built only from your own reports, as written on them. Not a diagnosis.</Text>
          </View>

          {brief.heldReports > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, padding: theme.spacing.sm, borderRadius: theme.radius.md, backgroundColor: theme.colors.warningSubtle }}>
              <Ionicons name="information-circle-outline" size={big ? 22 : 18} color={theme.colors.warning} />
              <Text style={[theme.typography.bodySmall, { flex: 1, color: theme.colors.textSecondary }, big ? { fontSize: 16 } : null]} testID="doctor-held-note">
                {brief.heldReports} {brief.heldReports === 1 ? 'report has' : 'reports have'} results not yet checked — not included here.
              </Text>
              {!big ? (
                <Pressable onPress={() => router.push({ pathname: '/documents', params: { filter: 'verify' } })} accessibilityRole="link" testID="doctor-review-link" hitSlop={8}>
                  <Text style={[theme.typography.labelMedium, { color: theme.colors.brandPrimary }]}>Review</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!big ? (
            <View style={{ gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                <View style={{ flex: 1 }}><Button label="Show to Doctor" onPress={() => setHandover(true)} testID="doctor-handover" /></View>
                <View style={{ flex: 1 }}><Button label={sharing ? 'Preparing…' : 'Send PDF'} variant="secondary" onPress={sharePdf} loading={sharing} testID="doctor-share-pdf" /></View>
              </View>
              {shareError ? <Text style={[theme.typography.caption, { color: theme.colors.danger }]} testID="doctor-share-error">We couldn’t create the PDF. Please try again.</Text> : null}
            </View>
          ) : null}

          <Section title={`Results to mention (${brief.outsideRange.length})`} hint="Outside the range printed on the report.">
            {brief.outsideRange.length ? (
              brief.outsideRange.map((r, n) => (
                <View key={r.id}>
                  {n > 0 ? <Hairline /> : null}
                  <ResultRow r={r} scope="outside" />
                </View>
              ))
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <Ionicons name="checkmark-circle" size={big ? 26 : 20} color={theme.colors.success} />
                <Text style={[...body, bigBody, { flex: 1 }]} testID="doctor-none-outside">No result is outside the range printed on its own report.</Text>
              </View>
            )}
          </Section>

          {brief.questions.length ? (
            <Section title="Questions to ask" hint="From your own reports. Change or drop any you like.">
              {brief.questions.map((q, n) => (
                <View key={q}>
                  {n > 0 ? <Hairline /> : null}
                  <Text style={[...body, { paddingVertical: theme.spacing.xs }]} testID={`doctor-question-${n}`}>{n + 1}. {q}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          {brief.trends.length ? (
            <Section title="Changes over time" hint="The same test on different dates, as printed.">
              {brief.trends.map((t, n) => {
                const nums = t.points.map((p) => Number(p.value.replace(/[^0-9.\-]/g, '')));
                const chart = nums.length >= 2 && nums.every((v) => Number.isFinite(v));
                return (
                  <View key={`${t.name}|${t.unit ?? ''}`}>
                    {n > 0 ? <Hairline /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[...body, bigBody, { fontWeight: '600' }]}>{t.name}</Text>
                        <Text style={[...small, { color: theme.colors.textSecondary }]}>
                          {t.points.map((p) => `${p.value}${t.unit ? ' ' + t.unit : ''} (${briefDate(p.date)})`).join('  →  ')}
                        </Text>
                      </View>
                      {chart ? <TrendLine values={nums} width={72} height={32} color={theme.colors.accent} /> : null}
                    </View>
                  </View>
                );
              })}
            </Section>
          ) : null}

          <Section title="Latest reports" hint="The first results from each report. The full list is under See all results.">
            {brief.reports.slice(0, 6).map((rep, n) => (
              <View key={rep.documentId}>
                {n > 0 ? <Hairline /> : null}
                <Pressable onPress={() => router.push(`/documents/${rep.documentId}`)} accessibilityRole="button" accessibilityLabel={`${rep.title}, open the report`} testID={`doctor-latest-${rep.documentId}`} style={{ gap: 2, paddingVertical: theme.spacing.xs }}>
                  <Text style={[...body, { fontWeight: '600' }]}>{rep.title}</Text>
                  {rep.highlights.map((h) => (
                    <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
                      <Text style={[...small, { flex: 1 }]} numberOfLines={1}>{h.name}</Text>
                      <Text style={[...small, { color: theme.colors.textPrimary, fontWeight: '600', maxWidth: '50%' }]} numberOfLines={1}>{h.value}</Text>
                    </View>
                  ))}
                  {rep.results.length > rep.highlights.length ? <Text style={small}>{rep.results.length} results in this report</Text> : null}
                </Pressable>
              </View>
            ))}
          </Section>

          {brief.medications.length ? <Section title="Medications listed on reports"><Plain items={brief.medications} /></Section> : null}
          {brief.conditions.length ? <Section title="Conditions stated on reports"><Plain items={brief.conditions} /></Section> : null}
          {brief.allergies.length ? <Section title="Allergies stated on reports"><Plain items={brief.allergies} /></Section> : null}

          {!big ? (
            <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" testID="doctor-see-all" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[theme.typography.bodyMedium, { color: theme.colors.brandPrimary, fontWeight: '600' }]}>
                {showAll ? 'Hide all results' : 'See all results'}
              </Text>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.brandPrimary} />
            </Pressable>
          ) : null}
          {showAll ? (
            <Section title="All results by report">
              {brief.reports.map((rep, n) => (
                <View key={rep.documentId} style={{ gap: 2 }}>
                  {n > 0 ? <Hairline /> : null}
                  <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary, paddingTop: theme.spacing.xs }, big ? { fontSize: 22 } : null]}>{rep.title}</Text>
                  {rep.results.map((r) => <ResultRow key={r.id} r={r} scope="report" />)}
                </View>
              ))}
            </Section>
          ) : null}

          <Text style={small}>
            Built from your own reports, as written on them. Ranges are the ones printed on each report. Not a diagnosis.
          </Text>

          {big ? <Button label="Done" variant="secondary" onPress={() => setHandover(false)} testID="doctor-handover-done" /> : null}
        </View>
      )}
    </ScreenContainer>
    </BigContext.Provider>
  );
}

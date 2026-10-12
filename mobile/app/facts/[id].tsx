import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  ScreenContainer,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
  TextInput,
} from '../../components';
import { useTheme } from '../../design/theme';
import {
  checkCorrection,
  correctionMatches,
  draftFrom,
  type CorrectionDraft,
  type CorrectionField,
  type CorrectionFields,
} from '../../services/health/factCorrection';
import { factService, isStaleRefusal, OutcomeUnknownError, type FactDetail, type FactVersion } from '../../services/health/factService';
import { shortDate } from '../../services/health/homeDashboard';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';

/**
 * One result: what the report says, where it comes from (report, page, the
 * text on the page, how confidently it was read — only when recorded), its
 * status, and every earlier version. On the current version the person can
 * confirm a result held for checking, or correct it.
 *
 * A correction never changes the report or the original reading: it is saved
 * as a new version that the person has checked (so it counts in Health
 * Memory), and the original stays in the history below.
 *
 * The screen only ever says what the saved state shows: a refusal because the
 * result changed elsewhere reloads it; a lost response is checked against the
 * saved state before another attempt is allowed. A result held because its
 * report isn't confirmed as the person's can't be confirmed or corrected here.
 */
export default function FactScreen() {
  const theme = useTheme();
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const [fact, setFact] = useState<FactDetail | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'attention'; text: string } | null>(
    saved === 'corrected' ? { tone: 'success', text: 'Correction saved.' } : null,
  );

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setFact(await factService.getFact(id));
    } catch (e) {
      setLoadError(e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // The result changed elsewhere: stop editing and show what is saved now.
  const onStale = useCallback(
    (message: string) => {
      setEditing(false);
      setNotice({ tone: 'attention', text: message });
      load();
    },
    [load],
  );

  if (loadError) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Result" />
        <ErrorState description={loadError} onRetry={load} />
      </ScreenContainer>
    );
  }
  if (fact === undefined) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Result" />
        <LoadingState label="Loading result…" />
      </ScreenContainer>
    );
  }
  if (!fact) {
    // Also what another person's result looks like: RLS returns nothing.
    return (
      <ScreenContainer>
        <ScreenHeader title="Result" />
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textTertiary }]}>Result not found.</Text>
      </ScreenContainer>
    );
  }

  const current = fact.supersededAt === null;
  const canAct = current && fact.reviewStatus !== 'rejected';
  const quiet = [theme.typography.bodySmall, { color: theme.colors.textSecondary }];

  return (
    <ScreenContainer>
      <ScreenHeader title="Result" />

      {notice ? (
        <Text
          style={[theme.typography.bodySmall, { color: notice.tone === 'success' ? theme.colors.success : theme.colors.warning }]}
          accessibilityLiveRegion="polite"
          testID="fact-notice"
        >
          {notice.text}
        </Text>
      ) : null}

      <View style={{ gap: 4 }} testID="fact-summary">
        <Text style={[theme.typography.headingMedium, { color: theme.colors.textPrimary }]}>{fact.name}</Text>
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>
          {fact.value}
          {fact.unit ? ` ${fact.unit}` : ''}
        </Text>
        <Text style={quiet}>{fact.date ? `Dated ${shortDate(fact.date)}` : 'No date on the report'}</Text>
        {fact.referenceRange ? <Text style={quiet}>Range printed on the report: {fact.referenceRange}</Text> : null}
      </View>

      <Card>
        <View style={{ gap: theme.spacing.xs }} testID="fact-status">
          <FactStatusBadge fact={fact} />
          <Text style={quiet}>{originLine(fact)}</Text>
          {fact.origin === 'user_corrected' && fact.correctionReason ? <Text style={quiet}>Your reason: {fact.correctionReason}</Text> : null}
        </View>
      </Card>

      {!current && fact.correctedById ? (
        <Card onPress={() => router.replace(`/facts/${fact.correctedById}`)} accessibilityLabel="Open the latest version">
          <Text style={[theme.typography.labelLarge, { color: theme.colors.brandPrimary }]}>Open the latest version</Text>
          <Text style={quiet}>This version was replaced by a correction. It is kept here for your records.</Text>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.xs }} testID="fact-evidence">
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Where this comes from</Text>
        <Card onPress={fact.document ? () => router.push(`/documents/${fact.document!.id}`) : undefined} accessibilityLabel={fact.document ? `Open ${fact.document.name}` : undefined}>
          <View style={{ gap: 6 }}>
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>{fact.document?.name ?? 'No report linked'}</Text>
            <Text style={quiet}>{fact.pageNumber ? `Page ${fact.pageNumber}` : 'Page not recorded'}</Text>
            {fact.sourceText ? (
              <View style={{ gap: 2 }}>
                <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Text on the page</Text>
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textPrimary, fontStyle: 'italic' }]} testID="fact-quote">
                  “{fact.sourceText}”
                </Text>
              </View>
            ) : null}
            <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]} testID="fact-confidence">
              {confidenceLine(fact)}
            </Text>
          </View>
        </Card>
      </View>

      {canAct && fact.identityUnconfirmed ? <IdentityHeld fact={fact} /> : null}

      {canAct && !fact.identityUnconfirmed && !editing ? (
        <View style={{ gap: theme.spacing.sm }} testID="fact-actions">
          {fact.heldForReview ? (
            <>
              <Text style={quiet}>
                This result was held for checking, so it isn&rsquo;t in your Health Memory yet. Compare it with the report: if it&rsquo;s
                right, confirm it; if not, correct it.
              </Text>
              <ConfirmButton
                fact={fact}
                onDone={(message) => {
                  setNotice({ tone: 'success', text: message });
                  load();
                }}
                onStale={onStale}
              />
            </>
          ) : null}
          <SecondaryButton label="Correct this result" onPress={() => { setNotice(null); setEditing(true); }} testID="fact-correct" />
        </View>
      ) : null}

      {canAct && !fact.identityUnconfirmed && editing ? <CorrectionForm fact={fact} onCancel={() => setEditing(false)} onStale={onStale} /> : null}

      {fact.history.length > 0 ? (
        <View style={{ gap: theme.spacing.xs }} testID="fact-history">
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Earlier versions</Text>
          {fact.history.map((v) => (
            <HistoryRow key={v.id} version={v} />
          ))}
        </View>
      ) : null}
    </ScreenContainer>
  );
}

/**
 * The report couldn't be matched to the person, so its results stay out of
 * Health Memory. Confirming or correcting a value here would accept the
 * report as theirs without saying so — that is decided on the report.
 */
function IdentityHeld({ fact }: { fact: FactDetail }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ gap: theme.spacing.xs }} testID="fact-identity-held">
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>This report isn&rsquo;t confirmed as yours yet</Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          We couldn&rsquo;t match this report to you: it has no name or date of birth we could compare, or they only partly matched
          your identity details. Its results stay out of your Health Memory, and they can&rsquo;t be confirmed or corrected here, because
          that would treat the report as yours without checking.
        </Text>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          If it is yours, add your full name and date of birth, then read the report again from the report page.
        </Text>
        <SecondaryButton label="Add identity details" onPress={() => router.push('/profile/identity')} testID="fact-identity-add" />
        {fact.document ? (
          <SecondaryButton label="Open the report" onPress={() => router.push(`/documents/${fact.document!.id}`)} testID="fact-identity-report" />
        ) : null}
      </View>
    </Card>
  );
}

function FactStatusBadge({ fact }: { fact: FactDetail }) {
  if (fact.supersededAt) return <StatusBadge label="Replaced by a correction" tone="neutral" />;
  if (fact.reviewStatus === 'rejected') return <StatusBadge label="Marked as not correct" tone="neutral" />;
  if (fact.heldForReview) return <StatusBadge label="Not yet checked" tone="warning" />;
  return <StatusBadge label="In your Health Memory" tone="success" />;
}

function originLine(fact: FactVersion): string {
  if (fact.origin === 'user_corrected') return `Corrected by you on ${shortDate(fact.recordedAt)}.`;
  if (fact.origin === 'user_entered') return `Added by you on ${shortDate(fact.recordedAt)}.`;
  if (fact.reviewStatus === 'confirmed') return 'Read from your report and confirmed by you.';
  return 'Read from your report.';
}

function confidenceLine(fact: FactDetail): string {
  if (fact.origin !== 'extracted') return 'Reading confidence: not applicable — you entered this value.';
  if (fact.confidence === null) return 'Reading confidence: not available.';
  return `Reading confidence: ${Math.round(fact.confidence * 100)}% — how sure the reader was that it read the page correctly, not a medical measure.`;
}

function HistoryRow({ version }: { version: FactVersion }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={{ gap: 2 }}>
        <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>
          {version.value}
          {version.unit ? ` ${version.unit}` : ''} · {version.name}
        </Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
          {originLine(version)}
          {version.date ? ` Dated ${shortDate(version.date)}.` : ' No date.'}
        </Text>
        {version.correctionReason ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Reason: {version.correctionReason}</Text>
        ) : null}
      </View>
    </Card>
  );
}

function ConfirmButton({ fact, onDone, onStale }: { fact: FactDetail; onDone: (message: string) => void; onStale: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The response was lost: confirming again is blocked until the saved state is checked.
  const [unverified, setUnverified] = useState(false);
  const theme = useTheme();

  async function reconcile() {
    setBusy(true);
    setError('Checking whether it was confirmed…');
    try {
      const latest = await factService.getFact(fact.id);
      setUnverified(false);
      if (!latest) return onStale('This result is no longer available.');
      if (latest.supersededAt) return onStale('This result has a newer saved version. It is shown below.');
      if (latest.reviewStatus === 'confirmed') return onDone('Confirmed. This result is now in your Health Memory.');
      setError('It wasn’t confirmed. You can try again.');
    } catch {
      setUnverified(true);
      setError('We couldn’t check whether it was confirmed. Check your connection, then check again.');
    } finally {
      setBusy(false);
    }
  }

  const confirm = () =>
    Alert.alert('Confirm this result?', 'It will be added to your Health Memory exactly as read from the report.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await factService.confirm(fact.id);
            onDone('Confirmed. This result is now in your Health Memory.');
          } catch (e) {
            if (e instanceof OutcomeUnknownError) return void (await reconcile());
            if (isStaleRefusal(e)) return onStale((e as ServiceError).userMessage);
            setError(e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  return (
    <View style={{ gap: theme.spacing.xs }}>
      {unverified ? (
        <Button label="Check again" onPress={reconcile} loading={busy} disabled={busy} testID="fact-confirm-check" />
      ) : (
        <Button label="It’s correct — confirm" onPress={confirm} loading={busy} disabled={busy} testID="fact-confirm" />
      )}
      {error ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="fact-confirm-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function CorrectionForm({ fact, onCancel, onStale }: { fact: FactDetail; onCancel: () => void; onStale: (message: string) => void }) {
  const theme = useTheme();
  const [draft, setDraft] = useState<CorrectionDraft>(() => draftFrom(fact));
  const [errors, setErrors] = useState<Partial<Record<CorrectionField, string>>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // What was last sent when its response was lost; saving again is blocked until it's checked.
  const [unverified, setUnverified] = useState<CorrectionFields | null>(null);
  const set = (field: keyof CorrectionDraft) => (text: string) => setDraft((d) => ({ ...d, [field]: text }));

  // Never assume: look at what is saved. Success only if the newer version
  // holds exactly what was sent; "not saved" only if the original is still current.
  async function reconcile(sent: CorrectionFields) {
    setSaving(true);
    setSummary('Checking whether your correction was saved…');
    try {
      const latest = await factService.getFact(fact.id);
      if (!latest) return onStale('This result is no longer available.');
      if (latest.correctedById) {
        const newer = await factService.getFact(latest.correctedById);
        if (newer && newer.supersededAt === null && correctionMatches(newer, sent)) {
          router.replace({ pathname: '/facts/[id]', params: { id: newer.id, saved: 'corrected' } });
          return;
        }
        return onStale('This result has a newer saved version that isn’t the same as what you entered. It is shown below.');
      }
      setUnverified(null);
      setSummary('Your correction wasn’t saved. You can try again.');
    } catch {
      setUnverified(sent);
      setSummary('We couldn’t check whether your correction was saved. Check your connection, then check again.');
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const check = checkCorrection(fact, draft);
    if (!check.ok) {
      setErrors(check.errors);
      setSummary(check.summary ?? 'Check the highlighted fields.');
      return;
    }
    setErrors({});
    setSummary(null);
    setSaving(true);
    try {
      const newId = await factService.correct(fact.id, check.fields, check.reason);
      router.replace({ pathname: '/facts/[id]', params: { id: newId, saved: 'corrected' } });
    } catch (e) {
      if (e instanceof OutcomeUnknownError) return reconcile(check.fields);
      if (isStaleRefusal(e)) return onStale((e as ServiceError).userMessage);
      setSummary(e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.sm }} testID="fact-correction-form">
      <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>Correct this result</Text>
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
        Enter what the report actually says. Leave unit, range or date empty if the report doesn&rsquo;t show them.
      </Text>
      <TextInput label="Test name" value={draft.name} onChangeText={set('name')} errorText={errors.name} maxLength={300} testID="correct-name" />
      <TextInput label="Value" value={draft.value} onChangeText={set('value')} errorText={errors.value} maxLength={300} testID="correct-value" />
      <TextInput label="Unit" value={draft.unit} onChangeText={set('unit')} errorText={errors.unit} maxLength={50} autoCapitalize="none" testID="correct-unit" />
      <TextInput label="Range printed on the report" value={draft.referenceRange} onChangeText={set('referenceRange')} errorText={errors.referenceRange} maxLength={200} testID="correct-range" />
      <View style={{ gap: 4 }}>
        <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Date on the report</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          <View style={{ flex: 1 }}>
            <TextInput placeholder="DD" value={draft.day} onChangeText={set('day')} keyboardType="number-pad" maxLength={2} accessibilityLabel="Day" testID="correct-day" />
          </View>
          <View style={{ flex: 1 }}>
            <TextInput placeholder="MM" value={draft.month} onChangeText={set('month')} keyboardType="number-pad" maxLength={2} accessibilityLabel="Month" testID="correct-month" />
          </View>
          <View style={{ flex: 1.4 }}>
            <TextInput placeholder="YYYY" value={draft.year} onChangeText={set('year')} keyboardType="number-pad" maxLength={4} accessibilityLabel="Year" testID="correct-year" />
          </View>
        </View>
        {errors.date ? <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} testID="correct-date-error">{errors.date}</Text> : null}
      </View>
      <TextInput
        label="Reason (optional)"
        placeholder="For example: the value was misread"
        value={draft.reason}
        onChangeText={set('reason')}
        errorText={errors.reason}
        maxLength={500}
        multiline
        testID="correct-reason"
      />

      <Card>
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} testID="correct-trust-notice">
          When you save, your corrected version replaces this result in your Health Memory as a result you have checked. The
          original reading stays in this result&rsquo;s history, and your report itself is not changed.
        </Text>
      </Card>

      {summary ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="correct-summary">
          {summary}
        </Text>
      ) : null}
      {unverified ? (
        <Button label="Check again" onPress={() => reconcile(unverified)} loading={saving} disabled={saving} testID="correct-check" />
      ) : (
        <Button label="Save correction" onPress={save} loading={saving} disabled={saving} testID="correct-save" />
      )}
      <SecondaryButton label="Cancel" onPress={onCancel} disabled={saving} testID="correct-cancel" />
    </View>
  );
}

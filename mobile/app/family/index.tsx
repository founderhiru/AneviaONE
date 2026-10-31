import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, ErrorState, LoadingState, ScreenContainer, ScreenHeader, TextInput } from '../../components';
import { BRAND, PRODUCT_TERMS } from '../../config/brand';
import { useTheme } from '../../design/theme';
import { usePeople } from '../../hooks/usePeople';
import { toIsoDate } from '../../services/people/dates';
import { peopleService, RELATIONSHIPS, type AccessEntry, type Person, type Relationship } from '../../services/people/peopleService';
import { ServiceError } from '../../services/serviceError';

const messageOf = (e: unknown) => (e instanceof ServiceError ? e.userMessage : 'That didn’t go through. Nothing was changed — please try again.');

/**
 * Family Health: whose records you can see, relatives you manage, and who can
 * see yours. Nobody gets access to anyone else's records without that person
 * (or the person who manages them) approving it here.
 */
export default function FamilyScreen() {
  const theme = useTheme();
  const { people, active, switchTo, refresh } = usePeople();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<Record<string, AccessEntry[]>>({});

  const owned = people.filter((p) => p.access === 'owner');

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await refresh();
      const entries = await Promise.all(list.filter((p) => p.access === 'owner').map(async (p) => [p.id, await peopleService.listAccess(p.id)] as const));
      setAccess(Object.fromEntries(entries));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const small = [theme.typography.caption, { color: theme.colors.textTertiary }] as const;

  return (
    <ScreenContainer>
      <ScreenHeader title={PRODUCT_TERMS.familyHealth} />
      {loading ? (
        <LoadingState label="Loading…" />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : (
        <View style={{ gap: theme.spacing.lg }}>
          <Section title="People">
            {people.map((p) => (
              <PersonRow key={p.id} person={p} selected={p.id === active?.id} onOpen={() => { switchTo(p.id); router.back(); }} entries={access[p.id] ?? []} reload={load} />
            ))}
          </Section>

          <RequestsToApprove owned={owned} access={access} reload={load} />
          <AddRelative onDone={load} />
          <EnterCode onDone={load} />
          <Text style={[...small]}>
            {BRAND.productName} never shares someone’s records without their approval. You can remove anyone’s access at any time.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

function PersonRow({ person, selected, onOpen, entries, reload }: { person: Person; selected: boolean; onOpen: () => void; entries: AccessEntry[]; reload: () => void }) {
  const theme = useTheme();
  const body = [theme.typography.bodyMedium, { color: theme.colors.textPrimary }] as const;
  const small = [theme.typography.caption, { color: theme.colors.textTertiary }] as const;
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const self = person.relationship === 'self' && person.access === 'owner';
  const canInvite = person.access === 'owner';
  const active = entries.filter((e) => e.status === 'active');

  async function invite(role: 'viewer' | 'manager') {
    setBusy(true);
    setErr(null);
    try {
      setCode(await peopleService.createInvite(person.id, role));
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(grantId: string) {
    setErr(null);
    try {
      await peopleService.revoke(grantId);
      reload();
    } catch (e) {
      setErr(messageOf(e));
    }
  }

  return (
    <Card>
      <Pressable onPress={onOpen} accessibilityRole="button" testID={`family-open-${person.id}`} style={{ gap: 2 }}>
        <Text style={[...body, { fontWeight: '600' }]}>{self ? 'Me' : person.name}{selected ? ' · showing now' : ''}</Text>
        <Text style={[...small]}>
          {self ? 'Your own records' : person.access === 'owner' ? `${RELATIONSHIPS.find((r) => r.value === person.relationship)?.label ?? 'Relative'} · you manage this record` : person.access === 'viewer' ? 'Shared with you · view only' : 'Shared with you'}
        </Text>
      </Pressable>

      {active.map((e) => (
        <View key={e.grantId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: theme.spacing.xs }}>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textSecondary, flex: 1 }]}>{e.name} · {e.role === 'manager' ? 'can help manage' : 'can view'}</Text>
          <Pressable onPress={() => remove(e.grantId)} accessibilityRole="button" testID={`family-remove-${e.grantId}`}>
            <Text style={[theme.typography.caption, { color: theme.colors.danger, fontWeight: '600' }]}>Remove</Text>
          </Pressable>
        </View>
      ))}

      {canInvite ? (
        code ? (
          <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }} testID="family-invite-code-box">
            <Text style={[...small]}>Share this code. It works once and expires in 7 days.</Text>
            <Text selectable style={[theme.typography.headingMedium, { color: theme.colors.textPrimary, letterSpacing: 1 }]} testID="family-invite-code">{code}</Text>
            <Button
              label="Share code"
              variant="secondary"
              onPress={() => Share.share({ message: `${BRAND.productName} invite code: ${code}\nOpen ${BRAND.productName} → Me → Family → Enter an invite code. The code works once and expires in 7 days.` }).catch(() => undefined)}
              testID="family-share-code"
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
            <View style={{ flex: 1 }}><Button label="Invite to view" variant="secondary" loading={busy} onPress={() => invite('viewer')} testID={`family-invite-view-${person.id}`} /></View>
            <View style={{ flex: 1 }}><Button label="Invite to help" variant="secondary" loading={busy} onPress={() => invite('manager')} testID={`family-invite-help-${person.id}`} /></View>
          </View>
        )
      ) : null}
      {err ? <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: 4 }]}>{err}</Text> : null}
    </Card>
  );
}

function RequestsToApprove({ owned, access, reload }: { owned: Person[]; access: Record<string, AccessEntry[]>; reload: () => void }) {
  const theme = useTheme();
  const [err, setErr] = useState<string | null>(null);
  const pending = owned.flatMap((p) => (access[p.id] ?? []).filter((e) => e.status === 'requested').map((e) => ({ person: p, entry: e })));
  if (pending.length === 0) return null;

  async function decide(grantId: string, approve: boolean) {
    setErr(null);
    try {
      if (approve) await peopleService.approve(grantId);
      else await peopleService.revoke(grantId);
      reload();
    } catch (e) {
      setErr(messageOf(e));
    }
  }

  return (
    <View style={{ gap: theme.spacing.xs }} testID="family-requests">
      <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">Waiting for your approval</Text>
      {pending.map(({ person, entry }) => (
        <Card key={entry.grantId}>
          <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>
            {entry.name} asked to {entry.role === 'manager' ? 'help manage' : 'view'} {person.relationship === 'self' ? 'your records' : `${person.name}’s records`}.
          </Text>
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>They see nothing until you approve.</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
            <View style={{ flex: 1 }}><Button label="Approve" onPress={() => decide(entry.grantId, true)} testID={`family-approve-${entry.grantId}`} /></View>
            <View style={{ flex: 1 }}><Button label="Decline" variant="secondary" onPress={() => decide(entry.grantId, false)} testID={`family-decline-${entry.grantId}`} /></View>
          </View>
        </Card>
      ))}
      {err ? <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>{err}</Text> : null}
    </View>
  );
}

function AddRelative({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dob = toIsoDate(day, month, year);
  const problem = !name.trim() ? 'Enter their name.' : !relationship ? 'Choose how they are related to you.' : dob === undefined ? 'Check the date of birth.' : !confirmed ? 'Confirm that you are allowed to manage their records.' : null;

  async function save() {
    if (problem || !relationship || dob === undefined) {
      setErr(problem);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await peopleService.createRelative({ name, relationship, dateOfBirth: dob, authorityConfirmed: true });
      setOpen(false);
      setName(''); setRelationship(null); setDay(''); setMonth(''); setYear(''); setConfirmed(false);
      onDone();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button label="Add a relative" variant="secondary" onPress={() => setOpen(true)} testID="family-add" />;
  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }} testID="family-add-form">
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>Add a relative</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
          If they have a smartphone, it is better to invite them so they keep control of their own records. Add them here when you manage their records for them, such as a child or a parent without a smartphone.
        </Text>
        <TextInput label="Name" value={name} onChangeText={setName} maxLength={120} autoCapitalize="words" testID="family-name" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          {RELATIONSHIPS.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => setRelationship(r.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: relationship === r.value }}
              testID={`family-rel-${r.value}`}
              style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: relationship === r.value ? theme.colors.brandPrimary : theme.colors.border, backgroundColor: relationship === r.value ? theme.colors.brandPrimary : theme.colors.surface }}
            >
              <Text style={[theme.typography.labelMedium, { color: relationship === r.value ? '#fff' : theme.colors.textPrimary }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          <View style={{ flex: 1 }}><TextInput label="Day" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} placeholder="DD" testID="family-dob-day" /></View>
          <View style={{ flex: 1 }}><TextInput label="Month" value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} placeholder="MM" testID="family-dob-month" /></View>
          <View style={{ flex: 1.4 }}><TextInput label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder="YYYY" testID="family-dob-year" /></View>
        </View>
        <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>Date of birth is optional. It appears on their summary for a Doctor.</Text>
        <Pressable onPress={() => setConfirmed((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} testID="family-authority" style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 18, color: theme.colors.brandPrimary }}>{confirmed ? '☑' : '☐'}</Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textPrimary, flex: 1 }]}>
            I am their parent or guardian, or they have asked me to manage their health records for them.
          </Text>
        </Pressable>
        {err ? <Text style={[theme.typography.caption, { color: theme.colors.danger }]} testID="family-add-error">{err}</Text> : null}
        <Button label="Add" onPress={save} loading={busy} testID="family-save" />
        <Button label="Cancel" variant="secondary" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}

function EnterCode({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setResult(null);
    try {
      const ok = await peopleService.redeemInvite(code);
      setResult(ok
        ? { ok: true, text: 'Request sent. You will see their records once they approve it.' }
        : { ok: false, text: 'That code didn’t work. Check it, or ask for a new one.' });
      if (ok) { setCode(''); onDone(); }
    } catch (e) {
      setResult({ ok: false, text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button label="Enter an invite code" variant="secondary" onPress={() => setOpen(true)} testID="family-enter-code" />;
  return (
    <Card>
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]}>Enter an invite code</Text>
        <TextInput label="Code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} maxLength={14} placeholder="XXXX-XXXX-XXXX" testID="family-code-input" />
        {result ? <Text style={[theme.typography.bodySmall, { color: result.ok ? theme.colors.success : theme.colors.danger }]} testID="family-code-result">{result.text}</Text> : null}
        <Button label="Send request" onPress={submit} loading={busy} disabled={code.replace(/[^0-9a-f]/gi, '').length !== 12} testID="family-code-submit" />
      </View>
    </Card>
  );
}

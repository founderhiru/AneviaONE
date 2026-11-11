import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BottomSheet } from '../BottomSheet';
import { Button } from '../Button';
import { TextInput } from '../TextInput';
import { useTheme } from '../../design/theme';
import { useObligations } from '../../hooks/useObligations';
import {
  ADD_KINDS,
  cleanTitle,
  dateFromChoice,
  DUE_CHOICES,
  dueLabel,
  daysUntil,
  KIND_LABEL,
  shortDay,
  TITLE_MAX,
  type Obligation,
  type ObligationKind,
} from '../../services/obligations/comingUp';

const COLLAPSED = 3;

type Props = {
  subjectId: string | null;
  /** Owners and managers can add, finish and snooze; viewers only read. */
  canEdit: boolean;
  /** Shown when the records on screen belong to someone else ("Father"). */
  forName?: string | null;
};

/**
 * COMING UP: renewals, refills and follow-ups for the person on screen. Dates come
 * from a person (or, later, a report page they confirm). The wording is plain and
 * never advises anything medical.
 */
export function ComingUp({ subjectId, canEdit, forName }: Props) {
  const theme = useTheme();
  const reminders = useObligations(subjectId);
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!subjectId || reminders.visible === null) return null;

  const today = new Date();
  const all = reminders.visible;
  const shown = expanded ? all : all.slice(0, COLLAPSED);
  const title = forName ? `Coming up · ${forName}` : 'Coming up';

  if (reminders.loadError && all.length === 0) {
    return (
      <Pressable onPress={reminders.reload} accessibilityRole="button" testID="coming-up-retry">
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>We couldn&rsquo;t load your reminders. Tap to try again.</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }} testID="coming-up">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[theme.typography.headingSmall, { color: theme.colors.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        {canEdit ? (
          <Pressable
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a reminder"
            testID="coming-up-add"
            style={{ minHeight: theme.minTouchTarget, justifyContent: 'center', paddingHorizontal: theme.spacing.xs }}
          >
            <Text style={[theme.typography.labelLarge, { color: theme.colors.accent }]}>+ Add</Text>
          </Pressable>
        ) : null}
      </View>

      {reminders.actionError ? (
        <Pressable onPress={reminders.clearActionError} accessibilityRole="alert" testID="coming-up-error">
          <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]}>{reminders.actionError}</Text>
        </Pressable>
      ) : null}

      {all.length === 0 ? (
        <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="coming-up-empty">
          {canEdit ? 'Nothing coming up. Add a renewal, refill or follow-up and it will appear here.' : 'Nothing coming up.'}
        </Text>
      ) : (
        <View style={{ borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
          {shown.map((o, n) => (
            <Row key={o.id} item={o} first={n === 0} today={today} canEdit={canEdit} onDone={() => reminders.markDone(o.id)} onSnooze={() => reminders.snoozeWeek(o.id)} />
          ))}
        </View>
      )}

      {all.length > COLLAPSED ? (
        <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" testID="coming-up-toggle" style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}>
          <Text style={[theme.typography.labelMedium, { color: theme.colors.accent }]}>{expanded ? 'Show fewer' : `Show all ${all.length}`}</Text>
        </Pressable>
      ) : null}

      <AddSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onSave={async (kind, text, dueOn) => {
          const ok = await reminders.add({ subjectId, kind, title: text, dueOn });
          if (ok) setAdding(false);
          return ok;
        }}
      />
    </View>
  );
}

function Row({ item, first, today, canEdit, onDone, onSnooze }: { item: Obligation; first: boolean; today: Date; canEdit: boolean; onDone: () => void; onSnooze: () => void }) {
  const theme = useTheme();
  const overdue = daysUntil(item.dueOn, today) < 0;
  const when = dueLabel(item.dueOn, today);
  return (
    <View
      testID={`coming-up-item-${item.id}`}
      accessible
      accessibilityLabel={`${KIND_LABEL[item.kind]}: ${item.title}. ${when}, ${shortDay(item.dueOn)}.`}
      style={{ padding: theme.spacing.md, gap: theme.spacing.xs, borderTopWidth: first ? 0 : 1, borderTopColor: theme.colors.border }}
    >
      <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{KIND_LABEL[item.kind]}</Text>
      <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{item.title}</Text>
      <Text style={[theme.typography.bodySmall, { color: overdue ? theme.colors.danger : theme.colors.textSecondary }]}>
        {when} · {shortDay(item.dueOn)}
      </Text>
      {canEdit ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`Mark done: ${item.title}`} testID={`coming-up-done-${item.id}`} style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}>
            <Text style={[theme.typography.labelMedium, { color: theme.colors.accent }]}>Done</Text>
          </Pressable>
          <Pressable onPress={onSnooze} accessibilityRole="button" accessibilityLabel={`Remind me in a week: ${item.title}`} testID={`coming-up-snooze-${item.id}`} style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}>
            <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Snooze 1 week</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      style={{
        minHeight: theme.minTouchTarget,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accentSubtle : theme.colors.surface,
      }}
    >
      <Text style={[theme.typography.labelMedium, { color: selected ? theme.colors.accent : theme.colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

function AddSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (kind: ObligationKind, title: string, dueOn: string) => Promise<boolean> }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ObligationKind>('renewal');
  const [due, setDue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title = cleanTitle(text);
  const dueOn = due ? dateFromChoice(due, new Date()) : null;
  const ready = title !== null && dueOn !== null && !saving;

  async function save() {
    if (!title || !dueOn) return;
    setSaving(true);
    const ok = await onSave(kind, title, dueOn);
    setSaving(false);
    if (ok) {
      setText('');
      setDue(null);
      setKind('renewal');
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add a reminder">
      <View style={{ gap: theme.spacing.md }}>
        <TextInput label="What is it for?" placeholder="e.g. Renew health insurance" value={text} onChangeText={setText} maxLength={TITLE_MAX} testID="coming-up-title-input" returnKeyType="done" />
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {ADD_KINDS.map((k) => (
              <Chip key={k.value} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} testID={`coming-up-kind-${k.value}`} />
            ))}
          </View>
        </View>
        <View style={{ gap: theme.spacing.xs }}>
          <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>When</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
            {DUE_CHOICES.map((c) => (
              <Chip key={c.key} label={c.label} selected={due === c.key} onPress={() => setDue(c.key)} testID={`coming-up-due-${c.key}`} />
            ))}
          </View>
          {dueOn ? <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>{shortDay(dueOn)}</Text> : null}
        </View>
        <Button label="Save reminder" onPress={save} disabled={!ready} loading={saving} testID="coming-up-save" />
      </View>
    </BottomSheet>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { BottomSheet, Button, Card, EmptyState, LoadingState, PersonBar, ScreenContainer, ScreenHeader, TextInput } from '../../components';
import { isDemoMode } from '../../config/appMode';
import { useTheme } from '../../design/theme';
import { usePeople } from '../../hooks/usePeople';
import { canAddVaultFiles } from '../../services/people/peopleService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import { pickVaultFile, VAULT_SOURCES, type VaultSource } from '../../services/vault/pickFile';
import {
  activityText,
  ADDED_BY_LABEL,
  canDeleteVaultFile,
  categoryInfo,
  CATEGORY_LABEL,
  daysToExpiry,
  parseExpiry,
  slotStatus,
  STATUS_LABEL,
  type SlotStatus,
  cleanVaultTitle,
  formatSize,
  parseCategory,
  titleFromFilename,
  TITLE_MAX,
  VAULT_CATEGORIES,
  type VaultActivity,
  type VaultCategory,
  type VaultFile,
} from '../../services/vault/vaultRules';
import { vaultService } from '../../services/vault/vaultService';
import type { PickedFile } from '../../types';

const messageOf = (e: unknown) => (e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dayOnly = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const count = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

/**
 * Personal Documents ("Personal Vault"): one private folder for IDs, policies, certificates and
 * anything else a person wants to keep handy. Files are stored as they are and are never read
 * or sent to AI. The controller of a record, or a family manager, adds; the controller or the family
 * member who added a file deletes it; people with approved access can open.
 * No `category` shows the six categories with counts; `?category=` opens one (with named slots
 * such as Aadhaar or Passport where the category has them); `?add=1` opens the Add sheet.
 */
export default function VaultScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ category?: string; add?: string }>();
  const category = parseCategory(params.category);
  const { active } = usePeople();
  const subjectId = active?.id ?? (isDemoMode ? 'demo-person' : null);
  const canAdd = active ? canAddVaultFiles(active) : isDemoMode;
  const isController = active ? active.access === 'owner' : isDemoMode;

  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(params.add === '1');
  const [addKind, setAddKind] = useState<string | null>(null);
  const [selected, setSelected] = useState<VaultFile | null>(null);
  const [activity, setActivity] = useState<VaultActivity[]>([]);

  const load = useCallback(async () => {
    try {
      setFiles(await vaultService.list(subjectId));
      setActivity(await vaultService.listActivity(subjectId).catch(() => []));
      setError(null);
    } catch (e) {
      setError(messageOf(e));
      setFiles((prev) => prev ?? []);
    }
  }, [subjectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.add === '1') setAdding(true);
  }, [params.add]);

  const all = files ?? [];
  const info = category ? categoryInfo(category) : null;
  const shown = category ? all.filter((f) => f.category === category) : [];

  function openAdd(kind: string | null = null) {
    setNotice(null);
    setAddKind(kind);
    setAdding(true);
  }

  const expiryColor = (iso: string) => {
    const d = daysToExpiry(iso, new Date());
    return d < 0 ? theme.colors.danger : d <= 90 ? theme.colors.warning : theme.colors.textTertiary;
  };
  const statusColor = (s: SlotStatus) => (s === 'expired' ? theme.colors.danger : s === 'expiring' ? theme.colors.warning : s === 'added' ? theme.colors.success : theme.colors.textTertiary);

  const fileCard = (f: VaultFile) => (
    <Card key={f.id} onPress={() => setSelected(f)} accessibilityLabel={`${f.title}, ${f.kind ?? CATEGORY_LABEL[f.category]}`} testID={`vault-file-${f.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name={f.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={26} color={theme.colors.accent} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{f.title}</Text>
          <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
            {f.kind ?? CATEGORY_LABEL[f.category]} · {formatSize(f.fileSizeBytes)} · {day(f.uploadedAt ?? f.createdAt)}
          </Text>
          {f.addedBy !== 'you' || !isController ? (
            <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID={`vault-added-by-${f.id}`}>{ADDED_BY_LABEL[f.addedBy]}</Text>
          ) : null}
          {f.expiresOn ? (
            <Text style={[theme.typography.labelMedium, { color: expiryColor(f.expiresOn) }]} testID={`vault-expiry-${f.id}`}>
              {daysToExpiry(f.expiresOn, new Date()) < 0 ? 'Expired' : 'Expires'} {dayOnly(f.expiresOn)}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );

  return (
    <ScreenContainer>
      <PersonBar />
      <ScreenHeader title={info ? info.label : 'Personal Documents'} />
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="vault-privacy-note">
        Kept in private storage. Only you, and people you have approved, can open these files. They are never read or sent to AI.
      </Text>

      {canAdd ? <Button label="Add a Personal Document" onPress={() => openAdd()} testID="vault-add" /> : null}
      {notice ? <Text style={[theme.typography.bodySmall, { color: theme.colors.success }]} accessibilityLiveRegion="polite" testID="vault-notice">{notice}</Text> : null}
      {error ? (
        <Pressable onPress={load} accessibilityRole="button" testID="vault-retry">
          <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]}>{error} Tap to try again.</Text>
        </Pressable>
      ) : null}

      {files === null ? (
        <LoadingState label="Loading your files…" />
      ) : !info ? (
        <View style={{ gap: theme.spacing.sm }} testID="vault-categories">
          {VAULT_CATEGORIES.map((c) => {
            const n = all.filter((f) => f.category === c.value).length;
            return (
              <Card key={c.value} onPress={() => router.push({ pathname: '/vault', params: { category: c.value } })} accessibilityLabel={`${c.label}. ${c.hint}. ${count(n)}`} testID={`vault-category-tile-${c.value}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Ionicons name={c.icon} size={26} color={theme.colors.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{c.label}</Text>
                    <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{c.hint}</Text>
                  </View>
                  <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>{n}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </View>
              </Card>
            );
          })}
          {isController && activity.length > 0 ? (
            <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }} testID="vault-activity">
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">Recent activity</Text>
              {activity.slice(0, 5).map((a) => (
                <Text key={a.id} style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]} testID={`vault-activity-${a.id}`}>
                  {activityText(a)} · {day(a.at)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : info.kinds.length > 0 ? (
        <View style={{ gap: theme.spacing.md }} testID="vault-list">
          {info.kinds.map((k) => {
            const inKind = shown.filter((f) => f.kind === k);
            const status = slotStatus(inKind, new Date());
            return (
              <View key={k} style={{ gap: theme.spacing.xs }} testID={`vault-kind-${k}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flex: 1 }}>
                    <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">{k}</Text>
                    <Text style={[theme.typography.labelSmall, { color: statusColor(status) }]} testID={`vault-status-${k}`}>{STATUS_LABEL[status]}</Text>
                  </View>
                  {canAdd ? (
                    <Pressable onPress={() => openAdd(k)} accessibilityRole="button" accessibilityLabel={`Add ${k}`} testID={`vault-kind-add-${k}`} hitSlop={8}>
                      <Text style={[theme.typography.labelMedium, { color: theme.colors.accent }]}>+ Add</Text>
                    </Pressable>
                  ) : null}
                </View>
                {inKind.map(fileCard)}
              </View>
            );
          })}
          {shown.some((f) => !f.kind) ? (
            <View style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]} accessibilityRole="header">Other</Text>
              {shown.filter((f) => !f.kind).map(fileCard)}
            </View>
          ) : null}
        </View>
      ) : shown.length === 0 && !error ? (
        <EmptyState
          title="Nothing here yet"
          description={canAdd ? 'Add a PDF or a photo and it stays here, ready whenever you need it.' : 'No files have been shared with you here.'}
          actionLabel={canAdd ? 'Add a Personal Document' : undefined}
          onActionPress={canAdd ? () => openAdd() : undefined}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }} testID="vault-list">{shown.map(fileCard)}</View>
      )}

      <AddSheet
        visible={adding}
        initialCategory={category}
        initialKind={addKind}
        onClose={() => setAdding(false)}
        onSave={async (file, cat, kind, name, expiresOn) => {
          try {
            await vaultService.upload({ subjectId, category: cat, kind, expiresOn, title: name, file });
            setAdding(false);
            setNotice('Saved to your folder.');
            await load();
            return null;
          } catch (e) {
            return messageOf(e);
          }
        }}
      />
      <FileSheet
        file={selected}
        canDelete={selected ? canDeleteVaultFile(active ? active.access : null, selected) : false}
        addedByLabel={selected ? ADDED_BY_LABEL[selected.addedBy] : null}
        onClose={() => setSelected(null)}
        onDeleted={async () => {
          setSelected(null);
          setNotice('File deleted.');
          await load();
        }}
      />
    </ScreenContainer>
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

function AddSheet({ visible, initialCategory, initialKind, onClose, onSave }: { visible: boolean; initialCategory: VaultCategory | null; initialKind: string | null; onClose: () => void; onSave: (file: PickedFile, category: VaultCategory, kind: string | null, title: string, expiresOn: string | null) => Promise<string | null> }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<VaultCategory>(initialCategory ?? 'identity');
  const [kind, setKind] = useState<string | null>(initialKind);
  const [expiry, setExpiry] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Each time the sheet opens it starts from where it was opened (a category, a slot, or neither).
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategory(initialCategory ?? 'identity');
    setKind(initialKind);
  }, [visible, initialCategory, initialKind]);

  const name = cleanVaultTitle(text);
  const kinds = categoryInfo(category).kinds;
  const canExpire = category === 'identity' || category === 'insurance';
  const expiryOk = !canExpire || expiry.trim() === '' || parseExpiry(expiry) !== null;

  function reset() {
    setPicked(null);
    setText('');
    setExpiry('');
    setMessage(null);
  }

  async function choose(source: VaultSource) {
    setMessage(null);
    const result = await pickVaultFile(source);
    if (result.kind === 'permission_denied') return setMessage(result.message);
    if (result.kind !== 'file') return;
    setPicked(result.file);
    setText(titleFromFilename(result.file.name));
  }

  async function save() {
    if (!picked || !name || !expiryOk) return;
    setSaving(true);
    const failed = await onSave(picked, category, kind, name, canExpire && expiry.trim() ? parseExpiry(expiry) : null);
    setSaving(false);
    if (failed) setMessage(failed);
    else reset();
  }

  return (
    <BottomSheet visible={visible} onClose={() => { reset(); onClose(); }} title="Add a Personal Document">
      <View style={{ gap: theme.spacing.md }}>
        {!picked ? (
          <View style={{ gap: theme.spacing.xs }}>
            {VAULT_SOURCES.map((s) => (
              <Pressable key={s.source} onPress={() => choose(s.source)} accessibilityRole="button" testID={`vault-source-${s.source}`} style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}>
                <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{s.label}</Text>
                <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>{s.description}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            <TextInput label="Name" value={text} onChangeText={setText} maxLength={TITLE_MAX} testID="vault-title-input" returnKeyType="done" />
            <View style={{ gap: theme.spacing.xs }}>
              <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                {VAULT_CATEGORIES.map((c) => (
                  <Chip key={c.value} label={c.label} selected={category === c.value} onPress={() => { setCategory(c.value); setKind(null); }} testID={`vault-category-${c.value}`} />
                ))}
              </View>
            </View>
            {kinds.length > 0 ? (
              <View style={{ gap: theme.spacing.xs }}>
                <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Which one?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  {kinds.map((k) => (
                    <Chip key={k} label={k} selected={kind === k} onPress={() => setKind(kind === k ? null : k)} testID={`vault-kind-chip-${k}`} />
                  ))}
                </View>
              </View>
            ) : null}
            {canExpire ? (
              <View style={{ gap: 4 }}>
                <TextInput label="Expiry date (optional)" value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD, e.g. 2031-03-14" maxLength={10} testID="vault-expiry-input" returnKeyType="done" />
                {!expiryOk ? <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} testID="vault-expiry-error">Use the format YYYY-MM-DD.</Text> : null}
              </View>
            ) : null}
            <Button label="Save to my folder" onPress={save} disabled={!name || saving || !expiryOk} loading={saving} testID="vault-save" />
          </>
        )}
        {message ? <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="vault-add-error">{message}</Text> : null}
      </View>
    </BottomSheet>
  );
}

function FileSheet({ file, canDelete, addedByLabel, onClose, onDeleted }: { file: VaultFile | null; canDelete: boolean; addedByLabel: string | null; onClose: () => void; onDeleted: () => Promise<void> }) {
  const theme = useTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function close() {
    setConfirming(false);
    setMessage(null);
    onClose();
  }

  async function open() {
    if (!file) return;
    setMessage(null);
    setBusy(true);
    try {
      await WebBrowser.openBrowserAsync(await vaultService.openUrl(file));
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!file) return;
    setBusy(true);
    try {
      await vaultService.remove(file);
      setConfirming(false);
      await onDeleted();
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={file !== null} onClose={close} title={file?.title}>
      <View style={{ gap: theme.spacing.md }}>
        {confirming ? (
          <>
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>Delete this file? It is removed from this folder and can&rsquo;t be recovered. The person it belongs to will see that it was deleted.</Text>
            <Button label="Delete file" variant="destructive" onPress={remove} loading={busy} testID="vault-delete-confirm" />
            <Button label="Keep it" variant="secondary" onPress={() => setConfirming(false)} testID="vault-delete-cancel" />
          </>
        ) : (
          <>
            {addedByLabel ? <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="vault-file-added-by">{addedByLabel}</Text> : null}
            <Button label="Open" onPress={open} loading={busy} testID="vault-open" />
            {canDelete ? <Button label="Delete" variant="secondary" onPress={() => setConfirming(true)} testID="vault-delete" /> : null}
          </>
        )}
        {message ? <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="vault-file-error">{message}</Text> : null}
      </View>
    </BottomSheet>
  );
}

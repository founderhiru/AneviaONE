import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { BottomSheet, Button, Card, EmptyState, LoadingState, PersonBar, ScreenContainer, ScreenHeader, TextInput } from '../../components';
import { isDemoMode } from '../../config/appMode';
import { useTheme } from '../../design/theme';
import { usePeople } from '../../hooks/usePeople';
import { canAddReports } from '../../services/people/peopleService';
import { GENERIC_ERROR_MESSAGE, ServiceError } from '../../services/serviceError';
import { pickVaultFile, VAULT_SOURCES, type VaultSource } from '../../services/vault/pickFile';
import {
  categoriesOf,
  CATEGORY_LABEL,
  cleanVaultTitle,
  formatSize,
  GROUP_TITLE,
  parseGroup,
  titleFromFilename,
  TITLE_MAX,
  type VaultCategory,
  type VaultFile,
} from '../../services/vault/vaultRules';
import { vaultService } from '../../services/vault/vaultService';
import type { PickedFile } from '../../types';

const messageOf = (e: unknown) => (e instanceof ServiceError ? e.userMessage : GENERIC_ERROR_MESSAGE);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

/**
 * Personal documents: one private folder for IDs, policies, certificates and anything else
 * a person wants to keep handy. Files are stored as they are and are never read or sent to
 * AI. Only the owner of a record adds or deletes; people with approved access can open.
 * `?group=identity|insurance|documents` narrows the list (Home's tiles); no group shows all.
 */
export default function VaultScreen() {
  const theme = useTheme();
  const { group: groupParam } = useLocalSearchParams<{ group?: string }>();
  const group = parseGroup(groupParam);
  const { active } = usePeople();
  const subjectId = active?.id ?? (isDemoMode ? 'demo-person' : null);
  const canAdd = active ? canAddReports(active) : isDemoMode;

  const [files, setFiles] = useState<VaultFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<VaultFile | null>(null);

  const load = useCallback(async () => {
    try {
      setFiles(await vaultService.list(subjectId));
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

  const allowed = categoriesOf(group);
  const shown = (files ?? []).filter((f) => allowed.includes(f.category));
  const title = group ? GROUP_TITLE[group] : 'Personal documents';

  return (
    <ScreenContainer>
      <PersonBar />
      <ScreenHeader title={title} />
      <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]} testID="vault-privacy-note">
        Kept in private storage. Only you, and people you have approved, can open these files. They are never read or sent to AI.
      </Text>

      {canAdd ? <Button label="Add a file" onPress={() => { setNotice(null); setAdding(true); }} testID="vault-add" /> : null}
      {notice ? <Text style={[theme.typography.bodySmall, { color: theme.colors.success }]} accessibilityLiveRegion="polite" testID="vault-notice">{notice}</Text> : null}
      {error ? (
        <Pressable onPress={load} accessibilityRole="button" testID="vault-retry">
          <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]}>{error} Tap to try again.</Text>
        </Pressable>
      ) : null}

      {files === null ? (
        <LoadingState label="Loading your files…" />
      ) : shown.length === 0 && !error ? (
        <EmptyState
          title="Nothing here yet"
          description={canAdd ? 'Add a PDF or a photo and it stays here, ready whenever you need it.' : 'No files have been shared with you here.'}
          actionLabel={canAdd ? 'Add a file' : undefined}
          onActionPress={canAdd ? () => setAdding(true) : undefined}
        />
      ) : (
        <View style={{ gap: theme.spacing.sm }} testID="vault-list">
          {shown.map((f) => (
            <Card key={f.id} onPress={() => setSelected(f)} accessibilityLabel={`${f.title}, ${CATEGORY_LABEL[f.category]}`} testID={`vault-file-${f.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Ionicons name={f.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={26} color={theme.colors.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary }]}>{f.title}</Text>
                  <Text style={[theme.typography.bodySmall, { color: theme.colors.textTertiary }]}>
                    {CATEGORY_LABEL[f.category]} · {formatSize(f.fileSizeBytes)} · {day(f.uploadedAt ?? f.createdAt)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      <AddSheet
        visible={adding}
        categories={allowed}
        onClose={() => setAdding(false)}
        onSave={async (file, category, name) => {
          try {
            await vaultService.upload({ subjectId, category, title: name, file });
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
        canDelete={canAdd}
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

function AddSheet({ visible, categories, onClose, onSave }: { visible: boolean; categories: VaultCategory[]; onClose: () => void; onSave: (file: PickedFile, category: VaultCategory, title: string) => Promise<string | null> }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<VaultCategory>(categories[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const name = cleanVaultTitle(text);

  function reset() {
    setPicked(null);
    setText('');
    setMessage(null);
    setCategory(categories[0]);
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
    if (!picked || !name) return;
    setSaving(true);
    const failed = await onSave(picked, category, name);
    setSaving(false);
    if (failed) setMessage(failed);
    else reset();
  }

  return (
    <BottomSheet visible={visible} onClose={() => { reset(); onClose(); }} title="Add a file">
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
            {categories.length > 1 ? (
              <View style={{ gap: theme.spacing.xs }}>
                <Text style={[theme.typography.labelMedium, { color: theme.colors.textSecondary }]}>Type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
                  {categories.map((c) => (
                    <Chip key={c} label={CATEGORY_LABEL[c]} selected={category === c} onPress={() => setCategory(c)} testID={`vault-category-${c}`} />
                  ))}
                </View>
              </View>
            ) : null}
            <Button label="Save to my folder" onPress={save} disabled={!name || saving} loading={saving} testID="vault-save" />
          </>
        )}
        {message ? <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="vault-add-error">{message}</Text> : null}
      </View>
    </BottomSheet>
  );
}

function FileSheet({ file, canDelete, onClose, onDeleted }: { file: VaultFile | null; canDelete: boolean; onClose: () => void; onDeleted: () => Promise<void> }) {
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
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textPrimary }]}>Delete this file? It is removed from your folder and can&rsquo;t be recovered.</Text>
            <Button label="Delete file" variant="destructive" onPress={remove} loading={busy} testID="vault-delete-confirm" />
            <Button label="Keep it" variant="secondary" onPress={() => setConfirming(false)} testID="vault-delete-cancel" />
          </>
        ) : (
          <>
            <Button label="Open" onPress={open} loading={busy} testID="vault-open" />
            {canDelete ? <Button label="Delete" variant="secondary" onPress={() => setConfirming(true)} testID="vault-delete" /> : null}
          </>
        )}
        {message ? <Text style={[theme.typography.bodySmall, { color: theme.colors.danger }]} accessibilityLiveRegion="polite" testID="vault-file-error">{message}</Text> : null}
      </View>
    </BottomSheet>
  );
}

import { isDemoMode } from '../../config/appMode';
import { isOwnRecordFor } from './ownership';
import { readLocalFile } from '../documents/fileAccess';
import { sanitizeFilename } from '../documents/documentValidation';
import { loadDemoServices } from '../demo/demoServices';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import type { PickedFile } from '../../types';
import { addedByFor, expectedVaultPath, parseExpiry, validKind, validateVaultFile, type VaultActivity, type VaultCategory, type VaultFile, type VaultMime } from './vaultRules';

/**
 * The personal documents folder. Files go to the private `personal-vault` bucket; the
 * database decides uploader, role, path and state (see the `vault_files` migration). Nothing is
 * read, classified or sent to AI. The controller of a person's record, or a family manager with
 * write access, can add; the controller or the uploader can delete; anyone with access can open.
 * A file belongs to the person, so it stays when the family member who added it leaves.
 *
 * Upload: reserve a row (database assigns owner and path) -> upload the file to exactly that
 * path -> confirm (the database checks the file really exists and records its size).
 */

export type VaultUploadInput = { subjectId: string | null; category: VaultCategory; kind?: string | null; expiresOn?: string | null; title: string; file: PickedFile };
export type VaultStage = 'checking' | 'uploading' | 'saving';

export interface VaultService {
  list(subjectId: string | null): Promise<VaultFile[]>;
  upload(input: VaultUploadInput, onStage?: (stage: VaultStage) => void): Promise<VaultFile>;
  /** Recent adds and deletes, for the person's controller (others get an empty list). */
  listActivity(subjectId: string | null): Promise<VaultActivity[]>;
  /** A short-lived link to open the file. */
  openUrl(file: VaultFile): Promise<string>;
  remove(file: VaultFile): Promise<void>;
}

export const VAULT_BUCKET = 'personal-vault';
export const SIGNED_URL_TTL_SECONDS = 60;
const CONFIRM_ATTEMPTS = 3;
const LOAD_FAILED = 'We couldn’t load your files. Please try again.';

type Row = {
  id: string;
  subject_id: string;
  uploaded_by: string | null;
  category: VaultCategory;
  kind: string | null;
  expires_on: string | null;
  title: string;
  original_filename: string;
  mime_type: VaultMime;
  file_size_bytes: number;
  storage_path: string;
  uploaded_at: string | null;
  created_at: string;
};
const COLUMNS = 'id, subject_id, uploaded_by, category, kind, expires_on, title, original_filename, mime_type, file_size_bytes, storage_path, uploaded_at, created_at';

const fromRow = (r: Row, me: string | null): VaultFile => ({
  id: r.id,
  subjectId: r.subject_id,
  category: r.category,
  kind: r.kind,
  expiresOn: r.expires_on,
  title: r.title,
  originalFilename: r.original_filename,
  mimeType: r.mime_type,
  fileSizeBytes: Number(r.file_size_bytes),
  storagePath: r.storage_path,
  uploadedAt: r.uploaded_at,
  createdAt: r.created_at,
  addedBy: addedByFor(r.uploaded_by, me),
});

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new ServiceError('not_configured', 'Your files aren’t available right now.');
  return client;
}

async function requireUserId(client: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<string> {
  const { data } = await client.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ServiceError('not_signed_in', 'Please sign in again to continue.');
  return id;
}

/** Best effort: drop a reservation whose upload never completed (the database refuses while a stored object exists). */
async function abandon(client: NonNullable<ReturnType<typeof getSupabaseClient>>, row: Pick<Row, 'id'>) {
  await Promise.resolve(client.rpc('vault_delete_file', { p_file: row.id })).catch(() => undefined);
}

export const productionVaultService: VaultService = {
  async list(subjectId) {
    if (!subjectId) return [];
    const client = requireClient();
    const me = await requireUserId(client);
    const { data, error } = await client.from('vault_files').select(COLUMNS).eq('subject_id', subjectId).eq('status', 'stored').order('created_at', { ascending: false }).limit(500);
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: LOAD_FAILED, retryable: true });
    return (data as Row[]).map((r) => fromRow(r, me));
  },

  async listActivity(subjectId) {
    if (!subjectId) return [];
    const client = requireClient();
    await requireUserId(client);
    const { data, error } = await client.from('subject_activity').select('id, action, entity_title, actor_role, at').eq('subject_id', subjectId).order('at', { ascending: false }).limit(20);
    // Only a person's controller can read this; for everyone else it is simply empty.
    if (error) return [];
    return (data as { id: string; action: 'added' | 'deleted'; entity_title: string; actor_role: VaultActivity['actorRole']; at: string }[]).map((r) => ({
      id: r.id,
      action: r.action,
      title: r.entity_title,
      actorRole: r.actor_role,
      at: r.at,
    }));
  },

  async upload(input, onStage) {
    onStage?.('checking');
    const checked = validateVaultFile(input.file);
    if (!checked.ok) throw new ServiceError('invalid_file', checked.message);

    let buffer: ArrayBuffer;
    try {
      buffer = await readLocalFile(input.file.uri);
    } catch (cause) {
      throw new ServiceError('invalid_file', 'We couldn’t read that file. Please choose it again.', { cause });
    }
    const size = validateVaultFile({ ...input.file, size: buffer.byteLength });
    if (!size.ok) throw new ServiceError('invalid_file', size.message);

    const client = requireClient();
    const me = await requireUserId(client);

    onStage?.('uploading');
    const { data: reserved, error: reserveError } = await client
      .from('vault_files')
      .insert({
        // Your own record is filled in by the database; anyone else's is named (relative, or a person who made you a manager).
        ...(input.subjectId && !isOwnRecordFor(input.subjectId) ? { subject_id: input.subjectId } : {}),
        category: input.category,
        kind: validKind(input.category, input.kind),
        expires_on: input.expiresOn ? parseExpiry(input.expiresOn) : null,
        title: input.title,
        original_filename: sanitizeFilename(input.file.name),
        mime_type: checked.mimeType,
        file_size_bytes: buffer.byteLength,
      })
      .select(COLUMNS)
      .single();
    if (reserveError || !reserved) {
      throw toServiceError(reserveError, { code: 'save_failed', userMessage: 'We couldn’t start the upload. Please try again.', retryable: true });
    }
    const row = reserved as Row;
    if (row.storage_path !== expectedVaultPath(row.subject_id, row.id, checked.mimeType)) {
      await abandon(client, row);
      throw new ServiceError('unknown', 'We couldn’t start the upload. Please try again.');
    }

    const { error: uploadError } = await client.storage.from(VAULT_BUCKET).upload(row.storage_path, buffer, { contentType: checked.mimeType, upsert: false });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message ?? '')) {
      await abandon(client, row);
      throw toServiceError(uploadError, { code: 'upload_failed', userMessage: 'The upload didn’t finish. Please check your connection and try again.', retryable: true });
    }

    onStage?.('saving');
    let lastError: unknown = null;
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
      const { data: confirmed, error } = await client.from('vault_files').update({ status: 'stored' }).eq('id', row.id).select(COLUMNS).single();
      if (!error && confirmed) return fromRow(confirmed as Row, me);
      lastError = error;
    }
    throw toServiceError(lastError, { code: 'save_failed', userMessage: 'Your file was uploaded but we couldn’t finish saving it. Please try again.', retryable: true });
  },

  async openUrl(file) {
    const client = requireClient();
    await requireUserId(client);
    const { data, error } = await client.storage.from(VAULT_BUCKET).createSignedUrl(file.storagePath, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t open this file. Please try again.', retryable: true });
    return data.signedUrl;
  },

  async remove(file) {
    const client = requireClient();
    await requireUserId(client);
    // One audited server path: it checks who may delete, removes the stored file, then the record.
    // If the record step fails the file is already gone and deleting again finishes the job.
    const { data, error } = await client.functions.invoke('delete-vault-file', { body: { file_id: file.id } });
    if (error || (data as { status?: string } | null)?.status !== 'deleted') {
      throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t delete this file. Please try again.', retryable: true });
    }
  },
};

export const vaultService: VaultService = isDemoMode ? loadDemoServices().vault : productionVaultService;

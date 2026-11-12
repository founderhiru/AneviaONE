import { isDemoMode } from '../../config/appMode';
import { isOwnRecordFor } from './ownership';
import { readLocalFile } from '../documents/fileAccess';
import { sanitizeFilename } from '../documents/documentValidation';
import { loadDemoServices } from '../demo/demoServices';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import type { PickedFile } from '../../types';
import { expectedVaultPath, validateVaultFile, type VaultCategory, type VaultFile, type VaultMime } from './vaultRules';

/**
 * The personal documents folder. Files go to the private `personal-vault` bucket; the
 * database decides owner, path and state (see the `vault_files` migration). Nothing is
 * read, classified or sent to AI. Only the owner of a person's record can add or delete;
 * people with approved access can open.
 *
 * Upload: reserve a row (database assigns owner and path) -> upload the file to exactly that
 * path -> confirm (the database checks the file really exists and records its size).
 */

export type VaultUploadInput = { subjectId: string | null; category: VaultCategory; title: string; file: PickedFile };
export type VaultStage = 'checking' | 'uploading' | 'saving';

export interface VaultService {
  list(subjectId: string | null): Promise<VaultFile[]>;
  upload(input: VaultUploadInput, onStage?: (stage: VaultStage) => void): Promise<VaultFile>;
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
  category: VaultCategory;
  title: string;
  original_filename: string;
  mime_type: VaultMime;
  file_size_bytes: number;
  storage_path: string;
  uploaded_at: string | null;
  created_at: string;
};
const COLUMNS = 'id, subject_id, category, title, original_filename, mime_type, file_size_bytes, storage_path, uploaded_at, created_at';

const fromRow = (r: Row): VaultFile => ({
  id: r.id,
  subjectId: r.subject_id,
  category: r.category,
  title: r.title,
  originalFilename: r.original_filename,
  mimeType: r.mime_type,
  fileSizeBytes: Number(r.file_size_bytes),
  storagePath: r.storage_path,
  uploadedAt: r.uploaded_at,
  createdAt: r.created_at,
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

/** Best effort: remove a reservation whose upload never completed. */
async function abandon(client: NonNullable<ReturnType<typeof getSupabaseClient>>, row: Pick<Row, 'id' | 'storage_path'>) {
  await client.storage.from(VAULT_BUCKET).remove([row.storage_path]).catch(() => undefined);
  await Promise.resolve(client.from('vault_files').delete().eq('id', row.id).eq('status', 'pending_upload')).catch(() => undefined);
}

export const productionVaultService: VaultService = {
  async list(subjectId) {
    if (!subjectId) return [];
    const client = requireClient();
    await requireUserId(client);
    const { data, error } = await client.from('vault_files').select(COLUMNS).eq('subject_id', subjectId).eq('status', 'stored').order('created_at', { ascending: false }).limit(500);
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: LOAD_FAILED, retryable: true });
    return (data as Row[]).map(fromRow);
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
    const userId = await requireUserId(client);

    onStage?.('uploading');
    const { data: reserved, error: reserveError } = await client
      .from('vault_files')
      .insert({
        // Your own record is filled in by the database; a relative you manage is named.
        ...(input.subjectId && !isOwnRecordFor(input.subjectId) ? { subject_id: input.subjectId } : {}),
        category: input.category,
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
    if (row.storage_path !== expectedVaultPath(userId, row.id, checked.mimeType)) {
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
      if (!error && confirmed) return fromRow(confirmed as Row);
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
    // The file first, then its record. If the record cannot be removed the file is gone, and
    // deleting again finishes the job; a record is never removed while its file is still there.
    const removed = await client.storage.from(VAULT_BUCKET).remove([file.storagePath]);
    if (removed.error) throw toServiceError(removed.error, { code: 'unknown', userMessage: 'We couldn’t delete this file. It hasn’t been removed — please try again.', retryable: true });
    const { error } = await client.from('vault_files').delete().eq('id', file.id);
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t finish deleting this file. Please try again.', retryable: true });
  },
};

export const vaultService: VaultService = isDemoMode ? loadDemoServices().vault : productionVaultService;

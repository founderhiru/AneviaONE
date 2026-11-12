/**
 * Rules for the personal documents folder (pure functions, no I/O). The database and the
 * private bucket enforce the same limits again; these give a fast, friendly message.
 * Nothing here reads inside a file.
 */
import { sanitizeFilename } from '../documents/documentValidation';

export type VaultCategory = 'identity' | 'insurance' | 'education' | 'property' | 'legal' | 'vehicle' | 'certificate' | 'other';

export const VAULT_CATEGORIES: { value: VaultCategory; label: string }[] = [
  { value: 'identity', label: 'Identity' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'education', label: 'Education' },
  { value: 'property', label: 'Property' },
  { value: 'legal', label: 'Legal' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'certificate', label: 'Certificates' },
  { value: 'other', label: 'Other' },
];

export const CATEGORY_LABEL: Record<VaultCategory, string> = Object.fromEntries(VAULT_CATEGORIES.map((c) => [c.value, c.label])) as Record<VaultCategory, string>;

/** The three places on Home that open the folder. */
export type VaultGroup = 'identity' | 'insurance' | 'documents';

export const GROUP_TITLE: Record<VaultGroup, string> = { identity: 'Identity', insurance: 'Insurance', documents: 'Documents' };

const GROUP_CATEGORIES: Record<VaultGroup, VaultCategory[]> = {
  identity: ['identity'],
  insurance: ['insurance'],
  documents: ['education', 'property', 'legal', 'vehicle', 'certificate', 'other'],
};

export const categoriesOf = (group: VaultGroup | null): VaultCategory[] => (group ? GROUP_CATEGORIES[group] : VAULT_CATEGORIES.map((c) => c.value));

export const parseGroup = (value: unknown): VaultGroup | null => (value === 'identity' || value === 'insurance' || value === 'documents' ? value : null);

export type VaultFile = {
  id: string;
  subjectId: string;
  category: VaultCategory;
  title: string;
  originalFilename: string;
  mimeType: VaultMime;
  fileSizeBytes: number;
  storagePath: string;
  uploadedAt: string | null;
  createdAt: string;
};

export const MAX_VAULT_BYTES = 20 * 1024 * 1024;
export const VAULT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'] as const;
export type VaultMime = (typeof VAULT_MIME_TYPES)[number];
export const TITLE_MAX = 120;

const EXTENSION_MIME: Record<string, VaultMime> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heic' };
const EXTENSION_FOR: Record<VaultMime, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' };
const GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export const extensionFor = (mime: VaultMime): string => EXTENSION_FOR[mime];

export type VaultCheck = { ok: true; mimeType: VaultMime } | { ok: false; message: string };

/** The picker's name, type and size are enough for a first check. */
export function validateVaultFile(file: { name?: string | null; mimeType?: string | null; size?: number | null }): VaultCheck {
  const declared = (file.mimeType ?? '').trim().toLowerCase().replace('image/heif', 'image/heic');
  const ext = (file.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  const byName = EXTENSION_MIME[ext];
  const mime = (VAULT_MIME_TYPES as readonly string[]).includes(declared) ? (declared as VaultMime) : GENERIC.has(declared) ? byName : undefined;
  if (!mime) return { ok: false, message: 'Please choose a PDF or a photo (JPG, PNG or HEIC).' };
  if (typeof file.size === 'number' && file.size <= 0) return { ok: false, message: 'This file appears to be empty. Please choose another one.' };
  if (typeof file.size === 'number' && file.size > MAX_VAULT_BYTES) return { ok: false, message: `This file is too large. Please choose one under ${MAX_VAULT_BYTES / (1024 * 1024)} MB.` };
  return { ok: true, mimeType: mime };
}

/** "IMG_2041_passport.JPG" becomes "IMG 2041 passport": a starting title the person can change. */
export function titleFromFilename(name: string | null | undefined): string {
  const base = sanitizeFilename(name).replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const title = base || 'Document';
  return (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, TITLE_MAX);
}

export function cleanVaultTitle(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= TITLE_MAX ? t : null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const expectedVaultPath = (userId: string, fileId: string, mime: VaultMime): string => `${userId}/files/${fileId}/original.${EXTENSION_FOR[mime]}`;

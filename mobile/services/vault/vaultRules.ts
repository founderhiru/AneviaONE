/**
 * Rules for the personal documents folder (pure functions, no I/O). The database and the
 * private bucket enforce the same limits again; these give a fast, friendly message.
 * Nothing here reads inside a file.
 */
import { sanitizeFilename } from '../documents/documentValidation';

export type VaultCategory = 'identity' | 'insurance' | 'education' | 'property_legal' | 'photos' | 'other';

export type VaultCategoryInfo = {
  value: VaultCategory;
  label: string;
  hint: string;
  icon: 'id-card-outline' | 'shield-checkmark-outline' | 'school-outline' | 'home-outline' | 'images-outline' | 'folder-open-outline';
  /** Named slots inside the category; empty means one plain list. */
  kinds: string[];
};

export const VAULT_CATEGORIES: VaultCategoryInfo[] = [
  { value: 'identity', label: 'Identity Documents', hint: 'Aadhaar, PAN, Passport, Driving Licence', icon: 'id-card-outline', kinds: ['Aadhaar', 'PAN', 'Passport', 'Driving Licence'] },
  { value: 'insurance', label: 'Insurance', hint: 'Health, Life, Vehicle', icon: 'shield-checkmark-outline', kinds: ['Health', 'Life', 'Vehicle'] },
  { value: 'education', label: 'Education & Certificates', hint: 'Degrees, marksheets, certificates', icon: 'school-outline', kinds: [] },
  { value: 'property_legal', label: 'Property & Legal', hint: 'Agreements, deeds, wills', icon: 'home-outline', kinds: [] },
  { value: 'photos', label: 'Photos & Personal Files', hint: 'Photos and papers you want to keep', icon: 'images-outline', kinds: [] },
  { value: 'other', label: 'Other Documents', hint: 'Anything else worth keeping', icon: 'folder-open-outline', kinds: [] },
];

export const CATEGORY_LABEL: Record<VaultCategory, string> = Object.fromEntries(VAULT_CATEGORIES.map((c) => [c.value, c.label])) as Record<VaultCategory, string>;

export const parseCategory = (value: unknown): VaultCategory | null =>
  VAULT_CATEGORIES.some((c) => c.value === value) ? (value as VaultCategory) : null;

export const categoryInfo = (value: VaultCategory): VaultCategoryInfo => VAULT_CATEGORIES.find((c) => c.value === value)!;

/** A kind is only valid inside the category that names it. */
export const validKind = (category: VaultCategory, kind: string | null | undefined): string | null =>
  kind && categoryInfo(category).kinds.includes(kind) ? kind : null;

export type VaultFile = {
  id: string;
  subjectId: string;
  category: VaultCategory;
  kind: string | null;
  /** Optional day (YYYY-MM-DD) the document runs out, e.g. a passport. */
  expiresOn: string | null;
  title: string;
  originalFilename: string;
  mimeType: VaultMime;
  fileSizeBytes: number;
  storagePath: string;
  uploadedAt: string | null;
  createdAt: string;
  /** Who added it, from the viewer's side: never a name, never a user id. */
  addedBy: AddedBy;
};

export type AddedBy = 'you' | 'family_member' | 'former_family_member';

export const ADDED_BY_LABEL: Record<AddedBy, string> = {
  you: 'Added by you',
  family_member: 'Added by a family member',
  former_family_member: 'Added by a previous family member',
};

/** uploaded_by is null once the uploader's account is gone; the file stays with the person. */
export const addedByFor = (uploadedBy: string | null, me: string | null): AddedBy => (uploadedBy === null ? 'former_family_member' : uploadedBy === me ? 'you' : 'family_member');

/** Delete: whoever controls the record, or the family member who added the file while they still manage it. */
export const canDeleteVaultFile = (access: 'owner' | 'manager' | 'viewer' | null, file: Pick<VaultFile, 'addedBy'>): boolean =>
  access === null || access === 'owner' || (access === 'manager' && file.addedBy === 'you');

/** What the person's controller sees in "Recent activity": roles, never names. */
export type VaultActivity = { id: string; action: 'added' | 'deleted'; title: string; actorRole: 'self' | 'custodian' | 'manager'; at: string };

export function activityText(a: Pick<VaultActivity, 'action' | 'title' | 'actorRole'>): string {
  const who = a.actorRole === 'manager' ? 'A family member' : 'You';
  return `${who} ${a.action === 'added' ? 'added' : 'deleted'} ${a.title}`;
}

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

/** A file lives in its PERSON's folder, not the uploader's. */
export const expectedVaultPath = (subjectId: string, fileId: string, mime: VaultMime): string => `${subjectId}/files/${fileId}/original.${EXTENSION_FOR[mime]}`;

export type SlotStatus = 'not_added' | 'added' | 'expiring' | 'expired';
export const EXPIRY_WARNING_DAYS = 90;

const DAY_MS = 86_400_000;
/** Whole days from today to a YYYY-MM-DD day (negative once it has passed). */
export function daysToExpiry(expiresOn: string, today: Date): number {
  const [y, m, d] = expiresOn.split('-').map(Number);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - start) / DAY_MS);
}

/** Status of one slot (e.g. Passport) from the files in it. Only dates the person entered count. */
export function slotStatus(files: Pick<VaultFile, 'expiresOn'>[], today: Date): SlotStatus {
  if (files.length === 0) return 'not_added';
  const days = files.filter((f) => f.expiresOn).map((f) => daysToExpiry(f.expiresOn as string, today));
  if (days.length === 0) return 'added';
  // A newer, valid copy beats an old expired one: judge by the latest expiry.
  const latest = Math.max(...days);
  if (latest < 0) return 'expired';
  return latest <= EXPIRY_WARNING_DAYS ? 'expiring' : 'added';
}

export const STATUS_LABEL: Record<SlotStatus, string> = { not_added: 'Not added', added: 'Added', expiring: 'Expiring soon', expired: 'Expired' };

/** A real calendar day typed as YYYY-MM-DD, or null. */
export function parseExpiry(raw: string): string | null {
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, m, d] = t.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y >= 1900 && y <= 2200 ? t : null;
}

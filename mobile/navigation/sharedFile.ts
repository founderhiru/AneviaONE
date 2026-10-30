import type { PickedFile } from '../types';

/**
 * A PDF handed to AneviaONE from another app (WhatsApp, Gmail, Files…) via the
 * system Share sheet. It is parked here until the person is signed in and the
 * Add Record screen takes it — the same upload, consent and reading path as a
 * file they pick themselves. Nothing is read or sent anywhere by sharing alone.
 */
let pending: PickedFile | null = null;

export const setPendingSharedFile = (file: PickedFile) => {
  pending = file;
};
export const hasPendingSharedFile = () => pending !== null;
export function takePendingSharedFile(): PickedFile | null {
  const file = pending;
  pending = null;
  return file;
}

type SharedFile = { path?: string | null; fileName?: string | null; mimeType?: string | null; size?: number | null };

export type SharedFileResult = { ok: true; file: PickedFile } | { ok: false; message: string };

const isPdf = (f: SharedFile) => (f.mimeType ?? '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(f.fileName ?? '');

/** Exactly one PDF is accepted; anything else is explained, not silently dropped. */
export function pickedFileFromShare(files: SharedFile[] | null | undefined): SharedFileResult {
  const list = files ?? [];
  if (list.length === 0) return { ok: false, message: 'Nothing to add was shared.' };
  if (list.length > 1) return { ok: false, message: 'Please share one report at a time.' };
  const [f] = list;
  if (!f.path || !isPdf(f)) return { ok: false, message: 'Only PDF reports can be added from Share for now.' };
  const name = (f.fileName ?? '').trim() || 'Shared report.pdf';
  return { ok: true, file: { uri: f.path, name, mimeType: 'application/pdf', size: f.size ?? null, source: 'upload' } };
}

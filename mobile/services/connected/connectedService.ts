import { documentsService } from '../documents/documentsService';

/** What the signed-in person has brought in through medical records — the one live source. */
export type RecordsSummary = { documentCount: number; lastAddedAt: string | null };

/** From the existing documents list; throws the documents service's own safe error. */
export async function getRecordsSummary(): Promise<RecordsSummary> {
  const documents = await documentsService.listDocuments();
  const stored = documents.filter((d) => d.status !== 'deleting');
  const last = stored.map((d) => d.uploadedAt ?? d.createdAt).sort().pop() ?? null;
  return { documentCount: stored.length, lastAddedAt: last };
}

export function formatAdded(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

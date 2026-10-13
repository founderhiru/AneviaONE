import type { SupabaseClient } from '@supabase/supabase-js';

export type HeldNow = { unreviewed: number; rejected: number };

const FACT_TABLES = ['observations', 'conditions', 'medications', 'procedures', 'allergies', 'encounters'] as const;

/**
 * Results of these reports that are held for checking right now (current,
 * unreviewed) or were rejected, per report — read live (RLS: own rows only).
 * A read's own counts are frozen when the report is read; results the person
 * has since confirmed or corrected are no longer held. Null when any read
 * fails, so callers keep the counts from reading time (never a false "all clear").
 */
export async function heldNow(client: SupabaseClient, ids: string[]): Promise<Map<string, HeldNow> | null> {
  if (ids.length === 0) return new Map();
  const results = await Promise.all(
    FACT_TABLES.map((table) =>
      client
        .from(table)
        .select('document_id, review_status')
        .in('document_id', ids)
        .eq('confidence_gate', 'needs_review')
        .is('superseded_at', null)
        .neq('review_status', 'confirmed')
    )
  ).catch(() => null);
  if (!results || results.some((r) => r.error || !r.data)) return null;
  const counts = new Map<string, HeldNow>();
  for (const { data } of results) {
    for (const row of data as { document_id: string; review_status: string }[]) {
      const c = counts.get(row.document_id) ?? { unreviewed: 0, rejected: 0 };
      if (row.review_status === 'rejected') c.rejected += 1;
      else c.unreviewed += 1;
      counts.set(row.document_id, c);
    }
  }
  return counts;
}

/**
 * Applies the live state to a read's held count: how many are still held, and
 * how many have since been accepted into Health Memory (confirmed or corrected;
 * rejected ones are neither). Without live counts, the read's own are kept.
 */
export function reviewProgress(heldAtRead: number, live: Map<string, HeldNow> | null, documentId: string) {
  if (!live) return { stillHeld: heldAtRead, accepted: 0 };
  const now = live.get(documentId) ?? { unreviewed: 0, rejected: 0 };
  const stillHeld = Math.min(heldAtRead, now.unreviewed);
  return { stillHeld, accepted: Math.max(0, heldAtRead - stillHeld - now.rejected) };
}

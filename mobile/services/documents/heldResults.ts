import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * `unreviewed` / `rejected` count held RESULTS (anything the person can check).
 * `visits` counts held encounter records — the report's own date/type line.
 * Those carry no health value and there is nothing for the person to confirm,
 * so they never make a report "need review" (they stay out of Health Memory).
 */
export type HeldNow = { unreviewed: number; rejected: number; visits: number };

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
  for (const [i, { data }] of results.entries()) {
    const table = FACT_TABLES[i];
    for (const row of data as { document_id: string; review_status: string }[]) {
      const c = counts.get(row.document_id) ?? { unreviewed: 0, rejected: 0, visits: 0 };
      if (table === 'encounters') c.visits += 1;
      else if (row.review_status === 'rejected') c.rejected += 1;
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
  const now = live.get(documentId) ?? { unreviewed: 0, rejected: 0, visits: 0 };
  // Held visit records are not results to check: take them out of the read's held count.
  const heldResults = Math.max(0, heldAtRead - now.visits);
  const stillHeld = Math.min(heldResults, now.unreviewed);
  return { stillHeld, accepted: Math.max(0, heldResults - stillHeld - now.rejected) };
}

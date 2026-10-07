import { BRAND } from '@/lib/config';
import { faqCategories, faqForPlatform, type FaqCategoryId, type ResolvedFaqEntry } from '../../shared/faq';

/**
 * Website view of the shared FAQ (shared/faq.ts — also used by the mobile
 * app). Copy is never edited here; this only fills in the brand name and
 * groups the web-visible entries by category.
 */
export type FaqGroup = { id: FaqCategoryId; label: string; entries: ResolvedFaqEntry[] };

export function webFaqGroups(): FaqGroup[] {
  const entries = faqForPlatform('web', BRAND.name);
  return faqCategories(BRAND.name)
    .map((c) => ({ id: c.id, label: c.label, entries: entries.filter((e) => e.category === c.id) }))
    .filter((g) => g.entries.length > 0);
}

export type { ResolvedFaqEntry };

/**
 * The ten questions a prospective user asks first, in reading order. They are
 * the same entries as /faq (shared/faq.ts) — one source, no second copy.
 */
const HOME_FAQ_IDS = [
  'what-is',
  'not-a-locker',
  'file-types',
  'connect-history',
  'what-changed',
  'ask',
  'private',
  'delete',
  'diagnose',
  'get-started',
] as const;

export function homeFaq(): ResolvedFaqEntry[] {
  const byId = new Map(faqForPlatform('web', BRAND.name).map((e) => [e.id, e]));
  return HOME_FAQ_IDS.map((id) => byId.get(id)).filter((e): e is ResolvedFaqEntry => Boolean(e));
}

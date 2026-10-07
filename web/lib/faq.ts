import { BRAND } from '@/lib/config';
import {
  FAQ_ENTRIES,
  FAQ_STATUS_LABELS,
  faqCategories,
  withProduct,
  type FaqCategoryId,
  type ResolvedFaqEntry,
} from '../../shared/faq';
import { WEB_FAQ_OVERRIDES, WEB_ONLY_FAQ } from './faq-web';

/**
 * Website view of the FAQ. The base is the shared FAQ (shared/faq.ts — also
 * used by the mobile app, and never edited for website copy). Website-only
 * wording and entries come from ./faq-web and are layered on top, so nothing
 * the website says can change what the app shows.
 */
function webEntries(): ResolvedFaqEntry[] {
  return [...FAQ_ENTRIES.filter((e) => e.webVisible).map((e) => ({ ...e, ...WEB_FAQ_OVERRIDES[e.id] })), ...WEB_ONLY_FAQ]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((e) => ({
      ...e,
      question: withProduct(e.question, BRAND.name),
      answer: e.answer.map((p) => withProduct(p, BRAND.name)),
      statusLabel: e.status ? FAQ_STATUS_LABELS[e.status] : undefined,
    }));
}

export type FaqGroup = { id: FaqCategoryId; label: string; entries: ResolvedFaqEntry[] };

export function webFaqGroups(): FaqGroup[] {
  const entries = webEntries();
  return faqCategories(BRAND.name)
    .map((c) => ({ id: c.id, label: c.label, entries: entries.filter((e) => e.category === c.id) }))
    .filter((g) => g.entries.length > 0);
}

export type { ResolvedFaqEntry };

/**
 * The ten questions a prospective user asks first, in reading order. They are
 * the same entries as /faq — one FAQ, no second copy.
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
  const byId = new Map(webEntries().map((e) => [e.id, e]));
  return HOME_FAQ_IDS.map((id) => byId.get(id)).filter((e): e is ResolvedFaqEntry => Boolean(e));
}

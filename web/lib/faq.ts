import { BRAND } from '@/lib/config';
import { FAQ_ENTRIES, faqCategories, withProduct, type FaqCategoryId, type FaqEntry } from '../../shared/faq';
import { WEB_FAQ_OVERRIDES, WEB_ONLY_FAQ, WEB_STATUS_LABELS, type WebFaqStatus } from './faq-web';

/**
 * Website view of the FAQ. The base is the shared FAQ (shared/faq.ts — also
 * used by the mobile app, and never edited for website copy). Website-only
 * wording, statuses and entries come from ./faq-web and are layered on top, so
 * nothing the website says can change what the app shows.
 */
export type ResolvedFaqEntry = Omit<FaqEntry, 'question' | 'answer' | 'status'> & {
  question: string;
  answer: string[];
  status?: WebFaqStatus;
  statusLabel?: string;
};

function webEntries(): ResolvedFaqEntry[] {
  const shared = FAQ_ENTRIES.filter((e) => e.webVisible).map((e) => {
    const o = WEB_FAQ_OVERRIDES[e.id];
    // Shared statuses map one-to-one onto the website's; 'planned' keeps its meaning.
    const status: WebFaqStatus | undefined = o?.status ?? e.status;
    return { ...e, answer: o?.answer ?? e.answer, status };
  });
  return [...shared, ...WEB_ONLY_FAQ]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((e) => ({
      ...e,
      question: withProduct(e.question, BRAND.name),
      answer: e.answer.map((p) => withProduct(p, BRAND.name)),
      statusLabel: e.status ? WEB_STATUS_LABELS[e.status] : undefined,
    }));
}

export type FaqGroup = { id: FaqCategoryId; label: string; entries: ResolvedFaqEntry[] };

export function webFaqGroups(): FaqGroup[] {
  const entries = webEntries();
  return faqCategories(BRAND.name)
    .map((c) => ({ id: c.id, label: c.label, entries: entries.filter((e) => e.category === c.id) }))
    .filter((g) => g.entries.length > 0);
}

/**
 * The ten questions a prospective user asks first, in reading order. They are
 * the same entries as /faq — one FAQ, no second copy.
 */
const HOME_FAQ_IDS = [
  'what-is',
  'not-a-locker',
  'file-types',
  'understand-reports',
  'what-changed',
  'doctor-summary',
  'private',
  'delete',
  'diagnose',
  'get-started',
] as const;

export function homeFaq(): ResolvedFaqEntry[] {
  const byId = new Map(webEntries().map((e) => [e.id, e]));
  return HOME_FAQ_IDS.map((id) => byId.get(id)).filter((e): e is ResolvedFaqEntry => Boolean(e));
}

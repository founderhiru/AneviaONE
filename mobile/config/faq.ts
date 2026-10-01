/**
 * Mobile view of the shared FAQ (../shared/faq.ts — also used by the website
 * FAQ at /faq). Copy is never edited here: this only fills in the product name
 * from the central brand config and picks the entries marked `mobileVisible`.
 */
import { faqForPlatform, type FaqCategoryId, type ResolvedFaqEntry } from '../../shared/faq';
import { BRAND } from './brand';

export type { FaqCategoryId, ResolvedFaqEntry };

/** Named subsets of the mobile FAQ, reachable from the Me screen. */
export const FAQ_TOPICS = {
  /** Me → Data & Security: privacy, security and account/data questions. */
  'data-security': {
    title: 'Data & Security',
    categories: ['health-records', 'privacy-security', 'account-data'] as FaqCategoryId[],
  },
} as const;

export type FaqTopic = keyof typeof FAQ_TOPICS;

export function isFaqTopic(value: unknown): value is FaqTopic {
  return typeof value === 'string' && value in FAQ_TOPICS;
}

/** Mobile-visible FAQ entries in order, optionally narrowed to a topic. */
export function mobileFaq(topic?: FaqTopic): ResolvedFaqEntry[] {
  const entries = faqForPlatform('mobile', BRAND.productName);
  if (!topic) return entries;
  const categories: FaqCategoryId[] = FAQ_TOPICS[topic].categories;
  return entries.filter((e) => categories.includes(e.category));
}

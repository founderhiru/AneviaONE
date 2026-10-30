import type { FaqEntry } from '../../shared/faq';
import { LINKS } from './config';

/**
 * Website-only FAQ wording.
 *
 * shared/faq.ts is also read by the mobile app's Help screen, so it is never
 * edited for website copy. Anything the website must say differently, or
 * additionally, lives here and is layered over the shared entries in
 * web/lib/faq.ts. Entries here are web-only: they never reach the app.
 *
 * Status vocabulary (website only):
 *   partial     — a limited version works today; the answer says which part
 *   planned     — not available yet
 *   preview     — a preview screen exists; the real service is not live
 * Unlabelled answers describe how the app works today.
 */
export type WebFaqStatus = 'partial' | 'planned' | 'preview';

export const WEB_STATUS_LABELS: Record<WebFaqStatus, string> = {
  partial: 'Partly available',
  planned: 'Not yet available',
  preview: 'Preview only',
};

type Override = Partial<Pick<FaqEntry, 'answer'>> & { status?: WebFaqStatus };

/** A web-only entry: same shape as a shared one, with the website's own statuses. */
export type WebOnlyFaqEntry = Omit<FaqEntry, 'status'> & { status?: WebFaqStatus };

/** Replacement answers / statuses for shared entries, keyed by id (web only). Only the help answer, which names the website's contact email. */
export const WEB_FAQ_OVERRIDES: Record<string, Override> = {
  help: {
    answer: [
      LINKS.contactEmail
        ? `Start with these questions. For anything else, email ${LINKS.contactEmail}. Please do not email health records or other personal health information.`
        : 'Start with these questions. Contact details will be published on this website soon.',
    ],
  },
};

/** Web-only entries (never shown in the app). None today. */
export const WEB_ONLY_FAQ: WebOnlyFaqEntry[] = [];

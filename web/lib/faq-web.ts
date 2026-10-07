import type { FaqEntry } from '../../shared/faq';

/**
 * Website-only FAQ wording.
 *
 * shared/faq.ts is also read by the mobile app's Help screen, so it is never
 * edited for website copy. Anything the website must say differently, or
 * additionally, lives here and is layered over the shared entries in
 * web/lib/faq.ts. Entries here are web-only: they never reach the app.
 */

/** Replacement answers / statuses for shared entries, keyed by id (web only). */
export const WEB_FAQ_OVERRIDES: Record<string, Partial<Pick<FaqEntry, 'answer' | 'status'>>> = {
  diagnose: {
    answer: [
      'No. {product} is a consumer health-information product. It helps you keep your own records together, and is being built to help you understand them. It does not diagnose conditions, prescribe medication, make treatment decisions or replace your doctor.',
      'Always talk to a qualified healthcare professional about symptoms, results or treatment.',
    ],
  },
  'what-can-i-do': {
    answer: [
      '{product} is built around five steps: Capture, Understand, Remember, Compare and Ask.',
      'Today you can sign in, add health reports — as a PDF, or as photos and scans saved as a PDF — and keep them together in private storage, where you can open the originals at any time.',
      'Reading your reports, building your health timeline, showing what changed and answering questions from your records are being built next. Until they are ready, the app tells you so instead of showing made-up results.',
    ],
  },
  'file-types': {
    answer: [
      'Today: PDF reports, photos of paper reports (taken with your camera or chosen from your photos) and multi-page scans, up to 20 MB each. Photos and scans are saved as a PDF of the pages, exactly as captured — nothing is read from them yet.',
      'Adding records by WhatsApp or typing them in by hand is not available yet.',
    ],
  },
  'who-can-see': {
    answer: [
      'Each account’s records can be read only by that account: database rules deny access by default and allow it only for the account that owns the data. The app never holds server credentials.',
    ],
  },
  'need-whatsapp': {
    answer: ['No. You add reports directly in the app. WhatsApp is planned as an optional convenience; it is not available yet.'],
    status: 'planned',
  },
};

/** Web-only entries (never shown in the app). */
export const WEB_ONLY_FAQ: FaqEntry[] = [
  {
    id: 'connect-history',
    category: 'how-it-works',
    question: 'How does {product} connect information across my health history?',
    answer: [
      '{product} is designed to keep each record’s dates, results and documents connected, so a result sits next to the ones that came before it and links back to its source document.',
      'That depends on your reports being read, which is not available in the current version. Today your reports are kept together in private storage.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: false,
    sortOrder: 22,
  },
  {
    id: 'get-started',
    category: 'getting-started',
    question: 'How do I get started?',
    answer: [
      '{product} is not in the App Store or Google Play yet — store links will appear on this website at launch.',
      'Once you have the app: sign in, tap Add, and upload a PDF or photograph a paper report. Your originals are kept together in private storage.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: false,
    sortOrder: 128,
  },
];

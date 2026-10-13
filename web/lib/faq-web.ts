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
 *   development — built into the app, but not yet verified for release
 *   partial     — a limited version works today; the answer says which part
 *   planned     — not built yet
 *   preview     — a preview screen exists; the real service is not live
 * Nothing is labelled "available today": that needs a verified production
 * release, and the app is not in the app stores yet.
 */
export type WebFaqStatus = 'development' | 'partial' | 'planned' | 'preview';

export const WEB_STATUS_LABELS: Record<WebFaqStatus, string> = {
  development: 'In development',
  partial: 'Partly available',
  planned: 'Planned',
  preview: 'Preview only',
};

type Override = Partial<Pick<FaqEntry, 'answer'>> & { status?: WebFaqStatus };

/** A web-only entry: same shape as a shared one, with the website's own statuses. */
export type WebOnlyFaqEntry = Omit<FaqEntry, 'status'> & { status?: WebFaqStatus };

const helpAnswer = LINKS.contactEmail
  ? `Start with these questions. For anything else, email ${LINKS.contactEmail}. Please do not email health records or other personal health information.`
  : 'Start with these questions. Contact details will be published on this website soon.';

/** Replacement answers / statuses for shared entries, keyed by id (web only). */
export const WEB_FAQ_OVERRIDES: Record<string, Override> = {
  diagnose: {
    answer: [
      'No. {product} is a consumer health-information product. It helps you keep your own records together, and is being built to help you understand them. It does not diagnose conditions, prescribe medication, make treatment decisions or replace your doctor.',
      'Always talk to a qualified healthcare professional about symptoms, results or treatment.',
    ],
  },
  'what-can-i-do': {
    status: 'partial',
    answer: [
      '{product} is built around five steps: Capture, Understand, Remember, Compare and Ask.',
      'In the app you can sign in, add health reports — as a PDF, or as photos and scans saved as a PDF — and keep them together in private storage, where you can open the originals at any time.',
      'Reading your reports, your timeline, what changed, trends, medications and Ask My Health are built into the app and are in development: still being tested and prepared for release. Until they are live in your version, the app says so instead of showing made-up results.',
    ],
  },
  'file-types': {
    status: 'partial',
    answer: [
      'PDF reports, photos of paper reports (taken with your camera or chosen from your photos) and multi-page scans, up to 20 MB each. Photos and scans are saved as a PDF of the pages, exactly as captured.',
      'Reading what is in them is in development. Adding records by WhatsApp or typing them in by hand is not available.',
    ],
  },
  'understand-reports': {
    status: 'development',
    answer: [
      'Reading your reports — picking out values, dates and results, each with the page and wording it came from — is built into the app and is being tested before release. It is not yet available to everyone.',
      'Reading uses an AI service and only runs with your permission, which you can switch off in the app. Until it is live, reports you add are kept safely and you can open them, and nothing from a file is added to your health history.',
    ],
  },
  'what-changed': {
    status: 'development',
    answer: [
      '{product} is designed to compare new results with your own earlier records, so you can see what went up, what went down and what stayed the same — with a link back to each source document.',
      'Timelines, trends and What Changed are built into the app and are in development. They depend on your reports being read, so they are not yet available to everyone.',
    ],
  },
  ask: {
    status: 'development',
    answer: [
      'Ask My Health is designed to answer plain-language questions only from your own records and to show the records each answer is based on. It will not answer questions that ask for a diagnosis or treatment.',
      'It is built into the app and is in development. It depends on your reports being read, and it is not yet available to everyone.',
    ],
  },
  'how-ai-works': {
    status: 'development',
    answer: [
      'AI is meant to help you understand and organize your own health history — reading reports, comparing results across time and answering questions from your records. These features are built into the app and are in development, not yet available to everyone.',
      'They are designed to use a third-party AI service, and only with your permission. Your name, email, phone number and date of birth are not sent, but personal details printed inside a report are not removed. What your records say and what AI says about them are shown separately, with a link to the source.',
      'AI can make mistakes. AI-generated information is not a medical diagnosis or medical advice.',
    ],
  },
  'who-can-see': {
    answer: [
      'Each account’s records can be read only by that account: database rules deny access by default and allow it only for the account that owns the data. The app never holds server credentials.',
    ],
  },
  'need-whatsapp': {
    status: 'planned',
    answer: ['No. You add reports directly in the app. WhatsApp is planned as an optional convenience; it is not available.'],
  },
  delete: {
    status: 'development',
    answer: [
      'Deleting a report removes the original file and the information read from it. It is built into the app and is in development.',
      'Deleting your whole account and the data linked to it is planned and not available. If you try it in the app, the app says so and your data is not changed.',
    ],
  },
  export: {
    status: 'planned',
    answer: [
      'Download My Data — getting a copy of everything stored in your health history — is planned. It appears on the app’s Privacy screen but is not available.',
    ],
  },
  help: {
    answer: [helpAnswer],
  },
};

/** Web-only entries (never shown in the app). */
export const WEB_ONLY_FAQ: WebOnlyFaqEntry[] = [
  {
    id: 'connect-history',
    category: 'how-it-works',
    question: 'How does {product} connect information across my health history?',
    answer: [
      '{product} is designed to keep each record’s dates, results and documents connected, so a result sits next to the ones that came before it and links back to its source document.',
      'That depends on your reports being read, which is in development. Today your reports are kept together in private storage.',
    ],
    status: 'development',
    webVisible: true,
    mobileVisible: false,
    sortOrder: 22,
  },
  {
    id: 'correct-results',
    category: 'health-records',
    question: 'Can I correct what the app reads from a report?',
    answer: [
      'That is the design: each result read from a report shows the page it came from, and you can confirm it, or correct it with a reason, while the original reading stays on record.',
      'It is built into the app and is in development. It depends on your reports being read, and it is not yet available to everyone.',
    ],
    status: 'development',
    webVisible: true,
    mobileVisible: false,
    sortOrder: 41,
  },
  {
    id: 'get-started',
    category: 'getting-started',
    question: 'How do I get started?',
    answer: [
      '{product} is not in the App Store or Google Play yet — store links will appear on this website when it is.',
      'Once you have the app: sign in with a method its sign-in screen offers, tap Add, and upload a PDF or photograph a paper report. Your originals are kept together in private storage.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: false,
    sortOrder: 128,
  },
];

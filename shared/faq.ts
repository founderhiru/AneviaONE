/**
 * FAQ CONTENT — the single source of truth for the website FAQ (/faq) and the
 * mobile app's Help & FAQ screen (Me → Help & FAQ).
 *
 * Pure data, no imports, so both the Next.js site and the Expo app can consume
 * it. Presentation is platform-specific; the words live only here.
 *
 * Brand: never write the product name in this file. Use the `{product}` token;
 * each platform replaces it with its own central brand config
 * (web/lib/config.ts → BRAND.name, mobile/config/brand.ts → BRAND.productName).
 *
 * Content rules (keep every answer honest to the CURRENT product):
 *   - Say clearly what works today, what is planned, and what the product
 *     does NOT do. Mark planned or partial capabilities with `status`.
 *   - Never imply diagnosis, prescribing, treatment decisions, emergency care
 *     or replacing a doctor.
 *   - No security, encryption or compliance claim that the implementation and
 *     existing docs (docs/MOBILE_PHASE1_INTEGRATION.md, supabase/migrations)
 *     don't back up. No invented contact details.
 *   - Keep answers short: one to three short paragraphs.
 */

export const PRODUCT_TOKEN = '{product}';

export type FaqCategoryId =
  | 'about'
  | 'how-it-works'
  | 'health-records'
  | 'ai'
  | 'privacy-security'
  | 'whatsapp'
  | 'account-data'
  | 'getting-started';

export type FaqCategory = {
  id: FaqCategoryId;
  /** May contain the `{product}` token. */
  label: string;
};

/**
 * `planned`  — designed and on the roadmap, not in the current version.
 * `partial`  — some of it works today; the answer says exactly which part.
 * `preview`  — a preview screen exists, but the real service isn't live.
 * Omit when the answer describes something that is true today.
 */
export type FaqStatus = 'planned' | 'partial' | 'preview';

export type FaqEntry = {
  id: string;
  category: FaqCategoryId;
  question: string;
  /** Short paragraphs. May contain the `{product}` token. */
  answer: string[];
  status?: FaqStatus;
  webVisible: boolean;
  mobileVisible: boolean;
  /** Global order. Web sorts within each category; mobile shows a flat list. */
  sortOrder: number;
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: 'about', label: 'About {product}' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'health-records', label: 'Health records' },
  { id: 'ai', label: 'AI & health intelligence' },
  { id: 'privacy-security', label: 'Privacy & security' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'account-data', label: 'Account & data' },
  { id: 'getting-started', label: 'Getting started' },
];

export const FAQ_STATUS_LABELS: Record<FaqStatus, string> = {
  planned: 'Not yet available',
  partial: 'Partly available',
  preview: 'Preview only',
};

export const FAQ_ENTRIES: FaqEntry[] = [
  // ── About ────────────────────────────────────────────────────────────────
  {
    id: 'what-is',
    category: 'about',
    question: 'What is {product}?',
    answer: [
      '{product} is a Personal Health Intelligence app. It is designed to bring your health records, reports and changes together into one connected health history — so you can understand your health across time, not one report at a time.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 10,
  },
  {
    id: 'not-a-locker',
    category: 'about',
    question: 'Is {product} just a place to store medical records?',
    answer: [
      'No. Storing documents is the starting point, not the goal. {product} is being built to turn scattered records into a structured, longitudinal health history that you can follow over time, compare and ask questions about.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 15,
  },
  {
    id: 'diagnose',
    category: 'about',
    question: 'Does {product} diagnose or treat medical conditions?',
    answer: [
      'No. {product} is a consumer health-information product. It helps you organize and understand your own records. It does not diagnose conditions, prescribe medication, make treatment decisions or replace your doctor.',
      'Always talk to a qualified healthcare professional about symptoms, results or treatment.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 70,
  },
  {
    id: 'emergency',
    category: 'about',
    question: 'Can I use {product} in a medical emergency?',
    answer: [
      'No. {product} is not an emergency or urgent-care service, and nothing in the app is monitored by clinicians. If you think you may have a medical emergency, contact your local emergency number or go to the nearest emergency department.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 75,
  },

  // ── How it works ─────────────────────────────────────────────────────────
  {
    id: 'what-can-i-do',
    category: 'how-it-works',
    question: 'What can I do with {product}?',
    answer: [
      '{product} is built around five steps: Capture, Remember, Understand, Compare and Ask.',
      'Today you can sign in, add PDF health reports and keep them together in private storage, where you can open the originals at any time.',
      'Reading your reports, building your health timeline, showing what changed and answering questions from your records are being built next. Until they are ready, the app tells you so instead of showing made-up results.',
    ],
    status: 'partial',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 20,
  },
  {
    id: 'sample-screens',
    category: 'how-it-works',
    question: 'Are the screens on this website real results?',
    answer: [
      'No. Screens, charts and answers shown on the website use sample data to illustrate how {product} is designed to work. They are not real people’s records, and some of the features they show are not available yet.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 25,
  },

  // ── Health records ───────────────────────────────────────────────────────
  {
    id: 'storage',
    category: 'health-records',
    question: 'How are my health records stored?',
    answer: [
      'When you add a report, the original file is uploaded to private storage linked to your account. The database denies access by default and allows it only for the account that owns the record.',
      'Documents never get a public link. When you open an original, the app uses a short-lived link that expires after about a minute.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 30,
  },
  {
    id: 'file-types',
    category: 'health-records',
    question: 'What kinds of files can I add?',
    answer: [
      'Currently, PDF reports up to 20 MB. Scanning paper documents with your camera and adding photos are planned, but not available yet.',
    ],
    status: 'partial',
    webVisible: true,
    mobileVisible: false,
    sortOrder: 35,
  },
  {
    id: 'understand-reports',
    category: 'health-records',
    question: 'Can {product} understand my reports?',
    answer: [
      'Reading your reports — picking out values, dates and results and adding them to your health history — is at the core of what {product} is being built to do, but it is not available in the current version.',
      'For now, reports you upload are stored safely and you can open them, but nothing from a file is added to your health history yet. The app tells you this after each upload.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 40,
  },
  {
    id: 'family',
    category: 'health-records',
    question: 'Can I keep records for my family?',
    answer: ['Not yet. Family Health — keeping track of parents, children and dependents — is planned.'],
    status: 'planned',
    webVisible: true,
    mobileVisible: false,
    sortOrder: 45,
  },

  // ── AI & health intelligence ─────────────────────────────────────────────
  {
    id: 'what-changed',
    category: 'ai',
    question: 'Can I see what changed over time?',
    answer: [
      '{product} is designed to compare new results with your own earlier records, so you can see what went up, what went down and what stayed the same — with a link back to each source document.',
      'Timelines, trends and What Changed depend on your reports being read, so they are not available in the current version yet.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 50,
  },
  {
    id: 'ask',
    category: 'ai',
    question: 'Can I ask questions about my health history?',
    answer: [
      'Ask My Health is designed to answer plain-language questions from your own records and to show the documents each answer is based on.',
      'It is not available in the current version. It will only answer once your reports can be read — until then, the Ask screen explains this rather than guessing.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 60,
  },
  {
    id: 'how-ai-works',
    category: 'ai',
    question: 'How does AI work in {product}?',
    answer: [
      'AI is meant to help you understand and organize your own health history — reading reports, comparing results across time and explaining terms in plain language. These features are being introduced in stages and are not active in the current version.',
      'What your records say and what AI says about them are always shown separately, with a link to the source so you can check it.',
      'AI can make mistakes. AI-generated information is not a medical diagnosis or medical advice.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 80,
  },
  {
    id: 'rely-on-ai',
    category: 'ai',
    question: 'Can I rely on AI explanations to make health decisions?',
    answer: [
      'No. Treat them as help reading your own records. They can be wrong, and they are not a substitute for a healthcare professional. Check the original record, and talk to your doctor about any health decision.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 85,
  },
  {
    id: 'own-records',
    category: 'ai',
    question: 'Where do insights and answers come from?',
    answer: [
      'From your own records — not from assumptions about people in general. Each insight is designed to point back to the documents behind it.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 86,
  },

  // ── Privacy & security ───────────────────────────────────────────────────
  {
    id: 'private',
    category: 'privacy-security',
    question: 'Is my health information private?',
    answer: [
      '{product} is private by design. Each account can see only its own records, documents are kept in private storage with no public links, and sharing with anyone else — such as a doctor — is your choice. Sharing is off, and it cannot be switched on in the current version.',
      'On your phone, your sign-in session is kept in the device’s secure storage (Keychain on iPhone, Keystore on Android).',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 90,
  },
  {
    id: 'who-can-see',
    category: 'privacy-security',
    question: 'Who can see my records?',
    answer: [
      'Only your account. Database rules deny access by default and allow it only for the account that owns the data. Background work on the server uses separate credentials that are never included in the app.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 95,
  },
  {
    id: 'certification',
    category: 'privacy-security',
    question: 'Is {product} certified or compliant with health-data regulations?',
    answer: [
      '{product} does not currently claim any security certification or regulatory compliance label. If that changes, we will say exactly what we hold, what it covers and how it was verified.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 96,
  },

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  {
    id: 'whatsapp',
    category: 'whatsapp',
    question: 'How does WhatsApp work with {product}?',
    answer: [
      'WhatsApp is planned as a convenient way to send reports in and receive simple updates — a capture and conversation layer. Your detailed health history stays in the {product} app, not in WhatsApp, and messages sent back to you stay generic, without health details.',
      'WhatsApp is not live yet. The app includes a preview of the connection screen, but it does not send or receive real WhatsApp messages in the current version.',
    ],
    status: 'preview',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 100,
  },
  {
    id: 'need-whatsapp',
    category: 'whatsapp',
    question: 'Do I need WhatsApp to use {product}?',
    answer: ['No. You can add reports directly in the app. WhatsApp is an optional convenience.'],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 105,
  },

  // ── Account & data ───────────────────────────────────────────────────────
  {
    id: 'delete',
    category: 'account-data',
    question: 'Can I delete my data?',
    answer: [
      'Deleting your account and the data linked to it is part of the Privacy & Security screen in the app, but it is not available in the current version yet. If you try it, the app says so and your data is not changed.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 110,
  },
  {
    id: 'export',
    category: 'account-data',
    question: 'Can I export my data?',
    answer: [
      'Download My Data — getting a copy of everything stored in your health history — is planned and appears on the Privacy & Security screen, but it is not available in the current version yet.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 120,
  },

  // ── Getting started ──────────────────────────────────────────────────────
  {
    id: 'platforms',
    category: 'getting-started',
    question: 'Is {product} available on iPhone and Android?',
    answer: [
      '{product} is being built for both iPhone and Android. It is not in the App Store or Google Play yet — store links will appear on the {product} website at launch.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 130,
  },
  {
    id: 'cost',
    category: 'getting-started',
    question: 'What will {product} cost?',
    answer: ['Pricing has not been announced yet.'],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 135,
  },
  {
    id: 'help',
    category: 'getting-started',
    question: 'How do I get help?',
    answer: [
      'Start with these questions — in the app, they are under Me → Help & FAQ. A dedicated support contact is not available yet; contact details will be published on the {product} website at launch.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 140,
  },
];

/** Replaces every `{product}` token with the platform's brand name. */
export function withProduct(text: string, productName: string): string {
  return text.split(PRODUCT_TOKEN).join(productName);
}

export type ResolvedFaqEntry = Omit<FaqEntry, 'question' | 'answer'> & {
  question: string;
  answer: string[];
  statusLabel?: string;
};

/** Entries for one platform, in sortOrder, with the brand name filled in. */
export function faqForPlatform(platform: 'web' | 'mobile', productName: string): ResolvedFaqEntry[] {
  return FAQ_ENTRIES.filter((e) => (platform === 'web' ? e.webVisible : e.mobileVisible))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((e) => ({
      ...e,
      question: withProduct(e.question, productName),
      answer: e.answer.map((p) => withProduct(p, productName)),
      statusLabel: e.status ? FAQ_STATUS_LABELS[e.status] : undefined,
    }));
}

/** Categories with the brand name filled in. */
export function faqCategories(productName: string): FaqCategory[] {
  return FAQ_CATEGORIES.map((c) => ({ ...c, label: withProduct(c.label, productName) }));
}

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
 * `planned`  — on the roadmap, not in the current version.
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
      '{product} is a Personal Health Intelligence app. It brings your health reports together into one connected health history, so you can understand your health across time, not one report at a time.',
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
      'No. Storing your reports is the starting point. {product} reads them, builds a timeline of your results, shows what changed between reports, and prepares a one-page summary you can show or send to your Doctor.',
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
      'No. {product} is a consumer health-information product. It helps you organize and understand your own records. It does not diagnose conditions, prescribe medication, make treatment decisions or replace your Doctor.',
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
      '{product} follows five steps: Capture, Understand, Remember, Compare and Share.',
      'Add a health report as a PDF, a photo or a scan. With your permission, the app reads it and adds the results to your health history. Home shows your latest results and what changed, Timeline and Health keep everything in order, and For Doctor turns it all into a one-page summary you can show or send before a visit.',
      'Every result links back to the report it came from, so you can always check it.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 20,
  },
  {
    id: 'sample-screens',
    category: 'how-it-works',
    question: 'Are the screens on this website real results?',
    answer: [
      'No. Screens, charts and results shown on the website use sample data to illustrate how {product} works. They are not real people’s records.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 25,
  },
  {
    id: 'doctor-summary',
    category: 'how-it-works',
    question: 'What is For Doctor?',
    answer: [
      'For Doctor is a one-page summary of your own reports, ready for a visit: your name, the results that fall outside the range printed on their report, how repeated tests have changed, and the medications, conditions and allergies written on your reports.',
      'Tap “Show to Doctor” for a large, easy-to-read view you can hold up in the consultation, or “Send PDF” to share it. It is built only from what your reports say, with no AI interpretation, and results still waiting for your check are left out.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 22,
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
      'PDF reports, photos of paper reports (taken with your camera or chosen from your photos) and multi-page scans, up to 20 MB each. Photos and scans are saved as a PDF of the pages, exactly as captured.',
      'You can also open a PDF in another app, such as WhatsApp, Gmail or Files, tap Share and choose {product}. Typing records in by hand is not available.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 35,
  },
  {
    id: 'understand-reports',
    category: 'health-records',
    question: 'Can {product} understand my reports?',
    answer: [
      'Yes, with your permission. {product} reads each report and picks out the values, dates, units and the range printed on the report, each linked to the page it came from. It handles blood and urine tests, other lab reports and imaging reports such as X-rays.',
      'Reading uses a third-party AI service and only runs if you have allowed it (Me → Privacy & Security). If a report appears to belong to someone else, the app declines it.',
      'AI can make mistakes. Check important results against the original report.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 40,
  },
  {
    id: 'verify',
    category: 'health-records',
    question: 'What does “Reports to verify” mean?',
    answer: [
      'When the app is not sure it read something correctly — for example a blurred value or an unclear date — it holds that result back instead of guessing. Held results are not counted in your history, and are left out of the For Doctor summary, until you confirm or reject them.',
      'Tap “Reports to verify” on Home to see each one next to its source and decide.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 41,
  },
  {
    id: 'correct-results',
    category: 'health-records',
    question: 'Can I correct what the app reads from a report?',
    answer: [
      'Yes. Each result shows the page it came from. You can confirm it, or correct it, while the original reading stays on record.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 42,
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
      'Yes. When the same test appears in more than one report, {product} shows what went up, what went down and what stayed the same, with the dates, and links back to each source report.',
      'Home highlights what changed, Timeline lists your reports in date order, and Health shows each result with the range printed on its report.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 50,
  },
  {
    id: 'no-questions',
    category: 'ai',
    question: 'Can I ask the app health questions?',
    answer: [
      'No. {product} does not answer health questions or give medical advice. It shows what is written on your reports and how your results have changed.',
      'For questions about your results, ask your Doctor. The For Doctor summary is there to make that conversation easier.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 60,
  },
  {
    id: 'how-ai-works',
    category: 'ai',
    question: 'How does AI work in {product}?',
    answer: [
      'AI is used for one job: reading your reports, to pick out the values, dates and results written on them. It uses a third-party AI service, and only if you have allowed it. Your name, email, phone number and date of birth are not sent, but personal details printed inside a report are not removed.',
      'What your reports say is always shown separately from anything else, with a link to the source so you can check it. The For Doctor summary is built from stored results, without AI.',
      'AI can make mistakes. Nothing in the app is a medical diagnosis or medical advice.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 80,
  },
  {
    id: 'rely-on-ai',
    category: 'ai',
    question: 'Can I rely on what the app reads to make health decisions?',
    answer: [
      'No. Treat it as help organizing your own records. A reading can be wrong, and it is not a substitute for a healthcare professional. Check the original report, and talk to your Doctor about any health decision.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 85,
  },
  {
    id: 'own-records',
    category: 'ai',
    question: 'Where do results and comparisons come from?',
    answer: [
      'From your own reports, as written on them. Ranges are the ones printed on each report, not general assumptions about people. Each result points back to the report behind it.',
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
      '{product} is private by design. Each account can see only its own records, and documents are kept in private storage with no public links. Nothing is shared with anyone else unless you choose to: the For Doctor summary is only shown or sent when you tap to do so.',
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
    question: 'Can I add reports from WhatsApp or email?',
    answer: [
      'Yes, by sharing. Open the report PDF in WhatsApp, Gmail or Files, tap Share and choose {product}. The app opens and starts adding it.',
      'A WhatsApp chat connection — sending reports to a {product} number — and forwarding by email are not available.',
    ],
    status: 'partial',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 100,
  },
  {
    id: 'need-whatsapp',
    category: 'whatsapp',
    question: 'Do I need WhatsApp to use {product}?',
    answer: ['No. You can add reports directly in the app. WhatsApp is just one place you can share from.'],
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
      'Yes. To delete one report, open it in My documents and delete it: the original file and the results read from it are removed.',
      'To delete everything, go to Me → Privacy & Security → Delete account. This permanently removes your account, your reports and their files, and your results, and it cannot be undone.',
    ],
    webVisible: true,
    mobileVisible: true,
    sortOrder: 110,
  },
  {
    id: 'export',
    category: 'account-data',
    question: 'Can I export my data?',
    answer: [
      'Downloading a copy of everything in your health history is not available yet. You can send a PDF summary of your results from For Doctor, and you can open and share your original reports at any time.',
    ],
    status: 'planned',
    webVisible: true,
    mobileVisible: true,
    sortOrder: 120,
  },

  // ── Getting started ──────────────────────────────────────────────────────
  {
    id: 'get-started',
    category: 'getting-started',
    question: 'How do I get started?',
    answer: [
      'Sign in with a method the app’s sign-in screen offers, tap Add, and upload a PDF or photograph a paper report. Allow report reading when asked, and your results appear on Home.',
    ],
    webVisible: true,
    mobileVisible: false,
    sortOrder: 128,
  },
  {
    id: 'platforms',
    category: 'getting-started',
    question: 'Is {product} available on iPhone and Android?',
    answer: [
      '{product} is launching on iPhone first, with Android to follow. Official App Store and Google Play links will appear on the {product} website as soon as they are live.',
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
      'Start with these questions. In the app, they are under Me → Help & FAQ. For anything else, use the contact details on the {product} website. Please do not send health records or other personal health information.',
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

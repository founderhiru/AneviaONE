import type { ChapterVisualKey } from '@/components/ChapterVisual';
import type { IconName } from '@/components/Icon';
import { BRAND, STORES_LIVE } from '@/lib/config';
import { withProduct } from '../../shared/faq';
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_UPDATED } from '../../shared/terms';

/**
 * Content for the secondary pages, as data. `ContentPage` renders these.
 *
 * Copy rules (see the brief): consumer health-INFORMATION product — never
 * diagnosis/treatment/prevention/clinical-accuracy claims, and no security or
 * compliance claims the implementation can't back. Where something is not live
 * yet, the page says so.
 */

/** Soft semantic tint for an item's icon. */
export type Tone = 'blue' | 'teal' | 'lavender' | 'cream' | 'mint';

export type Item = { icon: IconName; title: string; text: string; tone: Tone };

export type Row = { id?: string; title: string; text?: string };

export type Chapter = {
  id: string;
  title: string;
  /** One-sentence headline under the title. */
  lead: string;
  paragraphs: string[];
  points?: string[];
  visual: ChapterVisualKey;
};

export type Block =
  | { type: 'cards'; id?: string; eyebrow?: string; title: string; intro?: string; columns?: 2 | 3 | 4; items: Item[] }
  | {
      type: 'split';
      id?: string;
      eyebrow?: string;
      title: string;
      paragraphs: string[];
      points?: string[];
      card?: 'trend' | 'change' | 'pattern';
      reverse?: boolean;
    }
  /** Editorial list: thin rules, large type, optional anchor ids per row. */
  | { type: 'rows'; id?: string; eyebrow?: string; title: string; intro?: string; numbered?: boolean; items: Row[] }
  /** Alternating copy + visual chapters; numbered for a sequence, plain for concepts. */
  | { type: 'chapters'; numbered?: boolean; items: Chapter[] }
  | { type: 'prose'; id?: string; eyebrow?: string; title: string; paragraphs: string[]; bullets?: string[] }
  | { type: 'notice'; id?: string; tone: 'info' | 'draft'; title: string; text: string; link?: { label: string; href: string } }
  | { type: 'contact' };

export type PageDef = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  accent?: string;
  lede: string;
  blocks: Block[];
  /** Closing call to action (defaults to download). */
  closing?: 'download' | 'contact' | 'none';
};

export const PAGES: Record<string, PageDef> = {
  product: {
    slug: 'product',
    title: 'Product',
    description:
      `What ${BRAND.name} does: Health Memory, Timeline, What Changed, Trends and a one-page summary for your Doctor — built on one connected history.`,
    eyebrow: 'Product',
    headline: 'One intelligent',
    accent: 'health history.',
    lede: `${BRAND.name} turns scattered reports into a connected health history — so you can see trends, spot what changed and walk into a visit with one clear page for your Doctor.`,
    blocks: [
      {
        type: 'rows',
        id: 'features',
        eyebrow: 'Inside the app',
        title: 'What it does.',
        intro: `Each part of ${BRAND.name} builds on the same connected history. Add a report as a PDF, a photo or a scan; with your permission the app reads it, and everything below is built from what is written on your reports.`,
        items: [
          { id: 'memory', title: 'Health Memory', text: 'Add reports as a PDF, a photo or a scan, or share a PDF to the app from WhatsApp, Gmail or Files. The originals are kept together in private storage, and each result read from a report is linked to the page it came from.' },
          { id: 'timeline', title: 'Timeline', text: 'Your health story over time — every report placed where it belongs, from your earliest to your latest.' },
          { id: 'changes', title: 'What Changed', text: 'See what went up, what went down and what stayed the same between reports, with the dates, and the range printed on each report.' },
          { id: 'doctor', title: 'For Doctor', text: 'A one-page summary for your visit: the results outside the range printed on their report, how repeated tests have changed, and the medications, conditions and allergies written on your reports. Show it on screen in large type, or send it as a PDF.' },
          { id: 'trends', title: 'Trends', text: 'A view of key measures across months and years, so you see direction, not just one result.' },
          { id: 'medications', title: 'Medications', text: 'The medications, conditions and allergies written on your reports, kept alongside the reports they came from.' },
          { id: 'corrections', title: 'Review & correct', text: 'When the app is not sure it read something correctly, it holds the result back for you to check against its source. You can confirm or correct it, and the original reading stays on record.' },
        ],
      },
      {
        type: 'rows',
        id: 'use-cases',
        eyebrow: 'Use cases',
        title: 'Built for real moments.',
        items: [
          { title: 'Understand your own history', text: 'See how a measure you care about has moved across years, in one place, without digging through folders and chats.' },
          { title: 'Make sense of a new report', text: 'See a new result next to the ones that came before it, with the range printed on the report.' },
          { title: 'Prepare for an appointment', text: 'Open For Doctor before a visit. Show the summary on your phone, or send it as a PDF, so the conversation starts from the full picture.' },
          { title: 'Keep family records (planned)', text: 'Family health — parents, children and dependents in one place — is planned. It is not available yet.' },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: `What ${BRAND.name} is — and isn’t`,
        text: `${BRAND.name} is a consumer health-information product. It helps you keep your own records together and understand how they change. It does not diagnose, treat or replace your Doctor, and it does not answer health questions.`,
        link: { label: 'Read the FAQ', href: '/faq' },
      },
    ],
  },

  'how-it-works': {
    slug: 'how-it-works',
    title: 'How It Works',
    description: 'The five stages from scattered records to a summary for your Doctor: capture, understand, remember, compare and share.',
    eyebrow: 'How it works',
    headline: 'From records to',
    accent: 'understanding.',
    lede: 'Five stages take you from a scattered pile of documents to a health history you can actually use — and a page you can hand to your Doctor.',
    blocks: [
      {
        type: 'chapters',
        numbered: true,
        items: [
          {
            id: 'capture',
            title: 'Capture',
            lead: 'Bring your health records together.',
            paragraphs: ['Add a report in the app. Every record starts as a document you already have — nothing needs retyping.'],
            points: ['Upload a PDF, take a photo, choose photos or scan a paper report in the app. Photos and scans are saved as a PDF of the pages.', 'Or open a PDF in WhatsApp, Gmail or Files, tap Share and choose the app.', 'Your original document is kept, so there is always a source to check.'],
            visual: 'capture',
          },
          {
            id: 'understand',
            title: 'Understand',
            lead: 'Extract and organize relevant information.',
            paragraphs: ['The app reads your reports and turns them into structured health information: dates, results, units and the range printed on the report.'],
            points: ['Each result is linked to the page and wording it came from.', 'Reading uses an AI service, and only runs with your permission. Results the app is unsure about are held for you to review, correct or confirm.', 'If a report appears to belong to someone else, the app declines it.'],
            visual: 'understand',
          },
          {
            id: 'remember',
            title: 'Remember',
            lead: 'Build your longitudinal health history.',
            paragraphs: ['Each report becomes part of one history that grows with you.'],
            points: ['Each record is placed on your timeline.', 'The same test is connected across documents and years.', 'The reports you add are kept together in private storage.'],
            visual: 'remember',
          },
          {
            id: 'compare',
            title: 'Compare',
            lead: 'See meaningful changes across months and years.',
            paragraphs: ['Read the present against your own past.'],
            points: ['Trends show direction over time for key measures.', 'What Changed compares your latest results with the ones before them.', 'Ranges are the ones printed on each report.'],
            visual: 'compare',
          },
          {
            id: 'share',
            title: 'Share',
            lead: 'Walk into the visit with one clear page.',
            paragraphs: ['For Doctor turns your history into a one-page summary, built only from your reports.'],
            points: ['Show it on your phone in large type, or send it as a PDF.', 'Results still waiting for your check are left out.', `${BRAND.name} explains and organizes — it does not diagnose or advise on treatment.`],
            visual: 'doctor',
          },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'About the examples',
        text: 'Illustrated with sample data. The FAQ answers common questions about each stage.',
        link: { label: 'See the FAQ', href: '/faq' },
      },
    ],
  },

  'ai-intelligence': {
    slug: 'ai-intelligence',
    title: 'Intelligence',
    description: `How ${BRAND.name} turns separate records into something you can understand: structure, evidence, time and a summary for your Doctor.`,
    eyebrow: 'Intelligence',
    headline: 'Your history,',
    accent: 'made understandable.',
    lede: `One report tells you about a day. The intelligence layer is how ${BRAND.name} turns many reports into something you can understand — with the evidence always in view.`,
    blocks: [
      {
        type: 'chapters',
        items: [
          {
            id: 'memory',
            title: 'Health Memory',
            lead: 'Structured, longitudinal history.',
            paragraphs: [`A result is most useful next to the results that came before it. ${BRAND.name} keeps measures, dates and documents connected, so your history reads as one record rather than a folder of files.`],
            visual: 'memory',
          },
          {
            id: 'evidence',
            title: 'Evidence',
            lead: 'Results grounded in your records.',
            paragraphs: ['Every result is drawn from your own documents, with the source shown alongside it so you can open the original and check.', 'What your record says is kept separate from anything else, and results the app is unsure about are held for your review.'],
            visual: 'evidence',
          },
          {
            id: 'time',
            title: 'Time',
            lead: 'Comparisons across dates.',
            paragraphs: ['A single result is a moment. A trend is a story. Readings are lined up across months and years so the direction — and the dates behind it — are easy to see.'],
            visual: 'time',
          },
          {
            id: 'share',
            title: 'Share',
            lead: 'One page for your Doctor.',
            paragraphs: ['For Doctor gathers the results outside their printed range, the changes over time, and the medications, conditions and allergies written on your reports into one page you can show or send.', `It is built from stored results without AI interpretation. AI can make mistakes when reading a document, which is why sources are shown, and why ${BRAND.name} is not a substitute for professional medical advice.`],
            visual: 'doctor',
          },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'About the examples',
        text: 'Illustrated with sample data. The FAQ explains how AI is used and what it is not used for.',
        link: { label: 'See the FAQ', href: '/faq' },
      },
    ],
  },

  privacy: {
    slug: 'privacy',
    title: 'Privacy',
    description: `Private by design, transparent by default: how ${BRAND.name} approaches your health information.`,
    eyebrow: 'Privacy',
    headline: 'Your health is',
    accent: 'yours.',
    lede: `Private by design. Transparent by default. Here is how ${BRAND.name} approaches your health information.`,
    blocks: [
      {
        type: 'notice',
        tone: 'info',
        title: 'In plain language',
        text: `This page explains how ${BRAND.name} handles your health information, and which controls you have. It describes the app as it works today.`,
      },
      {
        type: 'cards',
        id: 'approach',
        eyebrow: 'Our approach',
        title: 'Privacy by design.',
        columns: 2,
        items: [
          { icon: 'shield', tone: 'blue', title: 'Your records are yours', text: 'Each account can only see its own records. The database is built to deny access by default and allow it back only for the account that owns the data.' },
          { icon: 'evidence', tone: 'lavender', title: 'Transparent AI', text: 'Reading your reports uses a third-party AI service. Report text, or for scans the document itself, is only sent when you have allowed AI processing, and you can switch that off in the app. Your name, email, phone number and date of birth are not sent, but personal details printed inside a report are not removed. What a report says is shown with its source linked, so you can check it. AI can be wrong.' },
          { icon: 'users', tone: 'cream', title: 'Sharing is your choice', text: 'The app does not share your records with anyone. The For Doctor summary is only shown or sent when you tap to do so, and sharing with a Doctor or anyone else is never the default.' },
          { icon: 'whatsapp', tone: 'mint', title: 'WhatsApp is a doorway, not a vault', text: `You can share a report PDF from WhatsApp into the app. Your health history lives in ${BRAND.name}, not in WhatsApp, and the app does not send health details through WhatsApp.` },
        ],
      },
      {
        type: 'cards',
        id: 'control',
        eyebrow: 'Your control',
        title: 'Access, share, delete.',
        intro: 'The app’s Privacy & Security screen shows these controls.',
        columns: 3,
        items: [
          { icon: 'file', tone: 'blue', title: 'Access', text: 'See and open the reports you have added, and send a PDF summary from For Doctor. Downloading a copy of everything is not available yet.' },
          { icon: 'sliders', tone: 'teal', title: 'Share', text: 'You choose when to show or send your For Doctor summary. The app does not share your records with other people on its own.' },
          { icon: 'lock', tone: 'lavender', title: 'Delete', text: 'Delete a report to remove its original file and the information read from it. Delete your whole account to permanently remove your account, reports, files and results.' },
        ],
      },
    ],
  },

  security: {
    slug: 'security',
    title: 'Security',
    description: `How ${BRAND.name} protects your data, stated factually.`,
    eyebrow: 'Security',
    headline: 'How your data is',
    accent: 'protected.',
    lede: 'We’d rather be specific and modest than impressive and vague. Here is what the product does.',
    blocks: [
      {
        type: 'cards',
        id: 'protection',
        eyebrow: 'Data security',
        title: 'What the design does.',
        columns: 2,
        items: [
          { icon: 'lock', tone: 'blue', title: 'Access limited to your account', text: 'Database rules deny access by default and only allow an account to read and write its own records.' },
          { icon: 'file', tone: 'teal', title: 'Private document storage', text: 'Uploaded documents go to private storage. They are not publicly reachable.' },
          { icon: 'shield', tone: 'lavender', title: 'No server credentials in the app', text: 'The app does not contain server credentials. Server-side processing, such as reading reports, runs on our servers with credentials the app never holds.' },
          { icon: 'evidence', tone: 'cream', title: 'Originals stay as evidence', text: 'Your original documents are stored unchanged and cannot be overwritten. Information read from a report stays linked to the page it came from.' },
        ],
      },
      {
        type: 'prose',
        id: 'compliance',
        eyebrow: 'Compliance',
        title: 'Standards & regulations.',
        paragraphs: [
          `${BRAND.name} does not currently claim any security certification or regulatory compliance label. We won’t describe the product with terms we can’t back up.`,
          'When that changes, this page will state exactly what we hold, what it covers and how it was verified.',
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'Found a security issue?',
        text: 'Please tell us at help@aneviaone.com. Do not include health records or other personal health information in your message.',
      },
    ],
    closing: 'contact',
  },

  about: {
    slug: 'about',
    title: 'About',
    description: `Why we built ${BRAND.name}: to bring scattered health records into one connected history.`,
    eyebrow: 'About',
    headline: 'Healthcare has a',
    accent: 'memory problem.',
    lede: `Your lab has one record. Your Doctor has another. Your hospital has another. ${BRAND.name} brings the history together.`,
    blocks: [
      {
        type: 'prose',
        id: 'mission',
        eyebrow: 'Why we built it',
        title: 'Each record makes sense alone. Together, they tell a story nobody can easily see.',
        paragraphs: [
          'Most of us carry our health history in pieces — a hospital portal here, a PDF there, a prescription photo in a chat.',
          `${BRAND.name} connects those pieces into one history, and helps people understand how their health changes over time — with the evidence always one tap away, and a one-page summary to hand to their Doctor.`,
        ],
      },
      {
        type: 'rows',
        id: 'principles',
        eyebrow: 'What we believe',
        title: 'Principles.',
        numbered: true,
        items: [
          { title: 'Your data should remain understandable.' },
          { title: 'AI should explain, not invent.' },
          { title: 'Every insight should have context.' },
          { title: 'Your health history should remain yours.' },
        ],
      },
    ],
    closing: 'contact',
  },

  contact: {
    slug: 'contact',
    title: 'Contact',
    description: `Get in touch with the ${BRAND.name} team: help, feedback, press or partnerships.`,
    eyebrow: 'Contact',
    headline: 'Get in',
    accent: 'touch.',
    lede: 'Need help, or have feedback, press or partnership questions? Email us and we’ll get back to you.',
    blocks: [{ type: 'contact' }],
    closing: 'none',
  },

  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    description: `${BRAND.name}’s Terms of Service: how the app may be used and what you can expect from it.`,
    eyebrow: 'Legal',
    headline: 'Terms of',
    accent: 'Service.',
    lede: `How ${BRAND.name} may be used, in plain language. Last updated ${TERMS_UPDATED}.`,
    blocks: [
      {
        type: 'prose',
        title: 'Before you start',
        paragraphs: [withProduct(TERMS_INTRO, BRAND.name)],
      },
      ...TERMS_SECTIONS.map((t): Block => ({
        type: 'prose',
        title: withProduct(t.title, BRAND.name),
        paragraphs: t.paragraphs.map((p) => withProduct(p, BRAND.name)),
      })),
    ],
    closing: 'none',
  },

  faq: {
    slug: 'faq',
    title: 'FAQ',
    description: `Straight answers about what ${BRAND.name} does, what it does not do, and how it handles your health information.`,
    eyebrow: 'FAQ',
    headline: 'Questions,',
    accent: 'answered.',
    lede: `Straight answers about what ${BRAND.name} does, what it doesn’t do, and how it handles your health information.`,
    blocks: [],
  },

  download: {
    slug: 'download',
    title: 'Download App',
    description: `Get the ${BRAND.name} app: where it is available and how to sign in.`,
    eyebrow: 'Download App',
    headline: `Get the ${BRAND.name}`,
    accent: 'app.',
    lede: 'Add your health reports on your phone. The app reads them, keeps your results in order, shows what changed and prepares a summary for your Doctor.',
    blocks: [
      {
        type: 'notice',
        id: 'availability',
        tone: 'info',
        title: STORES_LIVE ? 'Available in the app stores' : 'Coming to the App Store and Google Play',
        text: STORES_LIVE
          ? `Download ${BRAND.name} from the App Store or Google Play using the links below.`
          : `${BRAND.name} is launching on iPhone first, with Android to follow. The official App Store and Google Play links will appear on this page as soon as they are live.`,
      },
      {
        type: 'rows',
        id: 'sign-in',
        eyebrow: 'Sign in',
        title: 'Sign-in happens in the app.',
        intro: `Your account lives in the ${BRAND.name} app. There is no web sign-in, and this website never asks for your password or health information. The app’s sign-in screen offers only the methods that are switched on:`,
        items: [
          { title: 'Email', text: 'Get a one-time code sent to your email address.' },
          { title: 'Apple', text: 'Continue with your Apple ID, on iPhones that support it, where enabled.' },
          { title: 'Google', text: 'Continue with your Google account, where enabled.' },
        ],
      },
    ],
  },

  'data-ai-principles': {
    slug: 'data-ai-principles',
    title: 'Data & AI Principles',
    description: `The principles that guide how ${BRAND.name} uses your data and AI.`,
    eyebrow: 'Principles',
    headline: 'Data & AI',
    accent: 'principles.',
    lede: 'Health information is personal. These are the principles we hold ourselves to when building with your records and with AI.',
    blocks: [
      {
        type: 'cards',
        title: 'How we build.',
        columns: 2,
        items: [
          { icon: 'file', tone: 'blue', title: 'Your records are the source of truth', text: 'Results and comparisons come from your own documents — not from guesswork about people in general.' },
          { icon: 'evidence', tone: 'teal', title: 'Show the evidence', text: 'Every insight should point back to the records behind it, so you can check it yourself.' },
          { icon: 'sparkle', tone: 'lavender', title: 'Keep fact and explanation apart', text: 'What your record says is shown with its source, separate from anything else.' },
          { icon: 'shield', tone: 'cream', title: 'Help you understand — never diagnose', text: `${BRAND.name} explains and compares. It does not diagnose, treat or replace your Doctor.` },
          { icon: 'lightbulb', tone: 'mint', title: 'Be honest about uncertainty', text: 'AI can be wrong. When something is unclear, the right answer is to say so.' },
          { icon: 'sliders', tone: 'blue', title: 'You stay in control', text: 'You decide what to add, and you can switch report reading off in the app. You can delete a report or your whole account, and you choose when to show or send your Doctor summary. Downloading a copy of all your data is not available yet.' },
          { icon: 'compass', tone: 'teal', title: 'Say what’s real', text: 'We say what the app does and what it doesn’t. We don’t claim protections or capabilities we can’t back up.' },
        ],
      },
    ],
    closing: 'none',
  },
};

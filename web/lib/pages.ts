import type { ChapterVisualKey } from '@/components/ChapterVisual';
import type { IconName } from '@/components/Icon';
import { BRAND, STORES_LIVE } from '@/lib/config';

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
      card?: 'trend' | 'change' | 'pattern' | 'ask';
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
      `What ${BRAND.name} is designed to do: Health Memory, Timeline, What Changed, Trends and Ask My Health — built on one connected history.`,
    eyebrow: 'Product',
    headline: 'One intelligent',
    accent: 'health history.',
    lede: `${BRAND.name} is designed to turn scattered records into a connected health history — then help you see trends, spot what changed and ask questions grounded in your own documents.`,
    blocks: [
      {
        type: 'rows',
        id: 'features',
        eyebrow: 'Inside the app',
        title: 'What it’s designed to do.',
        intro: `Each part of ${BRAND.name} is designed to build on the same connected history. The app already lets you add reports (as a PDF, photo or scan) and keep them together in private storage. The parts below marked “In development” are built into the app and are still being tested and prepared for release; “Planned” means not started.`,
        items: [
          { id: 'memory', title: 'Health Memory', text: 'Partly available: add reports as a PDF, a photo or a scan, and keep the originals together in private storage. In development: turning what is read from your reports into one saved history that stays connected across years, with each result linked to its source page.' },
          { id: 'timeline', title: 'Timeline', text: 'In development. Designed to tell your health story over time — every record placed where it belongs, from your earliest to your latest.' },
          { id: 'changes', title: 'What Changed', text: 'In development. Designed to compare your current information with your own past history, with the change and the dates made clear.' },
          { id: 'ask', title: 'Ask My Health', text: 'In development. Designed to answer questions in plain language only from your own records, showing the sources behind each answer. It will not answer questions that ask for a diagnosis or treatment.' },
          { id: 'trends', title: 'Trends', text: 'In development. Designed to give a longitudinal view of key measures, so you see direction over months and years, not just one result.' },
          { id: 'medications', title: 'Medications', text: 'In development. Designed to keep your medication history alongside the records it came from.' },
          { id: 'corrections', title: 'Review & correct', text: 'In development. Designed to let you check each result read from a report against its source, correct it (with a reason) or confirm it, while the original reading stays on record.' },
        ],
      },
      {
        type: 'rows',
        id: 'use-cases',
        eyebrow: 'Use cases',
        title: 'Built for real moments.',
        items: [
          { title: 'Understand your own history', text: 'In development. Designed to show how a measure you care about has moved across years, in one place, without digging through folders and chats.' },
          { title: 'Make sense of a new report', text: 'In development. Designed to read a new result in the context of what came before it, with plain-language explanations kept separate from the facts.' },
          { title: 'Prepare for an appointment', text: 'Partly available: keep your reports in one place and open the originals whenever you need them. A connected view of your history, so the conversation with your doctor starts from the full picture, is in development. A Doctor Brief you could share is planned.' },
          { title: 'Keep family records (planned)', text: 'Family health is on the roadmap: parents, children and dependents in one place. It is not built yet.' },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: `What ${BRAND.name} is — and isn’t`,
        text: `${BRAND.name} is a consumer health-information product. It helps you keep your own records together, and is being built to help you understand them. It does not diagnose, treat or replace your doctor.`,
        link: { label: 'What works today — see the FAQ', href: '/faq' },
      },
    ],
  },

  'how-it-works': {
    slug: 'how-it-works',
    title: 'How It Works',
    description: 'The five stages from scattered records to understanding: capture, understand, remember, compare and ask.',
    eyebrow: 'How it works',
    headline: 'From records to',
    accent: 'understanding.',
    lede: 'Five stages are designed to take you from a scattered pile of documents to a health history you can actually use. Here is what each one does — and where it stands today.',
    blocks: [
      {
        type: 'chapters',
        numbered: true,
        items: [
          {
            id: 'capture',
            title: 'Capture · Partly available',
            lead: 'Bring your health records together.',
            paragraphs: ['Add a report in the app. Every record starts as a document you already have — nothing needs retyping.'],
            points: ['Upload a PDF, take a photo, choose photos or scan a paper report in the app. Photos and scans are saved as a PDF of the pages.', 'WhatsApp capture is planned, not available.', 'Your original document is kept, so there is always a source to check.'],
            visual: 'capture',
          },
          {
            id: 'understand',
            title: 'Understand · In development',
            lead: 'Extract and organize relevant information.',
            paragraphs: [`Designed to turn reports into structured health information. Reading your reports is at the core of what ${BRAND.name} is built to do. It is in the app and still being tested before release.`],
            points: ['Designed to read dates, results, medications and other details from your documents, each with the page and wording it came from.', 'Reading uses an AI service, and only runs with your permission. You can review, correct or confirm each result.', 'AI explanations are kept separate from what your records actually say.'],
            visual: 'understand',
          },
          {
            id: 'remember',
            title: 'Remember · In development',
            lead: 'Build your longitudinal health history.',
            paragraphs: ['Designed to make each record part of one history that grows with you.'],
            points: ['Each record is designed to be placed on your timeline.', 'Measures are designed to be connected across documents and years.', 'Today, the reports you add are kept together in private storage, ready for this step.'],
            visual: 'remember',
          },
          {
            id: 'compare',
            title: 'Compare · In development',
            lead: 'See meaningful changes across months and years.',
            paragraphs: ['Designed to read the present against your own past, once your history is in place.'],
            points: ['Trends are designed to show direction over time for key measures.', 'What Changed is designed to compare the present with your own past.', 'Both depend on your reports being read first.'],
            visual: 'compare',
          },
          {
            id: 'ask',
            title: 'Ask · In development',
            lead: 'Explore your health history conversationally.',
            paragraphs: ['Ask My Health is designed to answer plain-language questions about your history.'],
            points: ['Answers are designed to be drawn only from your records, with their sources.', `${BRAND.name} explains — it does not diagnose or advise on treatment.`],
            visual: 'ask',
          },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'Where things stand today',
        text: 'Illustrated with sample data. Today you can add reports and keep them together in private storage. Stages marked “In development” are built into the app but still being tested before release — the FAQ lists exactly where each one stands.',
        link: { label: 'See the FAQ', href: '/faq' },
      },
    ],
  },

  'ai-intelligence': {
    slug: 'ai-intelligence',
    title: 'Intelligence',
    description: `How ${BRAND.name} is designed to turn separate records into something you can understand: structure, evidence, time, context and questions.`,
    eyebrow: 'Intelligence · in development',
    headline: 'Your history,',
    accent: 'made understandable.',
    lede: `One report tells you about a day. The intelligence layer is how ${BRAND.name} is designed to turn many reports into something you can understand — with the evidence always in view.`,
    blocks: [
      {
        type: 'chapters',
        items: [
          {
            id: 'memory',
            title: 'Health Memory · In development',
            lead: 'Structured, longitudinal history.',
            paragraphs: [`A result is most useful next to the results that came before it. ${BRAND.name} is designed to keep measures, dates and documents connected, so your history reads as one record rather than a folder of files.`],
            visual: 'memory',
          },
          {
            id: 'evidence',
            title: 'Evidence · In development',
            lead: 'Insights grounded in your records.',
            paragraphs: ['Answers and insights are designed to be drawn from your own documents, with the sources shown alongside them so you can open the original and check.', 'What your record says and what AI says about it is designed to be shown, and labelled, separately.'],
            visual: 'evidence',
          },
          {
            id: 'time',
            title: 'Time · In development',
            lead: 'Comparisons across dates.',
            paragraphs: ['A single result is a moment. A trend is a story. Designed to line up readings across months and years so the direction — and the dates behind it — are easy to see.'],
            visual: 'time',
          },
          {
            id: 'context',
            title: 'Context · Planned',
            lead: 'History makes individual records more meaningful.',
            paragraphs: [`Some things only show up across many records. ${BRAND.name} is designed to look for consistent movement and point you to the records behind it — a prompt to review, never a diagnosis.`],
            visual: 'context',
          },
          {
            id: 'ask',
            title: 'Ask · In development',
            lead: 'Conversational access to your own history.',
            paragraphs: ['Ask My Health is designed to answer plain-language questions from your records, with their sources.', `AI can make mistakes — including when reading a document or explaining a result. That is why sources will be shown, and why ${BRAND.name} is not a substitute for professional medical advice.`],
            visual: 'prompts',
          },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'Where things stand today',
        text: 'Illustrated with sample data. The intelligence described on this page is in development — today you can add reports and keep them together in private storage. “Context” is planned and not built yet. The FAQ lists where each part stands.',
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
        title: 'Pre-launch status',
        text: `${BRAND.name} is still being built and is not in the app stores yet. This page describes how the product works and is designed to work, and says which controls are not available yet. Nothing here is a legal policy — the Privacy Policy will be published before launch.`,
      },
      {
        type: 'cards',
        id: 'approach',
        eyebrow: 'Our approach',
        title: 'Privacy by design.',
        columns: 2,
        items: [
          { icon: 'shield', tone: 'blue', title: 'Your records are yours', text: 'Each account can only see its own records. The database is built to deny access by default and allow it back only for the account that owns the data.' },
          { icon: 'evidence', tone: 'lavender', title: 'Transparent AI', text: 'Reading your reports and answering questions are built to use a third-party AI service. Report text, or for scans the document itself, is only sent when you have allowed AI processing, and you can switch that off in the app. Your name, email, phone number and date of birth are not sent, but personal details printed inside a report are not removed. AI output is designed to be shown separately from your records, with the source linked. AI can be wrong.' },
          { icon: 'users', tone: 'cream', title: 'Sharing will be your choice', text: 'The app does not share your records with other people, and there is no sharing feature yet. When sharing is built, sharing with a doctor or anyone else will be something you choose to do — never the default.' },
          { icon: 'whatsapp', tone: 'mint', title: 'WhatsApp will be a doorway, not a vault', text: `WhatsApp is planned as a way to send reports in; it is not available yet. Your health history will live in ${BRAND.name}, and messages sent back to you will stay generic.` },
        ],
      },
      {
        type: 'cards',
        id: 'control',
        eyebrow: 'Your control',
        title: 'Access, share, delete.',
        intro: 'The app’s Privacy screen shows these controls. Some are built; others are not available yet.',
        columns: 3,
        items: [
          { icon: 'file', tone: 'blue', title: 'Access', text: 'See and open the reports you have added. Downloading a copy of your data is planned and not available.' },
          { icon: 'sliders', tone: 'teal', title: 'Share (planned)', text: 'Choosing what the app may share, and with whom, is planned. The app does not share your records with other people today.' },
          { icon: 'lock', tone: 'lavender', title: 'Delete', text: 'Deleting a report, which removes the original file and the information read from it, is in development. Deleting your whole account is planned and not available: if you try it in the app, it says so and your data is not changed.' },
        ],
      },
    ],
  },

  security: {
    slug: 'security',
    title: 'Security',
    description: `How ${BRAND.name} is designed to protect your data, stated factually.`,
    eyebrow: 'Security',
    headline: 'How your data is',
    accent: 'protected.',
    lede: 'We’d rather be specific and modest than impressive and vague. Here is what the product is designed to do.',
    blocks: [
      {
        type: 'cards',
        id: 'protection',
        eyebrow: 'Data security',
        title: 'What the design does today.',
        columns: 2,
        items: [
          { icon: 'lock', tone: 'blue', title: 'Access limited to your account', text: 'Database rules deny access by default and only allow an account to read and write its own records.' },
          { icon: 'file', tone: 'teal', title: 'Private document storage', text: 'Uploaded documents go to private storage. They are not publicly reachable.' },
          { icon: 'shield', tone: 'lavender', title: 'No server credentials in the app', text: 'The app does not contain server credentials. Server-side processing, such as reading reports, is built to run on our servers with credentials the app never holds, and is still being prepared for release.' },
          { icon: 'evidence', tone: 'cream', title: 'Originals stay as evidence', text: 'Your original documents are stored unchanged and cannot be overwritten. Information read from a report is designed to stay linked to the page it came from.' },
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
    description: `Why we are building ${BRAND.name}: to bring scattered health records into one connected history.`,
    eyebrow: 'About',
    headline: 'Healthcare has a',
    accent: 'memory problem.',
    lede: `Your lab has one record. Your doctor has another. Your hospital has another. ${BRAND.name} is being built to bring the history together.`,
    blocks: [
      {
        type: 'prose',
        id: 'mission',
        eyebrow: 'Why we built it',
        title: 'Each record makes sense alone. Together, they tell a story nobody can easily see.',
        paragraphs: [
          'Most of us carry our health history in pieces — a hospital portal here, a PDF there, a prescription photo in a chat.',
          `We are building ${BRAND.name} to connect those pieces into one history, and to help people understand how their health changes over time — with the evidence always one tap away.`,
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
    description: `${BRAND.name}’s Terms of Service — draft, pending legal review.`,
    eyebrow: 'Legal',
    headline: 'Terms of',
    accent: 'Service.',
    lede: `The Terms of Service will be published here before ${BRAND.name} launches.`,
    blocks: [
      {
        type: 'notice',
        tone: 'draft',
        title: 'Draft — pending legal review',
        text: 'This page is a placeholder. It is not a contract and should not be relied on. The final Terms of Service will replace it before launch.',
      },
      {
        type: 'prose',
        title: 'What the Terms will cover',
        paragraphs: [`When published, the Terms will set out, in plain language, how ${BRAND.name} may be used and what you can expect from it.`],
        bullets: [`Who can use ${BRAND.name}`, 'Your responsibilities for the records you add', `What ${BRAND.name} is and isn’t: a health-information tool, not medical advice`, 'How the service may change or end', 'How to contact us'],
      },
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
    lede: `Straight answers about what ${BRAND.name} does today, what’s coming next, and what it doesn’t do.`,
    blocks: [],
  },

  download: {
    slug: 'download',
    title: 'Download App',
    description: `Get the ${BRAND.name} app: where it is available and how to sign in.`,
    eyebrow: 'Download App',
    headline: `Get the ${BRAND.name}`,
    accent: 'app.',
    lede: 'The app lets you add your health reports and keep them together in private storage, on your phone.',
    blocks: [
      {
        type: 'notice',
        id: 'availability',
        tone: 'info',
        title: STORES_LIVE ? 'Available in the app stores' : 'Not in the App Store or Google Play yet',
        text: STORES_LIVE
          ? `Download ${BRAND.name} from the App Store or Google Play using the links below.`
          : `${BRAND.name} is being built for iPhone and Android. Its store listings are not public yet — the official App Store and Google Play links will appear on this page when they are.`,
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
          { icon: 'file', tone: 'blue', title: 'Your records are the source of truth', text: 'Insights and answers are designed to come from your own documents — not from guesswork about people in general.' },
          { icon: 'evidence', tone: 'teal', title: 'Show the evidence', text: 'Every insight should point back to the records behind it, so you can check it yourself.' },
          { icon: 'sparkle', tone: 'lavender', title: 'Keep fact and explanation apart', text: 'What your record says and what AI says about it is designed to be shown, and labelled, separately.' },
          { icon: 'shield', tone: 'cream', title: 'Help you understand — never diagnose', text: `${BRAND.name} is being built to explain and compare. It does not diagnose, treat or replace your doctor.` },
          { icon: 'lightbulb', tone: 'mint', title: 'Be honest about uncertainty', text: 'AI can be wrong. When something is unclear, the right answer is to say so.' },
          { icon: 'sliders', tone: 'blue', title: 'You stay in control', text: 'You decide what to add, and you can switch AI processing off in the app. Deleting a report is in development; sharing, data download and account deletion are planned.' },
          { icon: 'compass', tone: 'teal', title: 'Say what’s real', text: 'If a feature isn’t live yet, we say so. We don’t claim protections or capabilities we can’t back up.' },
        ],
      },
    ],
    closing: 'none',
  },
};

import type { ChapterVisualKey } from '@/components/ChapterVisual';
import type { IconName } from '@/components/Icon';
import { BRAND } from '@/lib/config';

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
        intro: `Each part of ${BRAND.name} is designed to build on the same connected history. Today you can add reports (as a PDF, photo or scan) and keep them together in private storage; the rest is being built next.`,
        items: [
          { id: 'memory', title: 'Health Memory', text: 'Available today: add reports as a PDF, a photo or a scan, and keep the originals together in private storage. Not yet available: organizing reports, prescriptions, scans and consultations into one history that stays connected across years.' },
          { id: 'timeline', title: 'Timeline', text: 'Not yet available. Designed to tell your health story over time — every record placed where it belongs, from your earliest to your latest.' },
          { id: 'changes', title: 'What Changed', text: 'Not yet available. Designed to compare your current information with your own past history, with the change and the dates made clear.' },
          { id: 'ask', title: 'Ask My Health', text: 'Not yet available. Designed to answer questions in plain language from your records, showing the sources behind each answer.' },
          { id: 'trends', title: 'Trends', text: 'Not yet available. Designed to give a longitudinal view of key measures, so you see direction over months and years, not just one result.' },
          { id: 'medications', title: 'Medications', text: 'Not yet available. Designed to keep your medication history alongside the records it came from.' },
        ],
      },
      {
        type: 'rows',
        id: 'use-cases',
        eyebrow: 'Use cases',
        title: 'Built for real moments.',
        items: [
          { title: 'Understand your own history', text: 'Not yet available. Designed to show how a measure you care about has moved across years, in one place, without digging through folders and chats.' },
          { title: 'Make sense of a new report', text: 'Not yet available. Designed to read a new result in the context of what came before it, with plain-language explanations kept separate from the facts.' },
          { title: 'Prepare for an appointment', text: 'Available today: keep your reports in one place and open the originals whenever you need them. A connected view of your history, so the conversation with your doctor starts from the full picture, is not yet available.' },
          { title: 'Keep family records (coming soon)', text: 'Family health is on the roadmap: parents, children and dependents in one place. It is not available yet.' },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: `What ${BRAND.name} is — and isn’t`,
        text: `${BRAND.name} is a consumer health-information product. It helps you keep your own records together, and is being built to help you understand them. It does not diagnose, treat or replace your doctor.`,
        link: { label: 'What is available today', href: '/faq' },
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
    lede: 'Five stages are designed to take you from a scattered pile of documents to a health history you can actually use. Here is what each one does — and what is available today.',
    blocks: [
      {
        type: 'chapters',
        numbered: true,
        items: [
          {
            id: 'capture',
            title: 'Capture · Available today',
            lead: 'Bring your health records together.',
            paragraphs: ['Add a report in the app. Every record starts as a document you already have — nothing needs retyping.'],
            points: ['Upload a PDF, take a photo, choose photos or scan a paper report in the app.', 'WhatsApp capture is not live yet.', 'Your original document is kept, so there is always a source to check.'],
            visual: 'capture',
          },
          {
            id: 'understand',
            title: 'Understand · Not yet available',
            lead: 'Extract and organize relevant information.',
            paragraphs: [`Designed to turn reports into structured health information. Reading your reports is at the core of what ${BRAND.name} is being built to do.`],
            points: ['Designed to read dates, results, medications and other details from your documents.', 'Extracted information will stay linked to the document it came from.', 'AI explanations will be kept separate from what your records actually say.'],
            visual: 'understand',
          },
          {
            id: 'remember',
            title: 'Remember · Not yet available',
            lead: 'Build your longitudinal health history.',
            paragraphs: ['Designed to make each record part of one history that grows with you.'],
            points: ['Each record will be placed on your timeline.', 'Measures will be connected across documents and years.', 'Today, the reports you add are kept together in private storage, ready for this step.'],
            visual: 'remember',
          },
          {
            id: 'compare',
            title: 'Compare · Not yet available',
            lead: 'See meaningful changes across months and years.',
            paragraphs: ['Designed to read the present against your own past, once your history is in place.'],
            points: ['Trends will show direction over time for key measures.', 'What Changed will compare the present with your own past.', 'Patterns will surface when readings move consistently.'],
            visual: 'compare',
          },
          {
            id: 'ask',
            title: 'Ask · Not yet available',
            lead: 'Explore your health history conversationally.',
            paragraphs: ['Ask My Health is designed to answer plain-language questions about your history.'],
            points: ['Answers will be drawn from your records and show their sources.', `${BRAND.name} explains — it does not diagnose.`],
            visual: 'ask',
          },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'What is available today',
        text: 'Illustrated with sample data. Today you can add reports and keep them together in private storage. Stages marked “Not yet available” are being built next — the FAQ lists exactly what the current version does.',
        link: { label: 'See the FAQ', href: '/faq' },
      },
    ],
  },

  'ai-intelligence': {
    slug: 'ai-intelligence',
    title: 'Intelligence',
    description: `How ${BRAND.name} is designed to turn separate records into something you can understand: structure, evidence, time, context and questions.`,
    eyebrow: 'Intelligence · being built',
    headline: 'Your history,',
    accent: 'made understandable.',
    lede: `One report tells you about a day. The intelligence layer is how ${BRAND.name} is designed to turn many reports into something you can understand — with the evidence always in view.`,
    blocks: [
      {
        type: 'chapters',
        items: [
          {
            id: 'memory',
            title: 'Health Memory · Not yet available',
            lead: 'Structured, longitudinal history.',
            paragraphs: [`A result is most useful next to the results that came before it. ${BRAND.name} is designed to keep measures, dates and documents connected, so your history reads as one record rather than a folder of files.`],
            visual: 'memory',
          },
          {
            id: 'evidence',
            title: 'Evidence · Not yet available',
            lead: 'Insights grounded in your records.',
            paragraphs: ['Answers and insights will be drawn from your own documents, with the sources shown alongside them so you can open the original and check.', 'What your record says and what AI says about it will be shown, and labelled, separately.'],
            visual: 'evidence',
          },
          {
            id: 'time',
            title: 'Time · Not yet available',
            lead: 'Comparisons across dates.',
            paragraphs: ['A single result is a moment. A trend is a story. Designed to line up readings across months and years so the direction — and the dates behind it — are easy to see.'],
            visual: 'time',
          },
          {
            id: 'context',
            title: 'Context · Not yet available',
            lead: 'History makes individual records more meaningful.',
            paragraphs: [`Some things only show up across many records. ${BRAND.name} is designed to look for consistent movement and point you to the records behind it — a prompt to review, never a diagnosis.`],
            visual: 'context',
          },
          {
            id: 'ask',
            title: 'Ask · Not yet available',
            lead: 'Conversational access to your own history.',
            paragraphs: ['Ask My Health is designed to answer plain-language questions from your records, with their sources.', `AI can make mistakes — including when reading a document or explaining a result. That is why sources will be shown, and why ${BRAND.name} is not a substitute for professional medical advice.`],
            visual: 'prompts',
          },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'What is available today',
        text: 'Illustrated with sample data. The intelligence described on this page is not yet available — today you can add reports and keep them together in private storage. The FAQ lists exactly what the current version does.',
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
        text: `${BRAND.name} is still being built. This page describes how the product is designed, and will be updated as each control goes live. Nothing here is a legal policy — the Privacy Policy will be published before launch.`,
      },
      {
        type: 'cards',
        id: 'approach',
        eyebrow: 'Our approach',
        title: 'Privacy by design.',
        columns: 2,
        items: [
          { icon: 'shield', tone: 'blue', title: 'Your records are yours', text: 'Each account can only see its own records. The database is built to deny access by default and allow it back only for the account that owns the data.' },
          { icon: 'evidence', tone: 'lavender', title: 'Transparent AI', text: 'When AI explanations arrive, they will be shown separately from your records, with the source document linked so you can check it yourself.' },
          { icon: 'users', tone: 'cream', title: 'Sharing will be your choice', text: 'Nothing is shared today. When sharing arrives, sharing with a doctor or anyone else will be something you choose to do — never the default.' },
          { icon: 'whatsapp', tone: 'mint', title: 'WhatsApp will be a doorway, not a vault', text: `WhatsApp is planned as a way to send reports in; it is not available yet. Your health history will live in ${BRAND.name}, and messages sent back to you will stay generic.` },
        ],
      },
      {
        type: 'cards',
        id: 'control',
        eyebrow: 'Your control',
        title: 'Access, share, delete.',
        intro: 'These controls appear on the app’s Privacy screen, but they are not available yet.',
        columns: 3,
        items: [
          { icon: 'file', tone: 'blue', title: 'Access', text: 'See the reports you have added. Requesting a copy of your data is planned.' },
          { icon: 'sliders', tone: 'teal', title: 'Share (planned)', text: 'Choosing what the app may share, and with whom, is planned. Nothing is shared today.' },
          { icon: 'lock', tone: 'lavender', title: 'Delete (planned)', text: 'Deleting your account and the data linked to it is planned. It is not available in the current version.' },
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
          { icon: 'shield', tone: 'lavender', title: 'No server credentials in the app', text: 'The app does not contain server credentials. Server-side processing is not built yet; when it ships, it will run with credentials the app never holds.' },
          { icon: 'evidence', tone: 'cream', title: 'Originals stay as evidence', text: 'Your original documents are stored unchanged and cannot be overwritten. When reports can be read, the information taken from them will stay linked to the original.' },
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
        text: 'Please tell us. Contact details for security reports will be published here at launch.',
      },
    ],
    closing: 'contact',
  },

  about: {
    slug: 'about',
    title: 'About',
    description: `Why we built ${BRAND.name}, and the company behind it: ${BRAND.parent}.`,
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
      {
        type: 'prose',
        id: 'company',
        eyebrow: 'The company',
        title: `${BRAND.name} is a product of ${BRAND.parent}.`,
        paragraphs: ['Team profiles are coming soon.'],
      },
      {
        type: 'prose',
        id: 'careers',
        eyebrow: 'Careers',
        title: 'Join us.',
        paragraphs: ['There are no open roles listed here yet. If you care about making health information understandable, we’d like to hear from you.'],
      },
    ],
    closing: 'contact',
  },

  contact: {
    slug: 'contact',
    title: 'Contact',
    description: `Get in touch with the ${BRAND.name} team at ${BRAND.parent}.`,
    eyebrow: 'Contact',
    headline: 'Get in',
    accent: 'touch.',
    lede: 'Questions, feedback, press or partnerships — we’d like to hear from you.',
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
          { icon: 'file', tone: 'blue', title: 'Your records are the source of truth', text: 'Insights and answers will come from your own documents — not from guesswork about people in general.' },
          { icon: 'evidence', tone: 'teal', title: 'Show the evidence', text: 'Every insight should point back to the records behind it, so you can check it yourself.' },
          { icon: 'sparkle', tone: 'lavender', title: 'Keep fact and explanation apart', text: 'What your record says and what AI says about it will always be shown, and labelled, separately.' },
          { icon: 'shield', tone: 'cream', title: 'Help you understand — never diagnose', text: `${BRAND.name} is being built to explain and compare. It does not diagnose, treat or replace your doctor.` },
          { icon: 'lightbulb', tone: 'mint', title: 'Be honest about uncertainty', text: 'AI can be wrong. When something is unclear, the right answer is to say so.' },
          { icon: 'sliders', tone: 'blue', title: 'You stay in control', text: 'You decide what to add. Controls for sharing and deleting are planned.' },
          { icon: 'compass', tone: 'teal', title: 'Say what’s real', text: 'If a feature isn’t live yet, we say so. We don’t claim protections or capabilities we can’t back up.' },
        ],
      },
    ],
    closing: 'none',
  },
};

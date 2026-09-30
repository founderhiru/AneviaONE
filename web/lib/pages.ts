import type { IconName } from '@/components/Icon';
import type { Tone } from '@/lib/nav';
import { BRAND } from '@/lib/config';

/**
 * Content for the secondary pages, as data. `ContentPage` renders these.
 *
 * Copy rules (see the brief): consumer health-INFORMATION product — never
 * diagnosis/treatment/prevention/clinical-accuracy claims, and no security or
 * compliance claims the implementation can't back. Where something is not live
 * yet, the page says so.
 */

export type Item = { icon: IconName; title: string; text: string; tone: Tone };

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
  | {
      type: 'steps';
      items: { id: string; n: string; icon: IconName; tone: Tone; title: string; text: string; points: string[] }[];
    }
  | { type: 'prose'; id?: string; eyebrow?: string; title: string; paragraphs: string[]; bullets?: string[] }
  | { type: 'notice'; tone: 'info' | 'draft'; title: string; text: string }
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
      `See what ${BRAND.name} does: a connected, longitudinal health history you can understand, compare and ask questions about.`,
    eyebrow: 'Product',
    headline: 'One intelligent',
    accent: 'health history.',
    lede: `${BRAND.name} turns scattered records into a connected health history — then helps you see trends, spot what changed and ask questions grounded in your own documents.`,
    blocks: [
      {
        type: 'cards',
        id: 'features',
        eyebrow: 'App features',
        title: 'Everything starts from your records.',
        intro: `Each part of ${BRAND.name} builds on the same connected history.`,
        columns: 3,
        items: [
          { icon: 'layers', tone: 'blue', title: 'Health Memory', text: 'Reports, prescriptions, scans and consultations organized into one history that stays connected across years.' },
          { icon: 'clock', tone: 'teal', title: 'Health Timeline', text: 'Your health story over time — every record placed where it belongs, from your earliest to your latest.' },
          { icon: 'trend', tone: 'mint', title: 'Trends', text: 'A longitudinal view of key measures, so you see direction over months and years, not just one result.' },
          { icon: 'compare', tone: 'lavender', title: 'What Changed', text: 'Your current information compared with your own past history, with the change and the dates made clear.' },
          { icon: 'chat', tone: 'cream', title: `Ask ${BRAND.name}`, text: 'Ask questions in plain language. Answers come from your records and show the sources behind them.' },
          { icon: 'pill', tone: 'blue', title: 'Medications', text: 'Keep your medication history alongside the records it came from.' },
        ],
      },
      {
        type: 'cards',
        id: 'use-cases',
        eyebrow: 'Use cases',
        title: 'For individuals & families.',
        intro: `A few of the moments ${BRAND.name} is built for.`,
        columns: 2,
        items: [
          { icon: 'compass', tone: 'teal', title: 'Understand your own history', text: 'See how a measure you care about has moved across years, in one place, without digging through folders and chats.' },
          { icon: 'file', tone: 'lavender', title: 'Make sense of a new report', text: 'Read a new result in the context of what came before it, with plain-language explanations kept separate from the facts.' },
          { icon: 'calendar', tone: 'cream', title: 'Prepare for an appointment', text: 'Have your history at your fingertips, so the conversation with your doctor starts from the full picture.' },
          { icon: 'users', tone: 'mint', title: 'Keep family records (coming soon)', text: 'Family health is on the roadmap: parents, children and dependents in one place. It is not available yet.' },
        ],
      },
      {
        type: 'notice',
        tone: 'info',
        title: `What ${BRAND.name} is — and isn’t`,
        text: `${BRAND.name} is a consumer health-information product. It helps you organize and understand your own records. It does not diagnose, treat or replace your doctor.`,
      },
    ],
  },

  'how-it-works': {
    slug: 'how-it-works',
    title: 'How It Works',
    description:
      'From records to understanding: capture, understand, remember, compare and ask — in five steps.',
    eyebrow: 'How it works',
    headline: 'From records to',
    accent: 'understanding.',
    lede: 'Five steps take you from a scattered pile of documents to a health history you can actually use.',
    blocks: [
      {
        type: 'steps',
        items: [
          { id: 'capture', n: '01', icon: 'upload', tone: 'blue', title: 'Capture', text: 'Upload a report, scan a document or send it through WhatsApp.', points: ['Upload a file or scan a paper document in the app.', 'WhatsApp capture is rolling out — it is a way to send reports in, not where your history lives.', 'Your original document is kept, so there is always a source to check.'] },
          { id: 'understand', n: '02', icon: 'scan', tone: 'teal', title: 'Understand', text: `${BRAND.name} extracts relevant information and organizes it.`, points: ['Dates, results, medications and other details are read from your documents.', 'Extracted information stays linked to the document it came from.', 'AI explanations are kept separate from what your records actually say.'] },
          { id: 'remember', n: '03', icon: 'layers', tone: 'lavender', title: 'Remember', text: 'Your information becomes part of your longitudinal health history.', points: ['Each record is placed on your timeline.', 'Measures are connected across documents and years.', 'Your history grows with every record you add.'] },
          { id: 'compare', n: '04', icon: 'compare', tone: 'mint', title: 'Compare', text: 'See meaningful changes, trends and patterns across months and years.', points: ['Trends show direction over time for key measures.', 'What Changed compares the present with your own past.', 'Patterns surface when readings move consistently.'] },
          { id: 'ask', n: '05', icon: 'chat', tone: 'cream', title: 'Ask', text: 'Ask questions about your health history and get evidence-based answers.', points: ['Ask in plain language.', 'Answers are drawn from your records and show their sources.', `${BRAND.name} explains — it does not diagnose.`] },
        ],
      },
    ],
  },

  'ai-intelligence': {
    slug: 'ai-intelligence',
    title: 'AI Intelligence',
    description:
      'Trends, changes and patterns from your own health history — with explanations and sources you can check.',
    eyebrow: 'AI intelligence',
    headline: 'Your health history',
    accent: 'becomes intelligence.',
    lede: `${BRAND.name} analyzes your records over time to identify meaningful trends, changes and patterns — so you can understand what is happening, not just what happened in one report.`,
    blocks: [
      {
        type: 'split',
        id: 'trends',
        eyebrow: 'Trends & insights',
        title: 'See how your health changes.',
        paragraphs: [`A single result is a moment. A trend is a story. ${BRAND.name} lines up your readings across months and years so the direction is easy to see.`],
        points: ['Longitudinal charts for key measures', 'Clear labels for direction and time span', 'Every point traces back to a record'],
        card: 'trend',
      },
      {
        type: 'split',
        id: 'changes',
        eyebrow: 'What changed',
        title: 'Compare across time.',
        paragraphs: [`${BRAND.name} compares your current information with your own past history and tells you what moved, by how much, and between which dates.`],
        points: ['Before → after values with dates', 'Improvements, increases and decreases shown plainly', 'Colors carry meaning only — never decoration'],
        card: 'change',
        reverse: true,
      },
      {
        type: 'split',
        id: 'patterns',
        eyebrow: 'Pattern detection',
        title: 'Find meaningful patterns.',
        paragraphs: [`Some things only show up across many records. ${BRAND.name} looks for consistent movement and points you to the records behind it.`],
        points: ['Patterns described in plain language', 'Supporting records one tap away', 'A prompt to review, never a diagnosis'],
        card: 'pattern',
      },
      {
        type: 'cards',
        id: 'explanations',
        eyebrow: 'AI explanations',
        title: 'Easy-to-understand insights.',
        intro: 'Explanations are there to help you read your records — and they are always labelled as explanations.',
        columns: 2,
        items: [
          { icon: 'lightbulb', tone: 'cream', title: 'Plain language', text: 'Complex terms and reports explained in words you can follow.' },
          { icon: 'evidence', tone: 'teal', title: 'Facts and explanations kept apart', text: 'What your record says is shown separately from AI explanation, so you always know which is which.' },
        ],
      },
      {
        type: 'prose',
        id: 'sources',
        eyebrow: 'Accuracy & sources',
        title: 'Always grounded in your records.',
        paragraphs: [
          'Answers and insights are drawn from your own documents, and the sources are shown alongside them so you can open the original and check.',
          `AI can make mistakes — including when reading a document or explaining a result. That is why sources are shown, and why ${BRAND.name} is not a substitute for professional medical advice.`,
        ],
        bullets: ['Sources shown with answers', 'Original documents kept', 'No diagnosis, treatment or prevention claims'],
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
          { icon: 'evidence', tone: 'lavender', title: 'Transparent AI', text: 'AI explanations are shown separately from your records, with the source document linked so you can check it yourself.' },
          { icon: 'users', tone: 'cream', title: 'Sharing is your choice', text: 'Sharing with a doctor or anyone else is something you choose to do — not something that happens by default.' },
          { icon: 'whatsapp', tone: 'mint', title: 'WhatsApp is a doorway, not a vault', text: `WhatsApp is a way to send reports in. Your health history lives in ${BRAND.name}, and messages sent back to you stay generic.` },
        ],
      },
      {
        type: 'cards',
        id: 'control',
        eyebrow: 'Your control',
        title: 'Access, share, delete.',
        intro: 'These controls are part of the app’s Privacy screen. Some are still being finalized before launch.',
        columns: 3,
        items: [
          { icon: 'file', tone: 'blue', title: 'Access', text: 'See what is stored in your Health Memory, and request a copy of your data.' },
          { icon: 'sliders', tone: 'teal', title: 'Share', text: 'Choose what you allow the app to share, and with whom.' },
          { icon: 'lock', tone: 'lavender', title: 'Delete', text: 'Request deletion of your account and the data associated with it.' },
        ],
      },
    ],
  },

  security: {
    slug: 'security',
    title: 'Security',
    description: `How ${BRAND.name} is designed to protect your data, stated factually, with no unsupported claims.`,
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
          { icon: 'shield', tone: 'lavender', title: 'Server work is separated', text: 'Background processing runs on the server with its own credentials, which are never included in the app.' },
          { icon: 'evidence', tone: 'cream', title: 'Originals stay as evidence', text: 'Your original documents are preserved, and derived information stays linked to them.' },
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
    description: `Why we built ${BRAND.name}, and the company behind it: MedhaIQ Systems.`,
    eyebrow: 'About',
    headline: 'Your health has a history.',
    accent: 'We help you use it.',
    lede: `${BRAND.name} is a product of MedhaIQ Systems.`,
    blocks: [
      {
        type: 'prose',
        id: 'mission',
        eyebrow: 'Our mission',
        title: `Why we built ${BRAND.name}.`,
        paragraphs: [
          'Most of us carry our health history in pieces — a hospital portal here, a PDF there, a prescription photo in a chat. Each record makes sense alone. Together they tell a story nobody can easily see.',
          `We are building ${BRAND.name} to connect those pieces into one history, and to help people understand how their health changes over time — with the evidence always one tap away.`,
        ],
        bullets: ['Remember your health history', 'Understand it', 'Compare it', 'Ask questions about it'],
      },
      {
        type: 'notice',
        tone: 'info',
        title: 'Our team',
        text: 'Team profiles are coming soon.',
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
    description: `Get in touch with the ${BRAND.name} team at MedhaIQ Systems.`,
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
    lede: `Straight answers about what ${BRAND.name} does, and what it doesn’t.`,
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
          { icon: 'file', tone: 'blue', title: 'Your records are the source of truth', text: 'Insights and answers come from your own documents — not from guesswork about people in general.' },
          { icon: 'evidence', tone: 'teal', title: 'Show the evidence', text: 'Every insight should point back to the records behind it, so you can check it yourself.' },
          { icon: 'sparkle', tone: 'lavender', title: 'Keep fact and explanation apart', text: 'What your record says and what AI says about it are always shown, and labelled, separately.' },
          { icon: 'shield', tone: 'cream', title: 'Help you understand — never diagnose', text: `${BRAND.name} explains and compares. It does not diagnose, treat or replace your doctor.` },
          { icon: 'lightbulb', tone: 'mint', title: 'Be honest about uncertainty', text: 'AI can be wrong. When something is unclear, the right answer is to say so.' },
          { icon: 'sliders', tone: 'blue', title: 'You stay in control', text: 'You decide what to store, what to share and what to delete.' },
          { icon: 'compass', tone: 'teal', title: 'Say what’s real', text: 'If a feature isn’t live yet, we say so. We don’t claim protections or capabilities we can’t back up.' },
        ],
      },
    ],
    closing: 'none',
  },
};

export type FaqItem = { q: string; a: string };

export const FAQS: FaqItem[] = [
  { q: `What is ${BRAND.name}?`, a: `${BRAND.name} is a Personal Health Intelligence app. It brings your health records, reports, medications and changes together into one connected health history, then helps you see trends, spot what changed and ask questions about it.` },
  { q: 'Is it just a place to store my medical records?', a: `No. Storing files is only the starting point. ${BRAND.name} turns your records into structured history so you can compare across time, see trends and ask questions grounded in your own documents.` },
  { q: `Does ${BRAND.name} diagnose conditions or give medical advice?`, a: `No. ${BRAND.name} is a consumer health-information product. It helps you organize and understand your own records. It does not diagnose, treat or replace your doctor.` },
  { q: 'Where do the answers come from?', a: 'From your own records. Answers show the sources they are based on, so you can open the original document and check. AI can make mistakes, which is why sources are always shown.' },
  { q: 'Can I trust the AI explanations?', a: 'Treat them as help reading your records, not as medical advice. They are labelled separately from what your documents actually say, and you should talk to a doctor about any health decision.' },
  { q: `Do I need WhatsApp to use ${BRAND.name}?`, a: `No. You can add records in the app. WhatsApp capture is a convenience that is rolling out — a way to send a report in. Your health history lives in ${BRAND.name}, not in WhatsApp.` },
  { q: 'Who can see my records?', a: 'The product is designed so that each account can access only its own records. Sharing with anyone else, such as your doctor, is something you choose to do.' },
  { q: 'Can I delete my data?', a: 'Access, sharing and deletion controls are part of the app’s Privacy screen. Some are still being finalized before launch, and we’ll be specific about what is available when we launch.' },
  { q: `Does ${BRAND.name} support my family’s records?`, a: 'Not yet. Family health is coming soon.' },
  { q: 'When can I download it, and what will it cost?', a: `${BRAND.name} is not in the app stores yet, and pricing has not been announced. Store links will appear on this site at launch.` },
];

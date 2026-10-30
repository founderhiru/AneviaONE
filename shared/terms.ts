/**
 * TERMS OF SERVICE — single source for the website (/terms) and the app
 * (Me → Terms of Service). Pure data, no imports. Use the `{product}` token,
 * never the product name. Plain language; keep every statement true to how
 * the product works today.
 */
export const TERMS_UPDATED = '31 October 2026';

export type TermsSection = { title: string; paragraphs: string[] };

export const TERMS_INTRO =
  'These terms explain how you may use {product}. By creating an account or using the app, you agree to them. If you do not agree, please do not use {product}.';

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'What {product} is',
    paragraphs: [
      '{product} is a Personal Health Intelligence app. It lets you add your health reports, reads them with your permission, keeps your results together, shows how they have changed, and prepares a summary you can show or send to your Doctor.',
      '{product} is a health-information tool. It does not diagnose conditions, prescribe medication, make treatment decisions or replace a qualified healthcare professional. It is not an emergency service. If you think you may have a medical emergency, contact your local emergency number or go to the nearest emergency department.',
    ],
  },
  {
    title: 'Who can use it',
    paragraphs: [
      'You must be at least 18 years old to create an account. Use {product} only for your own health records. Do not add reports that belong to someone else. If a report appears to belong to another person, the app may decline it.',
    ],
  },
  {
    title: 'Your account',
    paragraphs: [
      'You are responsible for keeping access to your email, Apple or Google sign-in secure, and for what happens under your account. Tell us if you think someone else has accessed it.',
    ],
  },
  {
    title: 'Your records and what you add',
    paragraphs: [
      'The reports you add remain yours. You give {product} permission to store them, to read them if you have allowed report reading, and to show the results back to you. We do not sell your records, and we do not use them to train AI models or for advertising.',
      'You are responsible for the records you add and for having the right to add them. Do not upload anything unlawful, or anything that is not a health record.',
    ],
  },
  {
    title: 'Report reading and AI',
    paragraphs: [
      'Report reading uses a third-party AI service, and only runs if you have allowed it in the app. You can turn it off at any time under Me → Privacy & Security. Your name, email, phone number and date of birth are not sent, but personal details printed inside a report are not removed.',
      'AI can make mistakes. A result the app reads from a report may be incomplete or wrong. Results the app is unsure about are held for you to check. Always compare important results with your original report, and talk to your Doctor before making any health decision.',
    ],
  },
  {
    title: 'The For Doctor summary',
    paragraphs: [
      'The For Doctor summary is built from the results stored in your account, as written on your reports, using the ranges printed on those reports. It is not a diagnosis or a medical opinion. When you show or send it, you decide who sees it. Once you share a copy outside the app, we cannot control what happens to it.',
    ],
  },
  {
    title: 'Using the service properly',
    paragraphs: [
      'Do not misuse {product}: do not try to access another person’s records, interfere with the service, attempt to break its security, or use it in a way that breaks the law. We may suspend access if the service or other people are put at risk.',
    ],
  },
  {
    title: 'Deleting your data',
    paragraphs: [
      'You can delete a report, or your whole account, in the app. Deleting a report removes its original file and the results read from it. Deleting your account permanently removes your account, reports, files and results, and cannot be undone.',
    ],
  },
  {
    title: 'Changes and availability',
    paragraphs: [
      'We work to keep {product} available and accurate, but we cannot promise it will always be uninterrupted or error-free. We may change features or these terms. If a change is significant, we will tell you in the app or by email. Continuing to use {product} after a change means you accept it.',
    ],
  },
  {
    title: 'Liability',
    paragraphs: [
      'To the fullest extent the law allows, {product} is provided “as is”, and we are not liable for decisions you make based on information in the app, or for indirect or consequential loss. Nothing in these terms limits any right you have by law that cannot be limited.',
    ],
  },
  {
    title: 'Contact',
    paragraphs: ['Questions about these terms: help@aneviaone.com. Please do not email health records or other personal health information.'],
  },
];

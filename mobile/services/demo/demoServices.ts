/* eslint-disable @typescript-eslint/no-require-imports -- conditional require keeps demo code out of production bundles */
import type { AiService } from '../ai/aiTypes';
import type { AuthService } from '../auth/authTypes';
import type { DocumentsService } from '../documents/documentsTypes';
import type { sampleDocumentsService } from '../documents/sampleDocuments';
import type { HealthService } from '../health/healthService';

export type DemoServices = {
  auth: AuthService;
  documents: DocumentsService;
  health: HealthService;
  ai: AiService;
  sampleDocuments: typeof sampleDocumentsService;
};

/**
 * The ONLY entry point to demo implementations and the fictional sample
 * dataset (mock/). Callers use it only when `isDemoMode` is true.
 *
 * Production builds pin EXPO_PUBLIC_APP_MODE=production (eas.json). Expo
 * inlines that value, so the comparison below becomes a constant and Metro's
 * production constant folding removes the `require`s entirely — the sample
 * data is not in the production bundle at all, not merely unused.
 * (Verified by __tests__/demo-production-separation.test.ts and by grepping
 * an `expo export` bundle; see docs/AI_DATA_FLOW.md.)
 */
export function loadDemoServices(): DemoServices {
  if (process.env.EXPO_PUBLIC_APP_MODE !== 'production') {
    return {
      auth: require('../auth/mockAuthService').mockAuthService,
      documents: require('../documents/demoDocumentsService').demoDocumentsService,
      health: require('../health/demoHealthService').demoHealthService,
      ai: require('../ai/demoAiService').demoAiService,
      sampleDocuments: require('../documents/sampleDocuments').sampleDocumentsService,
    };
  }
  throw new Error('Demo services are not available in production builds.');
}

import { isDemoMode } from '../../config/appMode';
import { demoDocumentsService } from './demoDocumentsService';
import type { DocumentsService } from './documentsTypes';
import { supabaseDocumentsService } from './supabaseDocumentsService';

/**
 * The user's real stored original documents.
 *
 *   production → private Supabase Storage + `documents` table (RLS).
 *   demo       → in-memory, explicit opt-in only (EXPO_PUBLIC_APP_MODE=demo).
 *
 * The previous simulated `processNewDocument` pipeline (which ignored the
 * picked file) is gone; demo mode keeps its sample-derived success counts via
 * `UploadResult.processing`. Sample reports behind the still-mocked Health
 * Memory screens live in `sampleDocuments.ts`.
 */
export const documentsService: DocumentsService = isDemoMode ? demoDocumentsService : supabaseDocumentsService;

export type { DocumentsService } from './documentsTypes';
export * from './documentStatus';
export * from './documentValidation';
export { isStoredDocumentId } from './storagePaths';

import { getDocumentById, mockDocuments } from '../../mock';
import { getObservationsByIds } from '../../mock/observations';
import type { Document, Observation } from '../../types';

/**
 * SAMPLE DATA — the fictional reports behind the still-mocked Health Memory,
 * Timeline, Trends and What Changed screens (Phase 2 replaces them). Screens
 * that show these must label them as sample data; they are never mixed with
 * the user's real stored documents (see documentsService.ts).
 */
export const sampleDocumentsService = {
  async getSampleDocuments(): Promise<Document[]> {
    return mockDocuments;
  },
  async getSampleDocument(id: string): Promise<Document | undefined> {
    return getDocumentById(id);
  },
  async getSampleObservations(document: Document): Promise<Observation[]> {
    return getObservationsByIds(document.observationIds);
  },
};

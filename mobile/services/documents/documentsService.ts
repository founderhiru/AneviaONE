import { getDocumentById as mockGetDocumentById, mockChanges, mockDocuments } from '../../mock';
import { getObservationsByIds } from '../../mock/observations';
import type { Document, DocumentProcessingStatus, Observation } from '../../types';

export type AddDocumentInput = {
  source: Document['source'];
  /** Local file URI from camera/picker — not used by the mock processor,
   * but threaded through so a real implementation can upload it. */
  fileUri?: string;
};

export type ProcessingUpdate = {
  status: DocumentProcessingStatus;
};

export type ProcessingResult = {
  document: Document;
  /** Counts describing what the new document contributed to the Health
   * Memory — all derived from the mock dataset itself, never invented. */
  observationCount: number;
  newEncounterCount: number;
  historicalComparisonCount: number;
};

/**
 * Documents service boundary. `processNewDocument` simulates the pipeline
 * described in the Add Record flow (received → identified → extracted →
 * compared → memory updated) via `onProgress` callbacks, but never
 * pretends this is real extraction — the resulting document and
 * observations are drawn from the mock Health Memory dataset, clearly
 * isolated here rather than persisted as if real AI processing occurred.
 */
export interface DocumentsService {
  getDocuments(): Promise<Document[]>;
  getDocumentById(id: string): Promise<Document | undefined>;
  getObservationsForDocument(document: Document): Promise<Observation[]>;
  processNewDocument(input: AddDocumentInput, onProgress: (update: ProcessingUpdate) => void): Promise<ProcessingResult>;
}

const STEP_DELAY_MS = 700;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const documentsService: DocumentsService = {
  async getDocuments() {
    return mockDocuments;
  },
  async getDocumentById(id) {
    return mockGetDocumentById(id);
  },
  async getObservationsForDocument(document) {
    return getObservationsByIds(document.observationIds);
  },
  async processNewDocument(input, onProgress) {
    const steps: DocumentProcessingStatus[] = ['received', 'identifying', 'extracting', 'comparing', 'updating_memory'];
    for (const status of steps) {
      onProgress({ status });
      await delay(STEP_DELAY_MS);
    }
    onProgress({ status: 'complete' });
    // Mock outcome: point at the most recent existing mock document so the
    // "Health Memory Updated" and "What Changed" screens have something
    // coherent to show, without inventing new AI-extracted content. The
    // counts below are all derived from that same document's real links in
    // the mock dataset, not invented numbers.
    const document = mockDocuments[0];
    const observationCount = document.observationIds?.length ?? 0;
    const historicalComparisonCount = mockChanges.filter((change) => change.sourceDocumentId === document.id).length;
    return { document, observationCount, newEncounterCount: 1, historicalComparisonCount };
  },
};

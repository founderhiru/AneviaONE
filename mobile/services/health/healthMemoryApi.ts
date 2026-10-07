import type { Allergy, Condition, HealthChange, HealthEvent, Medication, Procedure, Trend, TrendDirection, Vaccination } from '../../types';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';

/**
 * Client for the `health-memory` Edge Function (Gate 2). The server derives
 * Health Memory, Timeline, Trends and What Changed deterministically from
 * the person's TRUSTED records only (RLS-scoped to their session); this file
 * just fetches the snapshot and maps it onto the app's view types.
 */

type ServerEvidence = { documentId: string | null; documentName: string | null; reportDate: string | null; pageNumber: number | null };
type ServerMemoryItem = { key: string; name: string; detail: string | null; firstRecorded: string | null; lastRecorded: string | null; recordIds: string[]; sources: ServerEvidence[] };
type ServerTrend = {
  id: string;
  name: string;
  nameKey: string;
  unit: string | null;
  points: { date: string; value: number; recordIds: string[]; evidence: ServerEvidence }[];
  direction: 'increased' | 'decreased' | 'unchanged' | 'varied' | 'insufficient_data';
  latest: { date: string; value: number };
  summary: string;
  referenceRange: string | null;
  otherUnits: string[];
};
type ServerChange = {
  id: string;
  type: HealthChange['type'];
  name: string;
  summary: string;
  previousValue: string | null;
  currentValue: string | null;
  unit: string | null;
  date: string;
  comparedWithDate: string | null;
  sources: { recordId: string; role: 'current' | 'previous'; evidence: ServerEvidence }[];
};
type ServerEvent = {
  id: string;
  type: 'report' | 'procedure' | 'immunization' | 'encounter';
  date: string | null;
  title: string;
  summary: string;
  documentId: string | null;
  recordIds: string[];
};

export type HealthSnapshot = {
  version: string;
  memory: {
    conditions: ServerMemoryItem[];
    medications: ServerMemoryItem[];
    allergies: ServerMemoryItem[];
    procedures: ServerMemoryItem[];
    vaccinations: ServerMemoryItem[];
    encounters: ServerMemoryItem[];
    counts: { records: number; reports: number };
  };
  timeline: ServerEvent[];
  trends: ServerTrend[];
  changes: { status: 'ok' | 'insufficient_data'; changes: ServerChange[] };
};

const CACHE_MS = 30_000;
let cache: { at: number; promise: Promise<HealthSnapshot> } | null = null;

/** Called when a report finishes reading, so screens show the new records. */
export function invalidateHealthMemory() {
  cache = null;
}

async function fetchSnapshot(): Promise<HealthSnapshot> {
  const client = getSupabaseClient();
  if (!client) throw new ServiceError('not_configured', 'Your Health Memory isn’t available right now.');
  const { data, error } = await client.functions.invoke('health-memory', { body: {} });
  if (error || !data) throw toServiceError(error, { code: 'unknown', userMessage: 'We couldn’t load your Health Memory. Please try again.', retryable: true });
  return data as HealthSnapshot;
}

export function getSnapshot(): Promise<HealthSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.promise;
  const promise = fetchSnapshot();
  cache = { at: Date.now(), promise };
  promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

// ----------------------------------------------------------------- mapping --

const lastSource = (item: ServerMemoryItem) => item.sources.find((s) => s.documentId)?.documentId ?? undefined;
const orUndefined = <T,>(v: T | null): T | undefined => (v === null ? undefined : v);

const DIRECTION: Record<ServerTrend['direction'], TrendDirection> = {
  increased: 'up',
  decreased: 'down',
  unchanged: 'flat',
  varied: 'mixed',
  insufficient_data: 'insufficient',
};

export function toTrend(t: ServerTrend): Trend {
  return {
    id: t.id,
    metricName: t.name,
    unit: orUndefined(t.unit),
    currentValue: t.latest.value,
    direction: DIRECTION[t.direction],
    points: t.points.map((p) => ({ date: p.date, value: p.value, sourceDocumentId: orUndefined(p.evidence.documentId) })),
    neutralSummary: t.summary,
    referenceRange: orUndefined(t.referenceRange),
    otherUnits: t.otherUnits,
  };
}

export function toChange(c: ServerChange): HealthChange {
  const current = c.sources.find((s) => s.role === 'current');
  const previous = c.sources.find((s) => s.role === 'previous');
  return {
    id: c.id,
    type: c.type,
    metricOrItemName: c.name,
    previousValue: orUndefined(c.previousValue),
    currentValue: orUndefined(c.currentValue),
    unit: orUndefined(c.unit),
    date: c.date,
    comparedWithDate: orUndefined(c.comparedWithDate),
    sourceDocumentId: orUndefined((current ?? previous)?.evidence.documentId ?? null),
    comparedSourceDocumentId: orUndefined(previous?.evidence.documentId ?? null),
    summary: c.summary,
  };
}

export function toEvent(e: ServerEvent): HealthEvent {
  return {
    id: e.id,
    type: e.type === 'immunization' ? 'vaccination' : e.type,
    title: e.title,
    date: e.date,
    summary: e.summary,
    observationIds: e.recordIds,
    sourceDocumentId: orUndefined(e.documentId),
  };
}

export const toMedication = (m: ServerMemoryItem): Medication => ({
  id: m.key,
  name: m.name,
  dosage: orUndefined(m.detail),
  status: 'recorded',
  startDate: orUndefined(m.firstRecorded),
  sourceDocumentId: lastSource(m),
});

export const toCondition = (c: ServerMemoryItem): Condition => {
  const assertion = /Recorded as (mentioned|reported|diagnosed)/.exec(c.detail ?? '')?.[1] as Condition['assertion'];
  return { id: c.key, name: c.name, status: 'unknown', assertion, notedDate: orUndefined(c.firstRecorded), sourceDocumentId: lastSource(c) };
};

export const toAllergy = (a: ServerMemoryItem): Allergy => ({ id: a.key, substance: a.name, reaction: orUndefined(a.detail), sourceDocumentId: lastSource(a) });
export const toVaccination = (v: ServerMemoryItem): Vaccination => ({ id: v.key, name: v.name, date: orUndefined(v.lastRecorded), sourceDocumentId: lastSource(v) });
export const toProcedure = (p: ServerMemoryItem): Procedure => ({ id: p.key, name: p.name, date: orUndefined(p.lastRecorded), sourceDocumentId: lastSource(p) });

/** Same grouping key as the server: case/punctuation-insensitive name. */
export const metricKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

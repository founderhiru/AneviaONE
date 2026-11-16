import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { SourceAdapter } from './integrations';

/**
 * Apple Health (HealthKit), phase 1: READ-ONLY, ON THIS IPHONE ONLY.
 *
 *  - Reads four things for the last 7 days: steps, sleep, resting heart rate, workouts.
 *  - Nothing read here is uploaded to AneviaONE, stored on a server or sent to an AI provider.
 *    It is shown on screen and kept in memory only.
 *  - It belongs to the person whose iPhone this is: the signed-in account's own record. It is
 *    never shown on, or attached to, a family member's record.
 *  - iOS does not tell an app whether the person allowed reading (by design), so "connected"
 *    means "the person went through Apple's permission sheet from here". Data may still be empty.
 *
 * The native package resolves its module on import, which throws where it isn't built in
 * (Expo Go, Android, unit tests), so it is loaded lazily and its absence reported as unsupported.
 */

type Quantity = { unit: string; quantity: number };
type Stats = { sumQuantity?: Quantity; averageQuantity?: Quantity; startDate?: Date };
type DateFilter = { filter: { date: { startDate: Date; endDate: Date } } };
/** The part of `@kingstinct/react-native-healthkit` this file uses. */
export type HealthKitModule = {
  isHealthDataAvailable(): boolean;
  requestAuthorization(types: { toRead: readonly string[] }): Promise<boolean>;
  queryStatisticsCollectionForQuantity(id: string, stats: readonly string[], anchorDate: Date, interval: { day: number }, options: DateFilter): Promise<readonly Stats[]>;
  queryStatisticsForQuantity(id: string, stats: readonly string[], options: DateFilter): Promise<Stats>;
  queryCategorySamples(id: string, options: DateFilter & { limit: number }): Promise<readonly { value: number; startDate: Date; endDate: Date }[]>;
  queryWorkoutSamples(options: DateFilter & { limit: number }): Promise<readonly unknown[]>;
};

export const APPLE_HEALTH_READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;

/** What each permission is, in the words shown before Apple's own sheet. */
export const APPLE_HEALTH_READS = ['Steps', 'Sleep', 'Resting heart rate', 'Workouts'] as const;

let cached: HealthKitModule | null | undefined;
export function loadHealthKit(): HealthKitModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('@kingstinct/react-native-healthkit') as HealthKitModule;
  } catch {
    cached = null;
  }
  return cached;
}
/** For tests: forget the loaded module. */
export function resetHealthKitForTests(module?: HealthKitModule | null) {
  cached = module;
}

export function isAppleHealthSupported(): boolean {
  const hk = loadHealthKit();
  try {
    return !!hk && hk.isHealthDataAvailable();
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ connection ---

const KEY = 'connected.appleHealth.v1';
type Stored = { userId: string; connectedAt: string };

/** Connected on this iPhone for THIS account (another account on the same phone starts fresh). */
export async function getAppleHealthConnection(userId: string | null | undefined): Promise<{ connectedAt: string } | null> {
  if (!userId) return null;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    const stored = raw ? (JSON.parse(raw) as Stored) : null;
    return stored && stored.userId === userId ? { connectedAt: stored.connectedAt } : null;
  } catch {
    return null;
  }
}

/** Shows Apple's permission sheet. Resolves false when Apple Health can't be used here. */
export async function connectAppleHealth(userId: string, now = new Date()): Promise<boolean> {
  const hk = loadHealthKit();
  if (!hk || !isAppleHealthSupported()) return false;
  // Read only: nothing is ever written to Apple Health.
  await hk.requestAuthorization({ toRead: APPLE_HEALTH_READ_TYPES });
  await SecureStore.setItemAsync(KEY, JSON.stringify({ userId, connectedAt: now.toISOString() } satisfies Stored));
  return true;
}

/**
 * Stops AneviaONE reading and forgets the connection. iOS does not let an app withdraw its own
 * permission; the person does that in the Health app (Sharing → Apps), which the screen says.
 */
export async function disconnectAppleHealth(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

// ---------------------------------------------------------------- reading ---

export type AppleHealthWeek = {
  /** Mean of the days that have a step count; null when there are none. */
  averageSteps: number | null;
  /** Mean sleep per night that has sleep recorded, in minutes; null when there is none. */
  averageSleepMinutes: number | null;
  /** Mean resting heart rate over the week in beats per minute; null when not recorded. */
  restingHeartRate: number | null;
  workouts: number;
  daysWithSteps: number;
  nightsWithSleep: number;
  from: string;
  to: string;
  readAt: string;
};

// HKCategoryValueSleepAnalysis: 1 asleep (unspecified), 3 core, 4 deep, 5 REM. 0 in bed and 2 awake don't count.
const ASLEEP = new Set([1, 3, 4, 5]);

/**
 * Minutes asleep per night. A watch and a phone can both record the same night, so overlapping
 * stretches are merged before they are added up. A night is named by the day it ends on.
 */
export function sleepMinutesByNight(samples: readonly { value: number; startDate: Date; endDate: Date }[]): Map<string, number> {
  const spans = samples
    .filter((s) => ASLEEP.has(s.value) && s.endDate > s.startDate)
    .map((s) => [s.startDate.getTime(), s.endDate.getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  const nights = new Map<string, number>();
  for (const [start, end] of merged) {
    const night = dayKey(new Date(end));
    nights.set(night, (nights.get(night) ?? 0) + (end - start) / 60000);
  }
  return nights;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** Reads the last 7 days from Apple Health. Each part fails on its own: one refusal never hides the rest. */
export async function readAppleHealthWeek(now = new Date()): Promise<AppleHealthWeek | null> {
  const hk = loadHealthKit();
  if (!hk || !isAppleHealthSupported()) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const options: DateFilter = { filter: { date: { startDate: start, endDate: now } } };

  const [steps, heart, sleep, workouts] = await Promise.all([
    hk.queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], start, { day: 1 }, options).catch(() => [] as readonly Stats[]),
    hk.queryStatisticsForQuantity('HKQuantityTypeIdentifierRestingHeartRate', ['discreteAverage'], options).catch(() => ({}) as Stats),
    hk.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { ...options, limit: 0 }).catch(() => []),
    hk.queryWorkoutSamples({ ...options, limit: 0 }).catch(() => []),
  ]);

  const stepDays = steps.map((d) => d.sumQuantity?.quantity).filter((n): n is number => typeof n === 'number' && n > 0);
  const nights = [...sleepMinutesByNight(sleep).values()].filter((m) => m > 0);
  const hr = heart.averageQuantity;
  // Only a beats-per-minute value is shown as one; any other unit is left out, never converted by guess.
  const restingHeartRate = hr && hr.unit === 'count/min' && Number.isFinite(hr.quantity) ? Math.round(hr.quantity) : null;
  const avgSteps = mean(stepDays);
  const avgSleep = mean(nights);

  return {
    averageSteps: avgSteps === null ? null : Math.round(avgSteps),
    averageSleepMinutes: avgSleep === null ? null : Math.round(avgSleep),
    restingHeartRate,
    workouts: workouts.length,
    daysWithSteps: stepDays.length,
    nightsWithSleep: nights.length,
    from: start.toISOString(),
    to: now.toISOString(),
    readAt: now.toISOString(),
  };
}

export function formatSleep(minutes: number | null): string | null {
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/** The registered adapter for the Connected Health source list (see integrations.ts). */
export function appleHealthAdapter(userId: string): SourceAdapter {
  return {
    id: 'apple_health',
    connect: async () => {
      await connectAppleHealth(userId);
    },
    disconnect: disconnectAppleHealth,
    lastSyncedAt: async () => (await getAppleHealthConnection(userId))?.connectedAt ?? null,
  };
}

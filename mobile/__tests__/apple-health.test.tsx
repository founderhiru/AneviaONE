/**
 * Apple Health, phase 1: read-only, on this iPhone, for the signed-in person's own record.
 * The native package is replaced by a fake; nothing here touches a server.
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { AppleHealthCard } from '../components/connected/AppleHealthCard';
import type { AppleHealthState } from '../hooks/useAppleHealth';
import {
  APPLE_HEALTH_READ_TYPES,
  connectAppleHealth,
  disconnectAppleHealth,
  formatSleep,
  getAppleHealthConnection,
  isAppleHealthSupported,
  readAppleHealthWeek,
  resetHealthKitForTests,
  sleepMinutesByNight,
  type HealthKitModule,
} from '../services/connected/appleHealth';
import { renderWithProviders } from './testUtils';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);
const NOW = at(16, 9);

function fakeKit(over: Partial<HealthKitModule> = {}): HealthKitModule {
  return {
    isHealthDataAvailable: () => true,
    requestAuthorization: jest.fn(async () => true),
    queryStatisticsCollectionForQuantity: jest.fn(async () => [{ sumQuantity: { unit: 'count', quantity: 6000 } }, { sumQuantity: { unit: 'count', quantity: 8000 } }, {}, { sumQuantity: { unit: 'count', quantity: 0 } }]),
    queryStatisticsForQuantity: jest.fn(async () => ({ averageQuantity: { unit: 'count/min', quantity: 61.6 } })),
    queryCategorySamples: jest.fn(async () => [
      { value: 3, startDate: at(14, 23), endDate: at(15, 3) },
      { value: 4, startDate: at(15, 3), endDate: at(15, 6) },
      { value: 2, startDate: at(15, 6), endDate: at(15, 6, 30) },
      { value: 1, startDate: at(15, 23, 30), endDate: at(16, 5, 30) },
    ]),
    queryWorkoutSamples: jest.fn(async () => [{}, {}, {}]),
    ...over,
  };
}

afterEach(async () => {
  resetHealthKitForTests(undefined);
  await disconnectAppleHealth();
});

describe('reading', () => {
  it('is unsupported when the native package is not in the build', () => {
    resetHealthKitForTests(null);
    expect(isAppleHealthSupported()).toBe(false);
  });

  it('asks to read only the four types, and never to write', async () => {
    const kit = fakeKit();
    resetHealthKitForTests(kit);
    expect(await connectAppleHealth('user-1', NOW)).toBe(true);
    expect(kit.requestAuthorization).toHaveBeenCalledWith({ toRead: APPLE_HEALTH_READ_TYPES });
    expect(APPLE_HEALTH_READ_TYPES).toHaveLength(4);
  });

  it('merges overlapping sleep from two devices and leaves out awake and in-bed time', () => {
    const nights = sleepMinutesByNight([
      { value: 3, startDate: at(14, 23), endDate: at(15, 5) },
      { value: 1, startDate: at(15, 1), endDate: at(15, 6) }, // a second device, overlapping
      { value: 0, startDate: at(14, 22), endDate: at(15, 7) }, // in bed
      { value: 2, startDate: at(15, 6), endDate: at(15, 7) }, // awake
    ]);
    expect([...nights.values()]).toEqual([7 * 60]);
  });

  it('summarises the week from what was recorded, skipping empty days', async () => {
    resetHealthKitForTests(fakeKit());
    const week = await readAppleHealthWeek(NOW);
    expect(week).toMatchObject({ averageSteps: 7000, daysWithSteps: 2, averageSleepMinutes: 390, nightsWithSleep: 2, restingHeartRate: 62, workouts: 3 });
    expect(formatSleep(week!.averageSleepMinutes)).toBe('6 h 30 min');
  });

  it('shows nothing it cannot stand behind: refused parts are empty, odd units are not converted', async () => {
    resetHealthKitForTests(
      fakeKit({
        queryStatisticsCollectionForQuantity: jest.fn(async () => { throw new Error('denied'); }),
        queryStatisticsForQuantity: jest.fn(async () => ({ averageQuantity: { unit: 'count/s', quantity: 1 } })),
        queryCategorySamples: jest.fn(async () => []),
        queryWorkoutSamples: jest.fn(async () => []),
      }),
    );
    expect(await readAppleHealthWeek(NOW)).toMatchObject({ averageSteps: null, averageSleepMinutes: null, restingHeartRate: null, workouts: 0 });
  });
});

describe('connection', () => {
  it('belongs to the account that connected on this iPhone, and is forgotten on disconnect', async () => {
    resetHealthKitForTests(fakeKit());
    await connectAppleHealth('user-1', NOW);
    expect(await getAppleHealthConnection('user-1')).toEqual({ connectedAt: NOW.toISOString() });
    expect(await getAppleHealthConnection('user-2')).toBeNull();
    expect(await getAppleHealthConnection(null)).toBeNull();
    await disconnectAppleHealth();
    expect(await getAppleHealthConnection('user-1')).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});

const state = (over: Partial<AppleHealthState> = {}): AppleHealthState => ({ offered: true, connected: false, week: null, busy: false, error: null, connect: jest.fn(async () => undefined), disconnect: jest.fn(async () => undefined), refresh: jest.fn(async () => undefined), ...over });

describe('AppleHealthCard', () => {
  it('on a family member’s record there is nothing to connect and nothing shown', async () => {
    const s = state({ connected: true, week: { averageSteps: 7000, averageSleepMinutes: 390, restingHeartRate: 62, workouts: 3, daysWithSteps: 2, nightsWithSleep: 2, from: '', to: '', readAt: NOW.toISOString() } });
    await renderWithProviders(<AppleHealthCard state={s} ownRecord={false} personName="Dad" />);
    expect(screen.getByTestId('apple-health-other-person')).toBeTruthy();
    expect(screen.queryByTestId('apple-health-connect')).toBeNull();
    expect(screen.queryByTestId('apple-health-week')).toBeNull();
    expect(screen.queryByText('Connected')).toBeNull();
  });

  it('explains what is read and where it stays before Apple’s own sheet', async () => {
    const s = state();
    await renderWithProviders(<AppleHealthCard state={s} ownRecord />);
    await fireEvent.press(screen.getByTestId('apple-health-connect'));
    expect(s.connect).not.toHaveBeenCalled();
    expect(screen.getByText('Steps · Sleep · Resting heart rate · Workouts')).toBeTruthy();
    expect(screen.getByText('It is not uploaded to AneviaONE and not stored on our servers.')).toBeTruthy();
    expect(screen.getByText('It is never sent to an AI provider.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('apple-health-consent-continue'));
    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it('shows the week, says No data plainly, and disconnects only after a second tap', async () => {
    const s = state({ connected: true, week: { averageSteps: 7000, averageSleepMinutes: null, restingHeartRate: 62, workouts: 0, daysWithSteps: 2, nightsWithSleep: 0, from: '', to: '', readAt: NOW.toISOString() } });
    await renderWithProviders(<AppleHealthCard state={s} ownRecord />);
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('7,000')).toBeTruthy();
    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.queryByText(/\b(low|high|normal|should)\b/i)).toBeNull();
    await fireEvent.press(screen.getByTestId('apple-health-disconnect'));
    expect(s.disconnect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('apple-health-disconnect-confirm'));
    expect(s.disconnect).toHaveBeenCalledTimes(1);
  });
});

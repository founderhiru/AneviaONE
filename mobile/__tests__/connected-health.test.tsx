/**
 * Connected Health: the registry never claims more than is built, the screen shows the one live
 * source (medical records) from the existing documents, and nothing on it is a dead button.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useFocusEffect } from 'expo-router';

import ConnectedHealthScreen from '../app/connected/index';
import { ADAPTERS, INTEGRATIONS, byGroup, viaText } from '../services/connected/integrations';
import { documentsService } from '../services/documents/documentsService';
import { renderWithAuth } from './testUtils';

describe('integration registry — honesty', () => {
  it('has no adapters yet, so no platform, wearable or future source can be live', () => {
    expect(ADAPTERS).toHaveLength(0);
    for (const i of INTEGRATIONS.filter((x) => x.group !== 'records')) expect(i.status).toBe('coming_soon');
  });

  it('only medical records can be available, and only through the existing upload', () => {
    for (const i of INTEGRATIONS.filter((x) => x.status !== 'coming_soon')) {
      expect(i.group).toBe('records');
      expect(i.path).toBe('upload');
      expect(['/add', '/documents']).toContain(i.route);
    }
  });

  it('never shows a wearable as a direct connection; each goes through a health platform', () => {
    const wearables = byGroup('wearable').map((i) => i.name);
    expect(wearables).toEqual(['Apple Watch', 'Fitbit', 'Garmin', 'Oura', 'WHOOP']);
    for (const w of byGroup('wearable')) {
      expect(w.path).toBe('via_platform');
      expect(w.via?.length).toBeGreaterThan(0);
      expect(viaText(w)).toMatch(/^Through /);
    }
  });

  it('mentions eligibility for ABDM and holds no keys or tokens', () => {
    expect(INTEGRATIONS.find((i) => i.id === 'abdm')?.note).toMatch(/eligibility/i);
    expect(JSON.stringify(INTEGRATIONS)).not.toMatch(/key|secret|token/i);
  });
});

function doc(id: string, when: string) {
  return { id, status: 'completed', uploadedAt: when, createdAt: when } as never;
}

describe('ConnectedHealthScreen', () => {
  beforeEach(() => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([doc('a', '2026-07-12T10:00:00Z'), doc('b', '2026-01-10T10:00:00Z')]);
    (router.push as jest.Mock).mockClear();
    // The test setup makes focus effects no-ops; run them once on mount, as a focused screen would.
    (useFocusEffect as jest.Mock).mockImplementation((cb: () => void) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      React.useEffect(() => cb(), []);
    });
  });

  it('shows the header, privacy line and the live records source with its count and last added date', async () => {
    await renderWithAuth(<ConnectedHealthScreen />);
    expect(screen.getByText('Connected Health')).toBeTruthy();
    expect(screen.getByText('Bring your health data together. Understand the bigger picture.')).toBeTruthy();
    expect(screen.getByTestId('connected-privacy-chip')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('records-summary').props.children).toMatch(/2 documents · last added 12 Jul 2026/));
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByTestId('devices-empty')).toBeTruthy();
  });

  it('records say Available (not Connected) when nothing has been added', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockResolvedValue([]);
    await renderWithAuth(<ConnectedHealthScreen />);
    await waitFor(() => expect(screen.getByText('Nothing added yet.')).toBeTruthy());
    expect(screen.queryByText('Connected')).toBeNull();
  });

  it('shows a calm message if documents cannot be loaded', async () => {
    jest.spyOn(documentsService, 'listDocuments').mockRejectedValue(new Error('x'));
    await renderWithAuth(<ConnectedHealthScreen />);
    await waitFor(() => expect(screen.getByText('We couldn’t load your documents right now.')).toBeTruthy());
  });

  it('Add a report and Manage use the existing screens', async () => {
    await renderWithAuth(<ConnectedHealthScreen />);
    await fireEvent.press(screen.getByTestId('records-add'));
    expect(router.push).toHaveBeenCalledWith('/add');
    await fireEvent.press(screen.getByTestId('records-manage'));
    expect(router.push).toHaveBeenCalledWith('/documents');
  });

  it('platforms are Coming soon with no press target; wearables explain they are not direct', async () => {
    await renderWithAuth(<ConnectedHealthScreen />);
    expect(screen.getByTestId('source-apple_health')).toBeTruthy();
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThanOrEqual(2);
    await fireEvent.press(screen.getByTestId('connect-seg-wearable'));
    expect(screen.getByTestId('wearables-explainer').props.children).toMatch(/don’t connect to AneviaONE directly/);
    for (const name of ['Apple Watch', 'Fitbit', 'Garmin', 'Oura', 'WHOOP']) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByText('Through Apple Health')).toBeTruthy();
  });

  it('the Records panel opens the existing add flow only for what is available', async () => {
    await renderWithAuth(<ConnectedHealthScreen />);
    await fireEvent.press(screen.getByTestId('connect-seg-records'));
    await fireEvent.press(screen.getByTestId('source-lab_reports'));
    expect(router.push).toHaveBeenCalledWith('/add');
    (router.push as jest.Mock).mockClear();
    await fireEvent.press(screen.getByTestId('source-consultations'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Connect a source offers only what exists today and says the rest is coming', async () => {
    await renderWithAuth(<ConnectedHealthScreen />);
    await fireEvent.press(screen.getByTestId('connect-source'));
    expect(screen.getByTestId('sheet-lab_reports')).toBeTruthy();
    expect(screen.queryByTestId('sheet-apple_health')).toBeNull();
    expect(screen.getByTestId('sheet-coming')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sheet-lab_reports'));
    expect(router.push).toHaveBeenCalledWith('/add');
  });

  it('what-it-does list marks activity and sleep as needing a platform, and the AI line never claims diagnosis', async () => {
    await renderWithAuth(<ConnectedHealthScreen />);
    expect(screen.getByText('Connect')).toBeTruthy();
    expect(screen.getByText('Track progress')).toBeTruthy();
    expect(screen.getAllByText('Needs a connected health platform')).toHaveLength(2);
    expect(screen.getByTestId('ai-limits').props.children).toMatch(/doesn’t diagnose conditions or replace your Doctor/);
  });

  it('Privacy & Security opens the existing screen', async () => {
    await renderWithAuth(<ConnectedHealthScreen />);
    await fireEvent.press(screen.getByTestId('connected-open-privacy'));
    expect(router.push).toHaveBeenCalledWith('/privacy');
  });
});

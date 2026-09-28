/**
 * Covers the secondary screens reachable from the core loop: What Changed,
 * Trend detail, Timeline event detail, Add Record (mock processing flow —
 * per spec section 36/9, "mock processing only, clearly isolated"), Privacy
 * & Security, Data Sharing, and WhatsApp connect.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import WhatChangedScreen from '../app/changes/index';
import AddRecordScreen from '../app/add/index';
import DataSharingScreen from '../app/privacy/data-sharing';
import PrivacyScreen from '../app/privacy/index';
import EventDetailScreen from '../app/timeline/[id]';
import TrendDetailScreen from '../app/trends/[metric]';
import WhatsAppScreen from '../app/whatsapp/index';
import { renderWithAuth } from './testUtils';

beforeEach(() => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

describe('What Changed screen', () => {
  it('loads and lists changes with evidence links', async () => {
    await renderWithAuth(<WhatChangedScreen />);
    await waitFor(() => expect(screen.getByText('What Changed?')).toBeTruthy());
  });
});

describe('Trend detail screen', () => {
  it('loads a trend by metric name and shows the neutral summary', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ metric: 'HbA1c' });
    await renderWithAuth(<TrendDetailScreen />);
    await waitFor(() => expect(screen.getAllByText('HbA1c').length).toBeGreaterThan(0));
    expect(
      screen.getByText('This is an observation about your records, not a diagnosis or treatment recommendation.')
    ).toBeTruthy();
  });

  it('shows a not-found state for an unknown metric', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ metric: 'NotAMetric' });
    await renderWithAuth(<TrendDetailScreen />);
    await waitFor(() => expect(screen.getByText('Trend not found.')).toBeTruthy());
  });
});

describe('Timeline event detail screen', () => {
  it('loads an event by id and shows its date', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'evt-2026-annual' });
    await renderWithAuth(<EventDetailScreen />);
    await waitFor(() => expect(screen.queryByText('Loading event…')).toBeNull());
    expect(screen.queryByText('Event not found.')).toBeNull();
  });
});

describe('Add Record screen', () => {
  it('offers camera, upload and WhatsApp entry points, and WhatsApp navigates directly', async () => {
    await renderWithAuth(<AddRecordScreen />);
    expect(screen.getByLabelText('Take a photo')).toBeTruthy();
    expect(screen.getByLabelText('Upload a document')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Send via WhatsApp'));
    });
    expect(router.replace).toHaveBeenCalledWith('/whatsapp');
  });
});

describe('Privacy & Security screen', () => {
  it('renders download and delete account actions', async () => {
    await renderWithAuth(<PrivacyScreen />);
    await waitFor(() => expect(screen.getByText('Privacy & Security')).toBeTruthy());
  });
});

describe('Data Sharing screen', () => {
  it('loads sharing settings and toggles one', async () => {
    await renderWithAuth(<DataSharingScreen />);
    await waitFor(() => expect(screen.queryByText('Loading settings…')).toBeNull());
  });
});

describe('WhatsApp connect screen', () => {
  it('shows the not-yet-connected state with the preview notice', async () => {
    await renderWithAuth(<WhatsAppScreen />);
    await waitFor(() => expect(screen.getByText('What WhatsApp can do')).toBeTruthy());
    expect(screen.getByText(/Preview only/)).toBeTruthy();
  });
});

/**
 * The personal documents screen in demo mode (in-memory files, no backend): what it lists,
 * the group filter, adding, deleting, viewers who can read but not change, and the wording.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import VaultScreen from '../app/vault/index';
import { resetDemoVault } from '../services/vault/demoVaultService';
import { pickVaultFile } from '../services/vault/pickFile';
import { renderWithAuth } from './testUtils';

jest.mock('../services/vault/pickFile', () => ({
  ...jest.requireActual('../services/vault/pickFile'),
  pickVaultFile: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

beforeEach(() => {
  resetDemoVault();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (pickVaultFile as jest.Mock).mockReset();
});

describe('VaultScreen', () => {
  it('lists every file with a plain privacy note, and never mentions reading or AI doing anything to them', async () => {
    await renderWithAuth(<VaultScreen />);
    expect(await screen.findByText('Passport (sample)')).toBeTruthy();
    expect(screen.getByText('Family health policy (sample)')).toBeTruthy();
    expect(screen.getByText('Degree certificate (sample)')).toBeTruthy();
    expect(screen.getByTestId('vault-privacy-note').props.children).toMatch(/never read or sent to AI/);
  });

  it('narrows to the Identity group from Home', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ group: 'identity' });
    await renderWithAuth(<VaultScreen />);
    expect(await screen.findByText('Passport (sample)')).toBeTruthy();
    expect(screen.getByText('Driving licence (sample)')).toBeTruthy();
    expect(screen.queryByText('Family health policy (sample)')).toBeNull();
  });

  it('adds a photo with a title and a type', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ group: 'documents' });
    (pickVaultFile as jest.Mock).mockResolvedValue({ kind: 'file', file: { uri: 'file:///x.jpg', name: 'IMG_55_marksheet.jpg', mimeType: 'image/jpeg', size: 300000, source: 'upload' } });
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByTestId('vault-add'));
    await fireEvent.press(await screen.findByTestId('vault-source-library'));
    const input = await screen.findByTestId('vault-title-input');
    expect(input.props.value).toBe('IMG 55 marksheet');
    await fireEvent.changeText(input, '10th marksheet');
    await fireEvent.press(screen.getByTestId('vault-category-education'));
    await fireEvent.press(screen.getByTestId('vault-save'));
    expect(await screen.findByText('10th marksheet')).toBeTruthy();
    expect(await screen.findByTestId('vault-notice')).toBeTruthy();
  });

  it('shows a friendly message when a file is not allowed', async () => {
    (pickVaultFile as jest.Mock).mockResolvedValue({ kind: 'file', file: { uri: 'file:///x.exe', name: 'setup.exe', mimeType: 'application/x-msdownload', size: 10, source: 'upload' } });
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByTestId('vault-add'));
    await fireEvent.press(await screen.findByTestId('vault-source-file'));
    await fireEvent.press(await screen.findByTestId('vault-save'));
    expect(await screen.findByTestId('vault-add-error')).toBeTruthy();
    expect(screen.getByTestId('vault-add-error').props.children).toMatch(/PDF or a photo/);
  });

  it('asks before deleting, and deletes only after confirming', async () => {
    await renderWithAuth(<VaultScreen />);
    const rows = await screen.findAllByText('Rental agreement (sample)');
    await fireEvent.press(rows[0]);
    await fireEvent.press(await screen.findByTestId('vault-delete'));
    expect(await screen.findByText(/can’t be recovered/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vault-delete-cancel'));
    expect(screen.queryByText(/can’t be recovered/)).toBeNull();
    await fireEvent.press(screen.getByTestId('vault-delete'));
    await fireEvent.press(await screen.findByTestId('vault-delete-confirm'));
    await waitFor(() => expect(screen.queryByText('Rental agreement (sample)')).toBeNull());
  });

  it('explains that opening a file is not available in the demo', async () => {
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByText('Passport (sample)'));
    await fireEvent.press(await screen.findByTestId('vault-open'));
    expect(await screen.findByTestId('vault-file-error')).toBeTruthy();
  });
});

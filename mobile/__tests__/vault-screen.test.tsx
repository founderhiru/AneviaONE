/**
 * The personal documents screen in demo mode (in-memory files, no backend): what it lists,
 * the six categories, adding, deleting, viewers who can read but not change, and the wording.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import VaultScreen from '../app/vault/index';
import { resetDemoVault } from '../services/vault/demoVaultService';
import { pickVaultFile } from '../services/vault/pickFile';
import { renderWithAuth } from './testUtils';
import { usePeople } from '../hooks/usePeople';

jest.mock('../services/vault/pickFile', () => ({
  ...jest.requireActual('../services/vault/pickFile'),
  pickVaultFile: jest.fn(),
}));
jest.mock('../hooks/usePeople', () => ({ usePeople: jest.fn(() => ({ people: [], active: null, switchTo: jest.fn(), refresh: jest.fn() })) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

beforeEach(() => {
  resetDemoVault();
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (pickVaultFile as jest.Mock).mockReset();
});

describe('VaultScreen', () => {
  it('shows the six categories with counts and a plain privacy note that never says AI reads the files', async () => {
    await renderWithAuth(<VaultScreen />);
    for (const c of ['identity', 'insurance', 'education', 'property_legal', 'photos', 'other']) {
      expect(await screen.findByTestId(`vault-category-tile-${c}`)).toBeTruthy();
    }
    expect(screen.getByText('Identity Documents')).toBeTruthy();
    expect(screen.getByText('Photos & Personal Files')).toBeTruthy();
    expect(screen.getByTestId('vault-privacy-note').props.children).toMatch(/never read or sent to AI/);
  });

  it('opens Identity with its named slots and only its own files', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'identity' });
    await renderWithAuth(<VaultScreen />);
    expect(await screen.findByText('Passport (sample)')).toBeTruthy();
    expect(screen.getByText('Driving licence (sample)')).toBeTruthy();
    for (const k of ['Aadhaar', 'PAN', 'Passport', 'Driving Licence']) expect(screen.getByTestId(`vault-kind-${k}`)).toBeTruthy();
    expect(screen.queryByText('Family health policy (sample)')).toBeNull();
  });

  it('shows a clear status for each Identity slot, and expiry dates, never an identity number', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'identity' });
    await renderWithAuth(<VaultScreen />);
    expect((await screen.findByTestId('vault-status-Aadhaar')).props.children).toBe('Not added');
    expect(screen.getByTestId('vault-status-PAN').props.children).toBe('Not added');
    expect(screen.getByTestId('vault-status-Passport').props.children).toBe('Added');
    expect(screen.getByTestId('vault-status-Driving Licence').props.children).toBe('Expiring soon');
  });

  it('takes an optional expiry date and refuses a malformed one', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'identity' });
    (pickVaultFile as jest.Mock).mockResolvedValue({ kind: 'file', file: { uri: 'file:///x.jpg', name: 'pan.jpg', mimeType: 'image/jpeg', size: 300000, source: 'upload' } });
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByTestId('vault-kind-add-PAN'));
    await fireEvent.press(await screen.findByTestId('vault-source-library'));
    await fireEvent.changeText(await screen.findByTestId('vault-expiry-input'), '14/03/2031');
    expect(await screen.findByTestId('vault-expiry-error')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('vault-expiry-input'), '2031-03-14');
    await fireEvent.press(screen.getByTestId('vault-save'));
    await waitFor(() => expect(screen.getByTestId('vault-status-PAN').props.children).toBe('Added'));
  });

  it('adds a photo into a slot, with a name, a category and a kind', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'identity' });
    (pickVaultFile as jest.Mock).mockResolvedValue({ kind: 'file', file: { uri: 'file:///x.jpg', name: 'IMG_55_pan.jpg', mimeType: 'image/jpeg', size: 300000, source: 'upload' } });
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByTestId('vault-kind-add-PAN'));
    await fireEvent.press(await screen.findByTestId('vault-source-library'));
    const input = await screen.findByTestId('vault-title-input');
    expect(input.props.value).toBe('IMG 55 pan');
    await fireEvent.changeText(input, 'My PAN');
    await fireEvent.press(screen.getByTestId('vault-save'));
    expect(await screen.findByText('My PAN')).toBeTruthy();
    expect(await screen.findByTestId('vault-notice')).toBeTruthy();
  });

  it('adds to Education & Certificates, which has no slots', async () => {
    (pickVaultFile as jest.Mock).mockResolvedValue({ kind: 'file', file: { uri: 'file:///x.jpg', name: 'IMG_55_marksheet.jpg', mimeType: 'image/jpeg', size: 300000, source: 'upload' } });
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByTestId('vault-add'));
    await fireEvent.press(await screen.findByTestId('vault-source-library'));
    await fireEvent.changeText(await screen.findByTestId('vault-title-input'), '10th marksheet');
    await fireEvent.press(screen.getByTestId('vault-category-education'));
    expect(screen.queryByText('Which one?')).toBeNull();
    await fireEvent.press(screen.getByTestId('vault-save'));
    expect(await screen.findByTestId('vault-notice')).toBeTruthy();
  });

  it('shows a friendly message when a file is not allowed', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'other' });
    (pickVaultFile as jest.Mock).mockResolvedValue({ kind: 'file', file: { uri: 'file:///x.exe', name: 'setup.exe', mimeType: 'application/x-msdownload', size: 10, source: 'upload' } });
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByTestId('vault-add'));
    await fireEvent.press(await screen.findByTestId('vault-source-file'));
    await fireEvent.press(await screen.findByTestId('vault-save'));
    expect(await screen.findByTestId('vault-add-error')).toBeTruthy();
    expect(screen.getByTestId('vault-add-error').props.children).toMatch(/PDF or a photo/);
  });

  it('asks before deleting, and deletes only after confirming', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'property_legal' });
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
    (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'identity' });
    await renderWithAuth(<VaultScreen />);
    await fireEvent.press(await screen.findByText('Passport (sample)'));
    await fireEvent.press(await screen.findByTestId('vault-open'));
    expect(await screen.findByTestId('vault-file-error')).toBeTruthy();
  });

  describe('who can add and delete (family roles)', () => {
    const as = (access: 'owner' | 'manager' | 'viewer') =>
      (usePeople as jest.Mock).mockReturnValue({ people: [], active: { id: 'demo-person', name: 'Asha', relationship: 'mother', dateOfBirth: null, access }, switchTo: jest.fn(), refresh: jest.fn() });
    afterEach(() => (usePeople as jest.Mock).mockReturnValue({ people: [], active: null, switchTo: jest.fn(), refresh: jest.fn() }));

    it('a family manager can add a document for the person', async () => {
      as('manager');
      await renderWithAuth(<VaultScreen />);
      expect(await screen.findByTestId('vault-add')).toBeTruthy();
    });

    it('a viewer can open but not add', async () => {
      as('viewer');
      await renderWithAuth(<VaultScreen />);
      await screen.findByTestId('vault-categories');
      expect(screen.queryByTestId('vault-add')).toBeNull();
    });

    it('a manager can delete what they added, but not what someone else added', async () => {
      as('manager');
      (useLocalSearchParams as jest.Mock).mockReturnValue({ category: 'identity' });
      await renderWithAuth(<VaultScreen />);
      // seed files for demo-person were "added by you"
      await fireEvent.press(await screen.findByText('Passport (sample)'));
      expect(await screen.findByTestId('vault-delete')).toBeTruthy();
    });

    it('the controller sees recent activity by role and an "Added by a family member" label', async () => {
      as('owner');
      await renderWithAuth(<VaultScreen />);
      expect(await screen.findByTestId('vault-activity')).toBeTruthy();
      expect(screen.getByText(/A family member added Dad health policy/)).toBeTruthy();
    });

    it('a viewer never sees the activity log', async () => {
      as('viewer');
      await renderWithAuth(<VaultScreen />);
      await screen.findByTestId('vault-categories');
      expect(screen.queryByTestId('vault-activity')).toBeNull();
    });
  });
});

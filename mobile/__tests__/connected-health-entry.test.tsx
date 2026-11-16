/** The Me row for Connected Health appears only when the build asks for it. */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { profileService } from '../services/profile/profileService';
import { renderWithAuth } from './testUtils';

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(profileService, 'getMyIdentity').mockResolvedValue({ fullName: null, dateOfBirth: null });
});

let mockEnabled = false;
jest.mock('../config/connectedFlag', () => ({
  get CONNECTED_HEALTH_ENABLED() {
    return mockEnabled;
  },
}));

// eslint-disable-next-line import/first
import Me from '../app/(tabs)/me';

describe('Me → Connected Health row', () => {
  it('is hidden by default', async () => {
    mockEnabled = false;
    await renderWithAuth(<Me />);
    expect(screen.queryByTestId('me-connected')).toBeNull();
  });

  it('opens the page when the flag is on', async () => {
    mockEnabled = true;
    await renderWithAuth(<Me />);
    await fireEvent.press(await screen.findByTestId('me-connected'));
    expect(router.push).toHaveBeenCalledWith('/connected');
  });
});

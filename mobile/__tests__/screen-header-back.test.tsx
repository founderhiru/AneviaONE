/**
 * Regression: the back button on a stacked screen always goes somewhere.
 *
 * Opened directly (a deep link, or a restored screen with nothing beneath
 * it), `router.back()` has no screen to return to and the button did
 * nothing — the person was stuck on e.g. Identity details. With nothing to
 * go back to it now goes Home.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ScreenHeader } from '../components';

const canGoBack = router.canGoBack as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => canGoBack.mockImplementation(() => true));

describe('ScreenHeader back button', () => {
  it('goes back when there is a previous screen', async () => {
    canGoBack.mockReturnValue(true);
    await render(<ScreenHeader title="Identity details" />);
    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('goes Home when the screen was opened directly (nothing to go back to)', async () => {
    canGoBack.mockReturnValue(false);
    await render(<ScreenHeader title="Identity details" />);
    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('still uses a screen\'s own back handler when it has one', async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader title="Report" onBack={onBack} />);
    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
  });
});

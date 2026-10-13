/**
 * The six boxes are display only; the code is typed into one hidden input.
 * That input must take focus when the screen opens and whenever the boxes are
 * tapped — otherwise a person has no way to open the keyboard and type the
 * code (found on the iOS simulator: tapping the boxes did nothing).
 */
import React from 'react';
import { TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { OtpInput } from '../components/OtpInput';

describe('OtpInput', () => {
  it('focuses the code input when the screen opens', async () => {
    await render(<OtpInput value="" onChange={() => {}} />);
    expect(screen.getByTestId('otp-hidden-input').props.autoFocus).toBe(true);
  });

  it('tapping the boxes focuses the code input', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
    await render(<OtpInput value="12" onChange={() => {}} />);
    fireEvent.press(screen.getByTestId('otp-boxes'));
    expect(focus).toHaveBeenCalled();
  });

  it('the boxes are one accessible button that says what tapping does', async () => {
    await render(<OtpInput value="12" onChange={() => {}} />);
    const boxes = screen.getByTestId('otp-boxes');
    expect(boxes.props.accessibilityRole).toBe('button');
    expect(boxes.props.accessibilityLabel).toBe('One time passcode, 2 of 6 digits entered');
    expect(boxes.props.accessibilityHint).toMatch(/keyboard/);
  });
});

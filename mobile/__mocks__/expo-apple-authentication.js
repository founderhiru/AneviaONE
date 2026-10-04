/**
 * Jest stand-in for the native Sign in with Apple module. Availability is
 * switchable per test (`__setAppleAvailableForTests`), and `signInAsync` is
 * a jest.fn tests program with a credential or a cancellation. The button
 * renders as a plain pressable so screens can be driven through it.
 */
const React = require('react');
const { Pressable, Text } = require('react-native');

let available = true;

module.exports = {
  __setAppleAvailableForTests(value) {
    available = value;
  },
  isAvailableAsync: jest.fn(() => Promise.resolve(available)),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationButton: ({ onPress, testID }) =>
    React.createElement(
      Pressable,
      { onPress, testID, accessibilityRole: 'button', accessibilityLabel: 'Continue with Apple' },
      React.createElement(Text, null, 'Continue with Apple')
    ),
};

/**
 * One sign-in UI for the whole app: Welcome's sheet.
 *
 * Welcome holds the only sign-in form (MobileSignInForm): the mobile
 * number with its country selector, Continue, then Google / Apple / Email.
 * Every signed-out entry point opens Welcome (openAuth); Google / Apple /
 * Email continue on their own steps; Mobile continues to the existing code
 * step. No other screen carries a sign-in form.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import LoginScreen from '../app/(auth)/login';
import OtpScreen from '../app/(auth)/otp';
import WelcomeScreen from '../app/(auth)/welcome';
import AskScreen from '../app/explore/ask';
import ChangesScreen from '../app/explore/changes';
import MakeItYoursScreen from '../app/explore/make-it-yours';
import MemoryScreen from '../app/explore/memory';
import TimelineScreen from '../app/explore/timeline';
import { formatInternational, toInternational, DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES } from '../config/phoneCountries';
import { BRAND } from '../config/brand';
import { useSignInMethods } from '../hooks/useSignInMethods';
import { AUTH_ROUTE, authHref } from '../navigation/authRoutes';
import { authService } from '../services/auth/authService';
import { renderWithAuth, renderWithProviders } from './testUtils';

jest.mock('../hooks/useSignInMethods', () => ({ useSignInMethods: jest.fn() }));
const ALL_ON = { email: true, phone: true, google: true, apple: true };
const { __setAppleAvailableForTests } = require('expo-apple-authentication');
const { resetAppleAvailabilityForTests } = require('../services/auth/appleAuth');

/** Where openAuth() takes the person: Welcome, marked as opened from elsewhere. */
const OPENED_AUTH = { pathname: '/(auth)/welcome', params: { from: 'app' } };

beforeEach(() => {
  (useSignInMethods as jest.Mock).mockReturnValue(ALL_ON);
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  (router.canGoBack as jest.Mock).mockReturnValue(true);
  __setAppleAvailableForTests(true);
  resetAppleAvailabilityForTests();
});
afterEach(() => jest.restoreAllMocks());

async function typeNumber(value: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('mobile-number-input'), value);
  });
}

// ------------------------------------------------------- the main screen --

describe('Welcome is the sign-in screen', () => {
  it('shows the brand, then the form directly: Log in or sign up, 🇮🇳 +91 number, Continue, Google | Email, legal', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByTestId('brand-mark', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('brand-wordmark')).toBeTruthy();
    expect(screen.getByLabelText(BRAND.welcomeTagline)).toBeTruthy();
    const sheet = screen.getByTestId('welcome-sheet');
    expect(within(sheet).getByText(`Welcome to ${BRAND.wordmark}`)).toBeTruthy();
    expect(within(sheet).getByText('Log in or sign up')).toBeTruthy();
    expect(within(sheet).getByTestId('phone-country')).toBeTruthy();
    expect(within(sheet).getByTestId('phone-dial-code').props.children).toBe('+91');
    expect(within(sheet).getByTestId('mobile-number-input')).toBeTruthy();
    expect(within(sheet).getByText('Continue')).toBeTruthy();
    expect(await within(sheet).findByTestId('continue-with-google')).toBeTruthy();
    expect(within(sheet).getByTestId('continue-with-email')).toBeTruthy();
    expect(within(sheet).getByTestId('legal-terms')).toBeTruthy();
    expect(within(sheet).getByTestId('legal-privacy')).toBeTruthy();
  });

  it('has no "Continue with Mobile" gateway and no separate Log in / Sign up buttons', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.queryByText('Continue with Mobile')).toBeNull();
    expect(screen.queryByTestId('continue-with-mobile')).toBeNull();
    expect(screen.queryByText(/^(Log in|Sign up)$/)).toBeNull();
    expect(screen.getAllByText('Continue')).toHaveLength(1);
  });

  it('the country selector defaults to India +91 and has an accessible label', async () => {
    await renderWithAuth(<WelcomeScreen />);
    const country = screen.getByTestId('phone-country');
    expect(country.props.accessibilityLabel).toBe('Country: India, +91');
    expect(country.props.accessibilityRole).toBe('button');
    expect(screen.getByText('🇮🇳')).toBeTruthy();
    await fireEvent.press(country);
    expect(screen.getByText('Choose your country')).toBeTruthy();
    for (const c of PHONE_COUNTRIES) expect(screen.getByTestId(`phone-country-${c.iso}`)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('phone-country-IN'));
    expect(screen.getByTestId('phone-country').props.accessibilityLabel).toBe('Country: India, +91');
  });

  it('accepts digits only, at most 10; Continue unlocks only at a full number', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.getByTestId('send-otp').props.accessibilityState.disabled).toBe(true);
    await typeNumber('98765 4321');
    expect(screen.getByTestId('mobile-number-input').props.value).toBe('987654321');
    expect(screen.getByTestId('send-otp').props.accessibilityState.disabled).toBe(true);
    await typeNumber('98765-43210-99');
    expect(screen.getByTestId('mobile-number-input').props.value).toBe('9876543210');
    expect(screen.getByTestId('send-otp').props.accessibilityState.disabled).toBe(false);
  });

  it('Continue shows loading, sends one code to +91…, and opens the existing code step', async () => {
    let finish: (v: { success: true }) => void = () => undefined;
    const send = jest.spyOn(authService, 'sendMobileOtp').mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    await renderWithAuth(<WelcomeScreen />);
    await typeNumber('9876543210');
    await act(async () => {
      fireEvent.press(screen.getByTestId('send-otp'));
    });
    expect(screen.getByTestId('send-otp').props.accessibilityState.busy).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByTestId('send-otp'));
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('+919876543210');
    await act(async () => finish({ success: true }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/(auth)/otp', params: { mobileNumber: '+919876543210' } }));
  });

  it('the honest SMS-unavailable (or network) message is shown, and editing the number clears it', async () => {
    jest.spyOn(authService, 'sendMobileOtp').mockResolvedValue({ success: false, errorMessage: 'Sign-in by SMS isn’t available yet. Please use one of the other options below.' });
    await renderWithAuth(<WelcomeScreen />);
    await typeNumber('9876543210');
    await act(async () => {
      fireEvent.press(screen.getByTestId('send-otp'));
    });
    expect(screen.getByTestId('auth-error').props.children).toBe('Sign-in by SMS isn’t available yet. Please use one of the other options below.');
    expect(router.push).not.toHaveBeenCalled();
    await typeNumber('987654321');
    expect(screen.queryByTestId('auth-error')).toBeNull();
  });

  it('Google and Email open their steps of the same flow', async () => {
    await renderWithAuth(<WelcomeScreen />);
    await fireEvent.press(await screen.findByTestId('continue-with-google'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=google');
    await fireEvent.press(screen.getByTestId('continue-with-email'));
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=email');
  });
});

// ------------------------------------------------------------- one form --

describe('there is exactly one sign-in form', () => {
  const root = path.join(__dirname, '..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : [],
    );
  const sources = [...walk('app'), ...walk('components')];
  const using = (pattern: RegExp) => sources.filter((f) => pattern.test(fs.readFileSync(path.join(root, f), 'utf8'))).sort();

  it('the phone field lives only in the one form, and the form only on Welcome', () => {
    expect(using(/<PhoneNumberField\b/)).toEqual(['components/MobileSignInForm.tsx']);
    expect(using(/<MobileSignInForm\b/)).toEqual(['app/(auth)/welcome.tsx']);
  });

  it('only the form, the Email step and the code step send codes; the old duplicate pieces are gone', () => {
    expect(using(/authService\.send(Mobile|Email)Otp/)).toEqual(['app/(auth)/login.tsx', 'app/(auth)/otp.tsx', 'components/MobileSignInForm.tsx']);
    // login.tsx sends only the Email step's code — its old phone form is gone.
    expect(fs.readFileSync(path.join(root, 'app/(auth)/login.tsx'), 'utf8')).not.toMatch(/sendMobileOtp|mobile-number-input/);
    expect(fs.existsSync(path.join(root, 'components/AuthOptions.tsx'))).toBe(false);
  });

  it('the sign-in route without a method has no form of its own — it goes to Welcome', async () => {
    await renderWithAuth(<LoginScreen />);
    expect(screen.queryByTestId('mobile-number-input')).toBeNull();
    expect(screen.queryByText('Log in or sign up')).toBeNull();
  });
});

// --------------------------------------------------------- entry points --

describe('every signed-out entry point opens Welcome', () => {
  it('the route helper is the single source of the address', () => {
    expect(AUTH_ROUTE).toBe('/(auth)/welcome');
    expect(authHref()).toBe('/(auth)/welcome');
    expect(authHref('email')).toBe('/(auth)/login?method=email');
  });

  it('Make it yours (full screen) has no phone form, and Get started opens Welcome', async () => {
    await renderWithProviders(<MakeItYoursScreen />);
    expect(screen.queryByTestId('mobile-number-input')).toBeNull();
    expect(screen.queryByTestId('phone-country')).toBeNull();
    await fireEvent.press(screen.getByTestId('make-it-yours-get-started'));
    expect(router.push).toHaveBeenCalledWith(OPENED_AUTH);
  });

  it.each([
    ['Memory', MemoryScreen],
    ['Changes', ChangesScreen],
    ['Timeline', TimelineScreen],
    ['Ask', AskScreen],
  ])('%s → Make it yours → Get started opens Welcome', async (_name, Screen) => {
    await renderWithProviders(<Screen />);
    expect(screen.queryByTestId('mobile-number-input')).toBeNull();
    await fireEvent.press(screen.getByText('Get started'));
    expect(router.push).toHaveBeenCalledWith(OPENED_AUTH);
  });
});

// ------------------------------------------------------------------ Back --

describe('Back', () => {
  it('opened from another screen, Welcome shows Back, which returns there', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ from: 'app' });
    await renderWithAuth(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('auth-back'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('at launch (not opened from anywhere) Welcome has no Back', async () => {
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.queryByTestId('auth-back')).toBeNull();
  });

  it('with nothing to go back to, no Back is shown even if marked as opened', async () => {
    (router.canGoBack as jest.Mock).mockReturnValue(false);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ from: 'app' });
    await renderWithAuth(<WelcomeScreen />);
    expect(screen.queryByTestId('auth-back')).toBeNull();
  });
});

// ----------------------------------------------------------- code step --

describe('Verify your number — the existing code step', () => {
  it('names the number in full international form, offers Verify and Change mobile number', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ mobileNumber: '+919876543210' });
    await renderWithAuth(<OtpScreen />);
    expect(screen.getByText('Verify your number')).toBeTruthy();
    expect(screen.getByText('We sent a 6-digit code to\n+91 98765 43210')).toBeTruthy();
    expect(screen.getByText('Verify code')).toBeTruthy();
    expect(screen.getByText('Resend code in 30s')).toBeTruthy();
    await fireEvent.press(screen.getByText('Change mobile number'));
    expect(router.back).toHaveBeenCalled();
  });

  it('never logs the code or any token', async () => {
    const logs = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error'), jest.spyOn(console, 'info')];
    (useLocalSearchParams as jest.Mock).mockReturnValue({ mobileNumber: '+919876543210' });
    await renderWithAuth(<OtpScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('otp-hidden-input'), '482913');
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    for (const spy of logs) {
      const output = JSON.stringify(spy.mock.calls);
      expect(output).not.toContain('482913');
      expect(output).not.toMatch(/access_token|refresh_token|eyJ[A-Za-z0-9_-]{10,}/);
    }
  });
});

describe('phone number helpers', () => {
  it('builds and formats international numbers from the country list', () => {
    expect(DEFAULT_PHONE_COUNTRY.dialCode).toBe('+91');
    expect(toInternational('9876543210', DEFAULT_PHONE_COUNTRY)).toBe('+919876543210');
    expect(toInternational('98765', DEFAULT_PHONE_COUNTRY)).toBeNull();
    expect(formatInternational('+919876543210')).toBe('+91 98765 43210');
    expect(formatInternational('+15555550100')).toBe('+15555550100');
  });
});

// ----------------------------------------------------------------- Apple --

describe('Apple — offered only as a real, working provider', () => {
  it('Google | Email while the provider is off; Google | Apple | Email once it is on', async () => {
    (useSignInMethods as jest.Mock).mockReturnValue({ ...ALL_ON, apple: false });
    const off = await renderWithAuth(<WelcomeScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getAllByTestId(/^continue-with-/).map((b) => b.props.testID)).toEqual(['continue-with-google', 'continue-with-email']);
    await off.unmount();

    (useSignInMethods as jest.Mock).mockReturnValue(ALL_ON);
    await renderWithAuth(<WelcomeScreen />);
    await screen.findByTestId('continue-with-apple');
    expect(screen.getAllByTestId(/^continue-with-/).map((b) => b.props.testID)).toEqual([
      'continue-with-google',
      'continue-with-apple',
      'continue-with-email',
    ]);
  });

  it('when on, Apple has the standard Apple logo in the same round treatment as Google and Email', async () => {
    await renderWithAuth(<WelcomeScreen />);
    const apple = await screen.findByTestId('continue-with-apple');
    const google = screen.getByTestId('continue-with-google');
    expect(apple.props.accessibilityLabel).toBe('Continue with Apple');
    expect(screen.getByTestId('apple-logo', { includeHiddenElements: true })).toBeTruthy();
    const look = (el: typeof apple) => {
      const style = Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean));
      return { width: style.width, height: style.height, borderRadius: style.borderRadius, backgroundColor: style.backgroundColor, borderColor: style.borderColor };
    };
    expect(look(apple)).toEqual(look(google));
    await fireEvent.press(apple);
    expect(router.push).toHaveBeenCalledWith('/(auth)/login?method=apple');
  });

  it('the Apple step signs in only when the provider is on', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'apple' });
    await renderWithAuth(<LoginScreen />);
    expect(await screen.findByTestId('apple-signin-continue')).toBeTruthy();
  });

  it('with the provider off, the Apple step says so and offers no Apple button (never a silent failure)', async () => {
    (useSignInMethods as jest.Mock).mockReturnValue({ ...ALL_ON, apple: false });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ method: 'apple' });
    const signIn = jest.spyOn(authService, 'signInWithApple');
    await renderWithAuth(<LoginScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('Sign in with Apple isn’t available yet. Please continue with your mobile number, Google or email.')).toBeTruthy();
    expect(screen.queryByTestId('apple-signin-continue')).toBeNull();
    await fireEvent.press(screen.getByTestId('auth-cancel'));
    expect(router.back).toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('while the provider setting is still unknown, nothing Apple is offered', async () => {
    (useSignInMethods as jest.Mock).mockReturnValue(null);
    await renderWithAuth(<WelcomeScreen />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByTestId('continue-with-apple')).toBeNull();
  });
});

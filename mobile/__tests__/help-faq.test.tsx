/**
 * Me → Help & FAQ: the shared FAQ content (shared/faq.ts, also used by the
 * website), the Help & FAQ screen's accordion, topic filtering (Data &
 * Security), Terms, navigation from Me, and Reduce Motion handling.
 */
import React from 'react';
import { AccessibilityInfo, LayoutAnimation } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { FAQ_CATEGORIES, FAQ_ENTRIES, PRODUCT_TOKEN } from '../../shared/faq';
import MeScreen from '../app/(tabs)/me';
import HelpFaqScreen from '../app/help/index';
import TermsScreen from '../app/help/terms';
import { BRAND } from '../config/brand';
import { mobileFaq } from '../config/faq';
import { renderWithAuth, renderWithProviders } from './testUtils';

beforeEach(() => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Lets the async Reduce Motion lookup resolve and re-render. */
const flushReduceMotion = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('shared FAQ content', () => {
  it('has unique ids and sort orders, and only known categories', () => {
    const ids = FAQ_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const orders = FAQ_ENTRIES.map((e) => e.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    const categories = new Set(FAQ_CATEGORIES.map((c) => c.id));
    FAQ_ENTRIES.forEach((e) => expect(categories.has(e.category)).toBe(true));
  });

  it('never hard-codes the product name — it uses the brand token', () => {
    const text = JSON.stringify([FAQ_CATEGORIES, FAQ_ENTRIES]);
    expect(text).not.toContain(BRAND.productName);
    expect(text).not.toMatch(/anevia/i);
  });

  it('avoids unsupported or exaggerated claims', () => {
    const text = FAQ_ENTRIES.flatMap((e) => [e.question, ...e.answer]).join(' ');
    expect(text).not.toMatch(/medical-grade|100%|guarantee|HIPAA|GDPR|SOC 2|ISO 27001|end-to-end|clinically (proven|validated)/i);
  });

  it('gives the app the 14 priority questions, in order, with the brand filled in', () => {
    const entries = mobileFaq();
    expect(entries.map((e) => e.id)).toEqual([
      'what-is',
      'what-can-i-do',
      'storage',
      'understand-reports',
      'what-changed',
      'ask',
      'diagnose',
      'how-ai-works',
      'private',
      'whatsapp',
      'delete',
      'export',
      'platforms',
      'help',
    ]);
    const text = JSON.stringify(entries);
    expect(text).not.toContain(PRODUCT_TOKEN);
    expect(entries[0].question).toBe(`What is ${BRAND.productName}?`);
  });

  it('labels capabilities that are not available yet', () => {
    const byId = Object.fromEntries(mobileFaq().map((e) => [e.id, e]));
    for (const id of ['understand-reports', 'what-changed', 'ask', 'delete', 'export', 'platforms']) {
      expect(byId[id].statusLabel).toBe('Not yet available');
    }
    expect(byId.whatsapp.statusLabel).toBe('Preview only');
    expect(byId['what-can-i-do'].statusLabel).toBe('Partly available');
  });
});

describe('Me screen → Help & legal', () => {
  it('links to Help & FAQ, Privacy & Security, Data & Security and Terms', async () => {
    await renderWithAuth(<MeScreen />);
    await waitFor(() => expect(screen.getByText('Help & FAQ')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Help & FAQ'));
    });
    expect(router.push).toHaveBeenCalledWith('/help');

    await act(async () => {
      fireEvent.press(screen.getByText('Data & Security'));
    });
    expect(router.push).toHaveBeenCalledWith({ pathname: '/help', params: { topic: 'data-security' } });

    await act(async () => {
      fireEvent.press(screen.getByText('Terms of Service'));
    });
    expect(router.push).toHaveBeenCalledWith('/help/terms');

    await act(async () => {
      fireEvent.press(screen.getByText('Privacy & Security'));
    });
    expect(router.push).toHaveBeenCalledWith('/privacy');
  });

  it('does not offer a Contact/Support row while no support channel exists', async () => {
    await renderWithAuth(<MeScreen />);
    await waitFor(() => expect(screen.getByText('Help & FAQ')).toBeTruthy());
    expect(screen.queryByText(/contact|support/i)).toBeNull();
  });
});

describe('Help & FAQ screen', () => {
  it('lists every mobile question with answers collapsed', async () => {
    await renderWithProviders(<HelpFaqScreen />);
    expect(screen.getByText('Help & FAQ')).toBeTruthy();
    for (const entry of mobileFaq()) {
      expect(screen.getByText(entry.question)).toBeTruthy();
      expect(screen.queryByTestId(`faq-answer-${entry.id}`)).toBeNull();
    }
  });

  it('opens and closes an answer, exposing the expanded state', async () => {
    await renderWithProviders(<HelpFaqScreen />);
    const question = screen.getByTestId('faq-question-diagnose');
    expect(question.props.accessibilityState).toEqual({ expanded: false });

    await act(async () => {
      fireEvent.press(question);
    });
    expect(screen.getByTestId('faq-question-diagnose').props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByText(/does not diagnose conditions, prescribe medication/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('faq-question-diagnose'));
    });
    expect(screen.getByTestId('faq-question-diagnose').props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByTestId('faq-answer-diagnose')).toBeNull();
  });

  it('goes back with the header back button', async () => {
    await renderWithProviders(<HelpFaqScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Go back'));
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('shows only data & security questions for the Data & Security topic', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ topic: 'data-security' });
    await renderWithProviders(<HelpFaqScreen />);
    expect(screen.getByText('Data & Security')).toBeTruthy();
    expect(screen.getByText('Is my health information private?')).toBeTruthy();
    expect(screen.getByText('Can I export my data?')).toBeTruthy();
    expect(screen.queryByText('How does WhatsApp work with ' + BRAND.productName + '?')).toBeNull();
  });

  it('ignores an unknown topic and shows the full FAQ', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ topic: 'nope' });
    await renderWithProviders(<HelpFaqScreen />);
    expect(screen.getByText('Help & FAQ')).toBeTruthy();
    expect(screen.getAllByTestId(/^faq-question-/)).toHaveLength(mobileFaq().length);
  });

  it('links to Privacy & Security and Terms', async () => {
    await renderWithProviders(<HelpFaqScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('Terms of Service'));
    });
    expect(router.push).toHaveBeenCalledWith('/help/terms');
  });

  it('animates the expand when Reduce Motion is off', async () => {
    const configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    await renderWithProviders(<HelpFaqScreen />);
    await flushReduceMotion();
    await act(async () => {
      fireEvent.press(screen.getByTestId('faq-question-what-is'));
    });
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('faq-answer-what-is')).toBeTruthy();
  });

  it('opens instantly, without animation, when Reduce Motion is on', async () => {
    const configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => undefined);
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await renderWithProviders(<HelpFaqScreen />);
    await flushReduceMotion();
    await act(async () => {
      fireEvent.press(screen.getByTestId('faq-question-what-is'));
    });
    expect(configureNext).not.toHaveBeenCalled();
    expect(screen.getByTestId('faq-answer-what-is')).toBeTruthy();
  });
});

describe('Terms screen', () => {
  it('says plainly that the Terms are not published yet', async () => {
    await renderWithProviders(<TermsScreen />);
    expect(screen.getByText('Terms of Service')).toBeTruthy();
    expect(screen.getByText(/will be published before/)).toBeTruthy();
  });
});

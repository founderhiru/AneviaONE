/**
 * The category-first Home (build setting; off by default). Pure rules are tested directly;
 * the screen is rendered in demo mode (in-memory data, no backend).
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { HomeCategories } from '../components/home/HomeCategories';
import RemindersScreen from '../app/reminders/index';
import { familyBadge, HOME_CATEGORIES, lifeBadge, visibleCategories } from '../services/home/categories';
import { resetDemoObligations } from '../services/obligations/demoObligationsService';
import { renderWithAuth } from './testUtils';

beforeEach(() => resetDemoObligations());

describe('home categories rules', () => {
  it('shows the folder tiles only when the personal documents folder is switched on', () => {
    expect(visibleCategories(false).map((c) => c.key)).toEqual(['health', 'family', 'life']);
    expect(visibleCategories(true).map((c) => c.key)).toEqual(['health', 'identity', 'family', 'documents', 'insurance', 'life']);
    expect(HOME_CATEGORIES.every((c) => c.vault !== true || c.route.startsWith('/vault'))).toBe(true);
  });

  it('never promises to read, verify or extract anything from a file', () => {
    const text = JSON.stringify(HOME_CATEGORIES).toLowerCase();
    for (const banned of ['extract', 'recogni', 'verified', 'automatic', 'scan and', 'ai ']) expect(text).not.toContain(banned);
  });

  it('describes reminders with counts only', () => {
    expect(lifeBadge({ overdue: 2, soon: 1, total: 5 })).toEqual({ text: '2 overdue', tone: 'danger' });
    expect(lifeBadge({ overdue: 0, soon: 3, total: 5 })).toEqual({ text: '3 due soon', tone: 'neutral' });
    expect(lifeBadge({ overdue: 0, soon: 0, total: 2 })).toEqual({ text: '2 coming up', tone: 'neutral' });
    expect(lifeBadge({ overdue: 0, soon: 0, total: 0 })).toBeNull();
  });

  it('counts the people on the Family tile', () => {
    expect(familyBadge(1)).toBeNull();
    expect(familyBadge(2)?.text).toBe('You and 1 other');
    expect(familyBadge(3)?.text).toBe('You and 2 others');
  });
});

describe('HomeCategories screen', () => {
  it('shows the three category tiles and no reminders panel', async () => {
    await renderWithAuth(<HomeCategories />);
    expect(await screen.findByText('Your life. Your intelligence.')).toBeTruthy();
    expect(screen.getByTestId('home-category-health')).toBeTruthy();
    expect(screen.getByTestId('home-category-family')).toBeTruthy();
    expect(screen.getByTestId('home-category-life')).toBeTruthy();
    expect(screen.queryByTestId('coming-up')).toBeNull();
  });

  it('shows a count on Life Management but never a reminder title', async () => {
    await renderWithAuth(<HomeCategories />);
    expect(await screen.findByTestId('home-category-life-badge')).toBeTruthy();
    expect(screen.queryByText('Repeat thyroid test')).toBeNull();
  });

  it('opens the screen behind each tile', async () => {
    await renderWithAuth(<HomeCategories />);
    await fireEvent.press(await screen.findByTestId('home-category-health'));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/health');
    await fireEvent.press(screen.getByTestId('home-category-family'));
    expect(router.push).toHaveBeenCalledWith('/family');
    await fireEvent.press(screen.getByTestId('home-category-life'));
    expect(router.push).toHaveBeenCalledWith('/reminders');
  });
});

describe('Life Management screen', () => {
  it('shows every reminder, with add', async () => {
    await renderWithAuth(<RemindersScreen />);
    expect(await screen.findByText('Follow-up visit with Doctor')).toBeTruthy();
    expect(screen.getByTestId('coming-up-add')).toBeTruthy();
  });
});

/**
 * The "Coming up" card on Home, in demo mode (in-memory reminders, no backend):
 * what it shows, adding a reminder, finishing and snoozing one, and viewers who can
 * read but not change.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ComingUp } from '../components/home/ComingUp';
import { renderWithProviders } from './testUtils';
import { resetDemoObligations } from '../services/obligations/demoObligationsService';

beforeEach(() => resetDemoObligations());

describe('ComingUp', () => {
  it('lists reminders soonest first with plain wording', async () => {
    await renderWithProviders(<ComingUp subjectId="demo-person" canEdit />);
    expect(await screen.findByText('Repeat thyroid test')).toBeTruthy();
    expect(screen.getByText('Blood pressure medicine refill')).toBeTruthy();
    expect(screen.getByText('Renew family health insurance')).toBeTruthy();
    expect(screen.getByText(/^Overdue by 2 days/)).toBeTruthy();
    expect(screen.getByText(/^In 4 days/)).toBeTruthy();
    // Only the first three are shown until the person asks for more; capital-D Doctor is in the fourth.
    expect(screen.queryByText('Follow-up visit with Doctor')).toBeNull();
    await fireEvent.press(screen.getByTestId('coming-up-toggle'));
    expect(await screen.findByText('Follow-up visit with Doctor')).toBeTruthy();
  });

  it('shows whose reminders these are when viewing a relative', async () => {
    await renderWithProviders(<ComingUp subjectId="demo-person" canEdit forName="Father" />);
    expect(await screen.findByText('Coming up · Father')).toBeTruthy();
  });

  it('adds a reminder from a title, a type and a quick date', async () => {
    await renderWithProviders(<ComingUp subjectId="demo-person" canEdit />);
    await screen.findByText('Repeat thyroid test');
    await fireEvent.press(screen.getByTestId('coming-up-add'));

    expect((await screen.findByTestId('coming-up-save')).props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('coming-up-title-input'), '  Renew   car insurance ');
    await fireEvent.press(screen.getByTestId('coming-up-kind-renewal'));
    await fireEvent.press(screen.getByTestId('coming-up-due-week'));
    await waitFor(() => expect(screen.getByTestId('coming-up-save').props.accessibilityState?.disabled).toBeFalsy());
    await fireEvent.press(screen.getByTestId('coming-up-save'));

    // Four are due already; the new one lands after them, so expand to see it.
    await waitFor(() => expect(screen.getByTestId('coming-up-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('coming-up-toggle'));
    expect(await screen.findByText('Renew car insurance')).toBeTruthy();
  });

  it('will not save without a title or a date', async () => {
    await renderWithProviders(<ComingUp subjectId="demo-person" canEdit />);
    await screen.findByText('Repeat thyroid test');
    await fireEvent.press(screen.getByTestId('coming-up-add'));
    await fireEvent.changeText(await screen.findByTestId('coming-up-title-input'), 'Renew passport');
    expect(screen.getByTestId('coming-up-save').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('coming-up-title-input'), '   ');
    await fireEvent.press(screen.getByTestId('coming-up-due-week'));
    await waitFor(() => expect(screen.getByTestId('coming-up-due-week').props.accessibilityState?.selected).toBe(true));
    expect(screen.getByTestId('coming-up-save').props.accessibilityState?.disabled).toBe(true);
  });

  it('marks a reminder done and it leaves the list', async () => {
    await renderWithProviders(<ComingUp subjectId="demo-person" canEdit />);
    await screen.findByText('Repeat thyroid test');
    const done = screen.getAllByText('Done')[0];
    await fireEvent.press(done);
    await waitFor(() => expect(screen.queryByText('Repeat thyroid test')).toBeNull());
    expect(screen.getByText('Blood pressure medicine refill')).toBeTruthy();
  });

  it('snoozes a reminder for a week: it is hidden now', async () => {
    await renderWithProviders(<ComingUp subjectId="demo-person" canEdit />);
    await screen.findByText('Blood pressure medicine refill');
    const snooze = screen.getAllByText('Snooze 1 week')[1];
    await fireEvent.press(snooze);
    await waitFor(() => expect(screen.queryByText('Blood pressure medicine refill')).toBeNull());
  });

  it('lets a viewer read reminders but not change them', async () => {
    await renderWithProviders(<ComingUp subjectId="demo-person" canEdit={false} />);
    expect(await screen.findByText('Repeat thyroid test')).toBeTruthy();
    expect(screen.queryByTestId('coming-up-add')).toBeNull();
    expect(screen.queryAllByText('Done')).toHaveLength(0);
    expect(screen.queryAllByText('Snooze 1 week')).toHaveLength(0);
  });

  it('shows nothing before a person is chosen', async () => {
    await renderWithProviders(<ComingUp subjectId={null} canEdit />);
    expect(screen.queryByTestId('coming-up')).toBeNull();
  });
});

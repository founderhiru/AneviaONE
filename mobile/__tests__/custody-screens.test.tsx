/**
 * Account deletion and removing a person: no silent deletion (every person you look after needs a
 * typed-name decision first), no silent hand-over, a legal hold blocks plainly, and notices are short.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import DeleteAccountScreen from '../app/privacy/delete-account';
import FamilyScreen from '../app/family/index';
import { NoticesCard } from '../components/home/NoticesCard';
import { usePeople } from '../hooks/usePeople';
import { custodyService, type DeletionPlan } from '../services/custody/custodyService';
import { ServiceError } from '../services/serviceError';
import { peopleService } from '../services/people/peopleService';
import { renderWithAuth } from './testUtils';

jest.mock('../services/custody/custodyService', () => ({
  ...jest.requireActual('../services/custody/custodyService'),
  custodyService: { getPlan: jest.fn(), confirmDeletion: jest.fn(), cancelDeletion: jest.fn(), removePerson: jest.fn(), listNotices: jest.fn(), markNoticeRead: jest.fn() },
}));
jest.mock('../hooks/usePeople', () => ({ usePeople: jest.fn() }));

const svc = custodyService as jest.Mocked<typeof custodyService>;
const person = (over = {}) => ({ subjectId: 's1', name: 'Ravi Kumar', relationship: 'father', vaultFiles: 2, healthReports: 1, otherPeopleWithAccess: 1, legalHold: false, deleteConfirmed: false, ...over });
const plan = (people: ReturnType<typeof person>[], over: Partial<DeletionPlan> = {}): DeletionPlan => ({ people, unresolved: people.filter((p) => !p.deleteConfirmed).length, blockedByLegalHold: false, ...over });

beforeEach(() => Object.values(svc).forEach((f) => (f as jest.Mock).mockReset()));

describe('Delete account: the people you look after', () => {
  it('shows nothing extra when you look after nobody, and deleting is possible', async () => {
    svc.getPlan.mockResolvedValue(plan([]));
    await renderWithAuth(<DeleteAccountScreen />);
    await waitFor(() => expect(svc.getPlan).toHaveBeenCalled());
    expect(screen.queryByTestId('delete-account-custody')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('delete-account-confirm-input'), 'DELETE');
    expect(screen.getByTestId('delete-account-submit').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('blocks deletion until each person has a typed-name decision, with counts and no hand-over option', async () => {
    svc.getPlan.mockResolvedValue(plan([person()]));
    await renderWithAuth(<DeleteAccountScreen />);
    expect(await screen.findByTestId('delete-account-custody')).toBeTruthy();
    expect(screen.getByText(/2 documents · 1 health report · 1 other person can see their records/)).toBeTruthy();
    expect(screen.queryByText(/transfer/i)).toBeNull();
    expect(screen.getByText(/isn’t\s*available yet|isn&rsquo;t\s*available yet|available yet/)).toBeTruthy();
    expect(screen.getByTestId('delete-account-confirm-input').props.editable).toBe(false);
    expect(screen.getByTestId('delete-account-submit').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('delete-account-keep')).toBeTruthy();
  });

  it('records the decision only after their name is typed, then allows the account deletion', async () => {
    svc.getPlan.mockResolvedValueOnce(plan([person()])).mockResolvedValue(plan([person({ deleteConfirmed: true })]));
    svc.confirmDeletion.mockResolvedValue(undefined);
    await renderWithAuth(<DeleteAccountScreen />);
    await fireEvent.press(await screen.findByTestId('custody-delete-s1'));
    expect(screen.getByTestId('custody-confirm-s1').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('custody-typed-s1'), 'Ravi Kumar');
    await fireEvent.press(screen.getByTestId('custody-confirm-s1'));
    await waitFor(() => expect(svc.confirmDeletion).toHaveBeenCalledWith('s1', 'Ravi Kumar'));
    expect(await screen.findByTestId('custody-decided-s1')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('delete-account-confirm-input').props.editable).toBe(true));
  });

  it('shows the refusal when the name does not match, and records nothing', async () => {
    svc.getPlan.mockResolvedValue(plan([person()]));
    svc.confirmDeletion.mockRejectedValue(new ServiceError('invalid_input', 'That doesn’t match their name. Type it exactly as shown.'));
    await renderWithAuth(<DeleteAccountScreen />);
    await fireEvent.press(await screen.findByTestId('custody-delete-s1'));
    await fireEvent.changeText(screen.getByTestId('custody-typed-s1'), 'Rav');
    await fireEvent.press(screen.getByTestId('custody-confirm-s1'));
    expect((await screen.findByTestId('custody-error-s1')).props.children).toMatch(/doesn’t match/);
    expect(screen.queryByTestId('custody-decided-s1')).toBeNull();
  });

  it('a decision can be undone', async () => {
    svc.getPlan.mockResolvedValueOnce(plan([person({ deleteConfirmed: true })])).mockResolvedValue(plan([person()]));
    svc.cancelDeletion.mockResolvedValue(undefined);
    await renderWithAuth(<DeleteAccountScreen />);
    await fireEvent.press(await screen.findByTestId('custody-undo-s1'));
    await waitFor(() => expect(svc.cancelDeletion).toHaveBeenCalledWith('s1'));
    expect(await screen.findByTestId('custody-delete-s1')).toBeTruthy();
  });

  it('a legal hold is explained and blocks the account deletion', async () => {
    svc.getPlan.mockResolvedValue(plan([person({ legalHold: true })], { blockedByLegalHold: true }));
    await renderWithAuth(<DeleteAccountScreen />);
    expect(await screen.findByTestId('delete-account-hold')).toBeTruthy();
    expect(screen.getByTestId('custody-hold-s1')).toBeTruthy();
    expect(screen.queryByTestId('custody-delete-s1')).toBeNull();
    expect(screen.getByTestId('delete-account-submit').props.accessibilityState?.disabled).toBe(true);
  });

  it('if the plan cannot be loaded, deletion is not offered and the reason is shown', async () => {
    svc.getPlan.mockRejectedValue(new ServiceError('unknown', 'We couldn’t load the people you look after. Please try again.'));
    await renderWithAuth(<DeleteAccountScreen />);
    expect(await screen.findByTestId('delete-account-plan-error')).toBeTruthy();
    expect(screen.getByTestId('delete-account-submit').props.accessibilityState?.disabled).toBe(true);
  });
});

describe('Family: remove a person you look after', () => {
  const dad = { id: 's1', name: 'Ravi Kumar', relationship: 'father', dateOfBirth: null, access: 'owner' as const };
  const me = { id: 'me', name: 'Asha', relationship: 'self', dateOfBirth: null, access: 'owner' as const };
  beforeEach(() => {
    (usePeople as jest.Mock).mockReturnValue({ people: [me, dad], active: me, switchTo: jest.fn(), refresh: jest.fn(async () => [me, dad]) });
    jest.spyOn(peopleService, 'listAccess').mockResolvedValue([]);
  });

  it('offers removal for a relative only, and needs their name typed', async () => {
    await renderWithAuth(<FamilyScreen />);
    expect(await screen.findByTestId('family-remove-person-s1')).toBeTruthy();
    expect(screen.queryByTestId('family-remove-person-me')).toBeNull();
    await fireEvent.press(screen.getByTestId('family-remove-person-s1'));
    expect(screen.getByTestId('family-remove-person-confirm-s1').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('family-remove-person-name-s1'), 'Ravi Kumar');
    svc.confirmDeletion.mockResolvedValue(undefined);
    svc.removePerson.mockResolvedValue(undefined);
    await fireEvent.press(screen.getByTestId('family-remove-person-confirm-s1'));
    await waitFor(() => expect(svc.removePerson).toHaveBeenCalledWith('s1'));
    expect(svc.confirmDeletion).toHaveBeenCalledWith('s1', 'Ravi Kumar');
    expect(svc.confirmDeletion.mock.invocationCallOrder[0]).toBeLessThan(svc.removePerson.mock.invocationCallOrder[0]);
  });

  it('does not remove anyone when the name is wrong', async () => {
    svc.confirmDeletion.mockRejectedValue(new ServiceError('invalid_input', 'That doesn’t match their name. Type it exactly as shown.'));
    await renderWithAuth(<FamilyScreen />);
    await fireEvent.press(await screen.findByTestId('family-remove-person-s1'));
    await fireEvent.changeText(screen.getByTestId('family-remove-person-name-s1'), 'Ravi');
    await fireEvent.press(screen.getByTestId('family-remove-person-confirm-s1'));
    expect(await screen.findByText(/doesn’t match/)).toBeTruthy();
    expect(svc.removePerson).not.toHaveBeenCalled();
  });

  it('shows why when health reports must go first', async () => {
    svc.confirmDeletion.mockResolvedValue(undefined);
    svc.removePerson.mockRejectedValue(new ServiceError('has_health_reports', 'Delete their health reports first, then remove them.'));
    await renderWithAuth(<FamilyScreen />);
    await fireEvent.press(await screen.findByTestId('family-remove-person-s1'));
    await fireEvent.changeText(screen.getByTestId('family-remove-person-name-s1'), 'Ravi Kumar');
    await fireEvent.press(screen.getByTestId('family-remove-person-confirm-s1'));
    expect(await screen.findByText(/health reports first/)).toBeTruthy();
  });
});

describe('Notices', () => {
  it('shows an unread notice without health content and dismisses it', async () => {
    svc.listNotices.mockResolvedValue([{ id: 'n1', code: 'access_ended_account_deleted', subjectName: 'Ravi', createdAt: '2026-11-12T00:00:00Z', read: false }]);
    svc.markNoticeRead.mockResolvedValue(undefined);
    await renderWithAuth(<NoticesCard />);
    expect((await screen.findByTestId('notice-n1')).props.children).toBe('Your access to Ravi’s records ended because an account was deleted.');
    await fireEvent.press(screen.getByTestId('notice-dismiss-n1'));
    await waitFor(() => expect(screen.queryByTestId('notice-n1')).toBeNull());
    expect(svc.markNoticeRead).toHaveBeenCalledWith('n1');
  });

  it('renders nothing when there is nothing to say', async () => {
    svc.listNotices.mockResolvedValue([]);
    await renderWithAuth(<NoticesCard />);
    await waitFor(() => expect(svc.listNotices).toHaveBeenCalled());
    expect(screen.queryByTestId('notices')).toBeNull();
  });
});

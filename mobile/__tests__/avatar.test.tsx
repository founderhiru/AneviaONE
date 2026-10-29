import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { Avatar, initialsFor } from '../components/Avatar';

describe('avatar initials', () => {
  it('uses first and last initial of a full name', () => {
    expect(initialsFor('Hiranya Talukdar')).toBe('HT');
    expect(initialsFor('  asha   k   rao ')).toBe('AR');
  });
  it('uses one letter for a single name', () => {
    expect(initialsFor('Hiranya')).toBe('H');
  });
  it('shows nothing for a missing or non-letter name — never a question mark or an email fragment', () => {
    expect(initialsFor(undefined)).toBeNull();
    expect(initialsFor('')).toBeNull();
    expect(initialsFor('   ')).toBeNull();
    expect(initialsFor('1234 5678')).toBeNull();
  });
  it('renders initials when there is a name, and a person icon (no text) when there is not', async () => {
    const { unmount } = await render(<Avatar name="Hiranya Talukdar" />);
    expect(screen.getByText('HT')).toBeTruthy();
    unmount();
    await render(<Avatar />);
    expect(screen.queryByText('?')).toBeNull();
    expect(screen.toJSON()).toBeTruthy();
  });
});

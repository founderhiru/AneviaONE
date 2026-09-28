import React from 'react';

import { LoadingState, ScreenContainer } from '../components';

/**
 * Root entry route. The actual destination (Welcome, Onboarding, or Home)
 * is decided by the redirect effect in `app/_layout.tsx` based on auth
 * state, so this screen only needs to render briefly while that resolves.
 */
export default function IndexScreen() {
  return (
    <ScreenContainer scroll={false}>
      <LoadingState fullScreen />
    </ScreenContainer>
  );
}

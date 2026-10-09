import React from 'react';

import { EmptyState, ScreenContainer, ScreenHeader } from '../../components';
import { PRODUCT_TERMS } from '../../config/brand';

/** Route placeholder only — full family functionality is out of scope for
 * this MVP, per spec, but the route exists so the architecture supports it
 * later without restructuring navigation. */
export default function FamilyScreen() {
  return (
    <ScreenContainer>
      <ScreenHeader title={PRODUCT_TERMS.familyHealth} />
      <EmptyState
        title="Coming soon"
        description="Manage health records for the people you care for, all in one place."
      />
    </ScreenContainer>
  );
}

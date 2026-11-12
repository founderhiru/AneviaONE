import React from 'react';

import { ScreenContainer, ScreenHeader } from '../../components';
import { ComingUp } from '../../components/home/ComingUp';
import { isDemoMode } from '../../config/appMode';
import { usePeople } from '../../hooks/usePeople';

/**
 * Life Management: the reminders for the person on screen (renewals, refills,
 * follow-ups). It is the same list as Home's "Coming up", given a screen of its own.
 */
export default function RemindersScreen() {
  const { active } = usePeople();
  const subjectId = active?.id ?? (isDemoMode ? 'demo-person' : null);
  const canEdit = active ? active.access !== 'viewer' : isDemoMode;
  const forName = active && active.relationship !== 'self' ? active.name.split(' ')[0] : null;
  return (
    <ScreenContainer>
      <ScreenHeader title="Life Management" />
      <ComingUp subjectId={subjectId} canEdit={canEdit} forName={forName} defaultExpanded />
    </ScreenContainer>
  );
}

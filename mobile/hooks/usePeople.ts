import { useCallback, useEffect, useState } from 'react';

import { onActiveSubjectChanged, onPeopleChanged } from '../services/people/activeSubject';
import { getActivePerson, getCachedPeople, peopleService } from '../services/people/peopleService';

/** The people on this account and whose records are on screen. Re-renders when either changes. */
export function usePeople() {
  const [, bump] = useState(0);
  useEffect(() => {
    const rerender = () => bump((n) => n + 1);
    const offActive = onActiveSubjectChanged(rerender);
    const offPeople = onPeopleChanged(rerender);
    return () => {
      offActive();
      offPeople();
    };
  }, []);
  const refresh = useCallback(() => peopleService.refresh(), []);
  return { people: getCachedPeople(), active: getActivePerson(), switchTo: peopleService.switchTo, refresh };
}

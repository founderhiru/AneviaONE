import { useEffect, useRef } from 'react';

import { onHealthMemoryChanged } from '../services/health/healthMemoryApi';

/** Runs `reload` whenever a report finishes reading (new trusted records). */
export function useHealthMemoryUpdates(reload: () => void) {
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });
  useEffect(() => onHealthMemoryChanged(() => latest.current()), []);
}

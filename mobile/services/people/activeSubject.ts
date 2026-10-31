/**
 * Whose records the app is showing right now.
 *
 * `null` means "no person chosen" (demo mode, or the account has not been
 * migrated yet): reads are then not narrowed, exactly as before. Once the
 * people list has loaded the app always has a person — by default the
 * signed-in person themselves — and every read of health records is limited
 * to that one person, so a relative's results can never mix into yours.
 *
 * Kept in this tiny module (no imports) so any service can read it without
 * import cycles.
 */

let activeId: string | null = null;
const listeners = new Set<() => void>();

export function getActiveSubjectId(): string | null {
  return activeId;
}

/** Returns true if the active person changed. */
export function setActiveSubjectId(id: string | null): boolean {
  if (id === activeId) return false;
  activeId = id;
  listeners.forEach((listener) => listener());
  return true;
}

export function onActiveSubjectChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const peopleListeners = new Set<() => void>();

/** The list of people (or someone's access to it) changed. */
export function emitPeopleChanged() {
  peopleListeners.forEach((listener) => listener());
}

export function onPeopleChanged(listener: () => void): () => void {
  peopleListeners.add(listener);
  return () => {
    peopleListeners.delete(listener);
  };
}

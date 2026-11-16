import type { Medication } from '../../types';

/** DEMO MODE ONLY: medicines typed in during this session, kept in memory. */
let added: Medication[] = [];
let counter = 0;

export const demoMedicationStore = {
  list: (): Medication[] => added.filter((m) => m.status !== undefined),
  add(fields: Omit<Medication, 'id' | 'recordId' | 'origin'>): string {
    counter += 1;
    const id = `demo-med-${counter}`;
    added = [...added, { ...fields, id, recordId: id, origin: 'user_entered' }];
    return id;
  },
  update(recordId: string, fields: Partial<Medication>): boolean {
    if (!added.some((m) => m.recordId === recordId)) return false;
    added = added.map((m) => (m.recordId === recordId ? { ...m, ...fields, origin: 'user_corrected' } : m));
    return true;
  },
  remove(recordId: string): boolean {
    const before = added.length;
    added = added.filter((m) => m.recordId !== recordId);
    return added.length < before;
  },
  reset() {
    added = [];
    counter = 0;
  },
};

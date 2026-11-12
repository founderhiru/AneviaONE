import { getActivePerson, isOwnRecord } from '../people/peopleService';

/** True when the person on screen is the account holder's own record (the database then fills in who it is for). */
export function isOwnRecordFor(subjectId: string): boolean {
  const person = getActivePerson();
  return person !== null && person.id === subjectId && isOwnRecord(person);
}

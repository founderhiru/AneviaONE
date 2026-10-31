import { isDemoMode } from '../../config/appMode';
import { ServiceError, toServiceError } from '../serviceError';
import { getSupabaseClient } from '../supabaseClient';
import { emitPeopleChanged, getActiveSubjectId, setActiveSubjectId } from './activeSubject';

/**
 * The people whose records this account can see: the person themselves, any
 * relative they manage, and anyone who has approved them. Every change goes
 * through a server function — the app cannot write these tables directly.
 */

export type Relationship = 'mother' | 'father' | 'spouse' | 'child' | 'sibling' | 'grandparent' | 'other';
export const RELATIONSHIPS: { value: Relationship; label: string }[] = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'other', label: 'Other' },
];

export type Person = {
  id: string;
  name: string;
  relationship: 'self' | Relationship;
  dateOfBirth: string | null;
  /** owner: their own record or a relative they created. manager/viewer: shared with them. */
  access: 'owner' | 'manager' | 'viewer';
};

export type AccessEntry = {
  grantId: string;
  name: string;
  role: 'manager' | 'viewer';
  status: 'requested' | 'active';
  requestedAt: string;
  expiresAt: string | null;
};

type SubjectRow = { id: string; display_name: string; relationship: Person['relationship']; date_of_birth: string | null; linked_user_id: string | null; created_by: string };
type GrantRow = { subject_id: string; role: 'manager' | 'viewer'; status: string; expires_at: string | null };

const LOAD_FAILED = 'We couldn’t load the people on your account. Please try again.';
const ACTION_FAILED = 'That didn’t go through. Nothing was changed — please try again.';

/** Messages for the refusals a person can act on; everything else stays generic. */
function friendly(error: unknown): ServiceError {
  const message = String((error as { message?: unknown })?.message ?? '');
  if (/too many attempts/i.test(message)) return new ServiceError('unknown', 'Too many attempts. Please wait a while and try again.');
  if (/too many open invites/i.test(message)) return new ServiceError('unknown', 'There are already five open invites for this person. Wait for one to be used or to expire.');
  if (/too many relatives/i.test(message)) return new ServiceError('unknown', 'You have reached the limit of people you can add.');
  return toServiceError(error, { code: 'unknown', userMessage: ACTION_FAILED, retryable: true });
}

export interface PeopleService {
  /** Loads the list and, if nobody is chosen yet, chooses the signed-in person. */
  refresh(): Promise<Person[]>;
  switchTo(id: string): void;
  createRelative(input: { name: string; relationship: Relationship; dateOfBirth: string | null; authorityConfirmed: boolean }): Promise<string>;
  createInvite(subjectId: string, role: 'manager' | 'viewer'): Promise<string>;
  /** Returns false for a code that does not work. */
  redeemInvite(code: string): Promise<boolean>;
  listAccess(subjectId: string): Promise<AccessEntry[]>;
  approve(grantId: string, expiresAt?: string | null): Promise<void>;
  revoke(grantId: string): Promise<void>;
}

let cached: Person[] = [];
export const getCachedPeople = (): Person[] => cached;
export const getActivePerson = (): Person | null => cached.find((p) => p.id === getActiveSubjectId()) ?? null;
/** The signed-in person's own record: the only one reports can be added to from here. */
export const isOwnRecord = (p: Person | null): boolean => p === null || (p.relationship === 'self' && p.access === 'owner');

export const productionPeopleService: PeopleService = {
  async refresh() {
    const client = getSupabaseClient();
    if (!client) return [];
    const { data: session } = await client.auth.getSession();
    const me = session.session?.user.id;
    if (!me) return [];

    const [subjects, grants] = await Promise.all([
      client.from('subjects').select('id, display_name, relationship, date_of_birth, linked_user_id, created_by').order('created_at', { ascending: true }),
      client.from('subject_access').select('subject_id, role, status, expires_at').eq('grantee_user_id', me).eq('status', 'active'),
    ]);
    // Before the family tables exist for this account there is nobody to switch between:
    // leave the app exactly as it was (reads are not narrowed).
    if (subjects.error || grants.error) {
      cached = [];
      setActiveSubjectId(null);
      return [];
    }
    const now = Date.now();
    const roleFor = new Map<string, 'manager' | 'viewer'>(
      ((grants.data ?? []) as GrantRow[]).filter((g) => !g.expires_at || Date.parse(g.expires_at) > now).map((g) => [g.subject_id, g.role]),
    );
    const people = ((subjects.data ?? []) as SubjectRow[]).map<Person>((s) => ({
      id: s.id,
      name: s.display_name,
      relationship: s.relationship,
      dateOfBirth: s.date_of_birth,
      access: s.linked_user_id === me || s.created_by === me ? 'owner' : (roleFor.get(s.id) ?? 'viewer'),
    }));
    // Own record first, then relatives, then people who shared theirs.
    const rank = (p: Person) => (p.relationship === 'self' && p.access === 'owner' ? 0 : p.access === 'owner' ? 1 : 2);
    people.sort((a, b) => rank(a) - rank(b));
    cached = people;

    const current = getActiveSubjectId();
    if (!current || !people.some((p) => p.id === current)) setActiveSubjectId(people[0]?.id ?? null);
    emitPeopleChanged();
    return people;
  },

  switchTo(id) {
    if (cached.some((p) => p.id === id)) setActiveSubjectId(id);
  },

  async createRelative({ name, relationship, dateOfBirth, authorityConfirmed }) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', ACTION_FAILED);
    const { data, error } = await client.rpc('create_relative', {
      p_name: name.trim(),
      p_relationship: relationship,
      p_date_of_birth: dateOfBirth,
      p_authority_confirmed: authorityConfirmed,
    });
    if (error || typeof data !== 'string') throw friendly(error);
    await productionPeopleService.refresh();
    return data;
  },

  async createInvite(subjectId, role) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', ACTION_FAILED);
    const { data, error } = await client.rpc('create_access_invite', { p_subject: subjectId, p_role: role });
    if (error || typeof data !== 'string') throw friendly(error);
    return data;
  },

  async redeemInvite(code) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', ACTION_FAILED);
    const { data, error } = await client.rpc('redeem_access_invite', { p_code: code });
    if (error) throw friendly(error);
    return typeof data === 'string';
  },

  async listAccess(subjectId) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', LOAD_FAILED);
    const { data, error } = await client.rpc('list_subject_access', { p_subject: subjectId });
    if (error) throw toServiceError(error, { code: 'unknown', userMessage: LOAD_FAILED, retryable: true });
    return ((data ?? []) as { grant_id: string; grantee_name: string; role: 'manager' | 'viewer'; status: 'requested' | 'active'; requested_at: string; expires_at: string | null }[]).map((r) => ({
      grantId: r.grant_id,
      name: r.grantee_name,
      role: r.role,
      status: r.status,
      requestedAt: r.requested_at,
      expiresAt: r.expires_at,
    }));
  },

  async approve(grantId, expiresAt = null) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', ACTION_FAILED);
    const { error } = await client.rpc('approve_access', { p_grant: grantId, p_expires_at: expiresAt });
    if (error) throw friendly(error);
  },

  async revoke(grantId) {
    const client = getSupabaseClient();
    if (!client) throw new ServiceError('not_configured', ACTION_FAILED);
    const { error } = await client.rpc('revoke_access', { p_grant: grantId });
    if (error) throw friendly(error);
    await productionPeopleService.refresh();
  },
};

/** Demo mode has one person and no sharing. */
const demoPeopleService: PeopleService = {
  refresh: async () => [],
  switchTo: () => undefined,
  createRelative: async () => { throw new ServiceError('not_configured', 'Not available in the demo.'); },
  createInvite: async () => { throw new ServiceError('not_configured', 'Not available in the demo.'); },
  redeemInvite: async () => false,
  listAccess: async () => [],
  approve: async () => undefined,
  revoke: async () => undefined,
};

export const peopleService: PeopleService = isDemoMode ? demoPeopleService : productionPeopleService;

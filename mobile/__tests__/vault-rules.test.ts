import {
  categoryInfo,
  CATEGORY_LABEL,
  parseCategory,
  validKind,
  VAULT_CATEGORIES,
  expectedVaultPath,
  formatSize,
  MAX_VAULT_BYTES,
  cleanVaultTitle,
  titleFromFilename,
  validateVaultFile,
  addedByFor,
  canDeleteVaultFile,
  activityText,
  ADDED_BY_LABEL,
} from '../services/vault/vaultRules';

describe('validateVaultFile', () => {
  it('accepts a PDF and photos', () => {
    expect(validateVaultFile({ name: 'policy.pdf', mimeType: 'application/pdf', size: 1000 })).toEqual({ ok: true, mimeType: 'application/pdf' });
    expect(validateVaultFile({ name: 'a.jpg', mimeType: 'image/jpeg', size: 1000 })).toEqual({ ok: true, mimeType: 'image/jpeg' });
    expect(validateVaultFile({ name: 'a.png', mimeType: 'image/png', size: 1000 })).toEqual({ ok: true, mimeType: 'image/png' });
    expect(validateVaultFile({ name: 'a.heic', mimeType: 'image/heif', size: 1000 })).toEqual({ ok: true, mimeType: 'image/heic' });
  });
  it('trusts the name when the picker gives a vague type', () => {
    expect(validateVaultFile({ name: 'Passport.JPEG', mimeType: 'application/octet-stream', size: 10 })).toEqual({ ok: true, mimeType: 'image/jpeg' });
    expect(validateVaultFile({ name: 'scan.pdf', mimeType: null, size: 10 })).toEqual({ ok: true, mimeType: 'application/pdf' });
  });
  it('refuses other types, empty files and files over 20 MB', () => {
    expect(validateVaultFile({ name: 'a.exe', mimeType: 'application/x-msdownload', size: 10 }).ok).toBe(false);
    expect(validateVaultFile({ name: 'a.docx', mimeType: null, size: 10 }).ok).toBe(false);
    expect(validateVaultFile({ name: 'a.pdf', mimeType: 'application/pdf', size: 0 }).ok).toBe(false);
    expect(validateVaultFile({ name: 'a.pdf', mimeType: 'application/pdf', size: MAX_VAULT_BYTES + 1 }).ok).toBe(false);
    expect(validateVaultFile({ name: 'a.pdf', mimeType: 'application/pdf', size: MAX_VAULT_BYTES }).ok).toBe(true);
  });
});

describe('titles and categories', () => {
  it('turns a file name into a starting title', () => {
    expect(titleFromFilename('IMG_2041_passport.JPG')).toBe('IMG 2041 passport');
    expect(titleFromFilename('/tmp/cache/Health-policy.pdf')).toBe('Health policy');
    expect(titleFromFilename('')).toBe('Document');
    expect(titleFromFilename('x'.repeat(300) + '.pdf').length).toBe(120);
  });
  it('cleans a typed title', () => {
    expect(cleanVaultTitle('  My   PAN  ')).toBe('My PAN');
    expect(cleanVaultTitle('   ')).toBeNull();
    expect(cleanVaultTitle('x'.repeat(121))).toBeNull();
  });
  it('has the six categories, and named slots only where they were asked for', () => {
    expect(VAULT_CATEGORIES.map((c) => c.value)).toEqual(['identity', 'insurance', 'education', 'property_legal', 'photos', 'other']);
    expect(CATEGORY_LABEL.education).toBe('Education & Certificates');
    expect(categoryInfo('identity').kinds).toEqual(['Aadhaar', 'PAN', 'Passport', 'Driving Licence']);
    expect(categoryInfo('insurance').kinds).toEqual(['Health', 'Life', 'Vehicle']);
    expect(categoryInfo('other').kinds).toEqual([]);
    expect(parseCategory('identity')).toBe('identity');
    expect(parseCategory('certificate')).toBeNull();
    expect(parseCategory(undefined)).toBeNull();
  });
  it('accepts a kind only inside the category that names it', () => {
    expect(validKind('identity', 'Passport')).toBe('Passport');
    expect(validKind('insurance', 'Passport')).toBeNull();
    expect(validKind('other', 'Passport')).toBeNull();
    expect(validKind('identity', null)).toBeNull();
  });
  it('formats sizes and the expected path', () => {
    expect(formatSize(500)).toBe('1 KB');
    expect(formatSize(2_621_440)).toBe('2.5 MB');
    expect(expectedVaultPath('subject', 'f', 'image/jpeg')).toBe('subject/files/f/original.jpg');
  });
});

describe('slot status and expiry', () => {
  const { slotStatus, daysToExpiry, parseExpiry, STATUS_LABEL } = jest.requireActual('../services/vault/vaultRules');
  const today = new Date(2026, 10, 12);
  it('counts days to a date', () => {
    expect(daysToExpiry('2026-11-12', today)).toBe(0);
    expect(daysToExpiry('2026-12-12', today)).toBe(30);
    expect(daysToExpiry('2026-11-01', today)).toBe(-11);
  });
  it('is Not added, Added, Expiring soon or Expired, using only dates the person entered', () => {
    expect(slotStatus([], today)).toBe('not_added');
    expect(slotStatus([{ expiresOn: null }], today)).toBe('added');
    expect(slotStatus([{ expiresOn: '2031-01-01' }], today)).toBe('added');
    expect(slotStatus([{ expiresOn: '2027-01-01' }], today)).toBe('expiring');
    expect(slotStatus([{ expiresOn: '2026-10-01' }], today)).toBe('expired');
    // A newer valid copy beats an old expired one.
    expect(slotStatus([{ expiresOn: '2026-10-01' }, { expiresOn: '2031-01-01' }], today)).toBe('added');
    expect(STATUS_LABEL.expiring).toBe('Expiring soon');
  });
  it('accepts only real YYYY-MM-DD days', () => {
    expect(parseExpiry('2031-03-14')).toBe('2031-03-14');
    expect(parseExpiry(' 2031-03-14 ')).toBe('2031-03-14');
    for (const bad of ['14-03-2031', '2031-02-30', '2031-13-01', '1800-01-01', '', 'soon']) expect(parseExpiry(bad)).toBeNull();
  });
});

describe('who added a file, and who may delete it', () => {
  it('describes the uploader from the viewer\'s side, never by name', () => {
    expect(addedByFor('me', 'me')).toBe('you');
    expect(addedByFor('someone', 'me')).toBe('family_member');
    expect(addedByFor(null, 'me')).toBe('former_family_member');
    expect(ADDED_BY_LABEL.former_family_member).toBe('Added by a previous family member');
  });
  it('lets the controller delete anything, a manager only their own, a viewer nothing', () => {
    expect(canDeleteVaultFile('owner', { addedBy: 'family_member' })).toBe(true);
    expect(canDeleteVaultFile('manager', { addedBy: 'you' })).toBe(true);
    expect(canDeleteVaultFile('manager', { addedBy: 'family_member' })).toBe(false);
    expect(canDeleteVaultFile('manager', { addedBy: 'former_family_member' })).toBe(false);
    expect(canDeleteVaultFile('viewer', { addedBy: 'you' })).toBe(false);
  });
  it('words the activity log by role', () => {
    expect(activityText({ action: 'added', title: 'Policy', actorRole: 'manager' })).toBe('A family member added Policy');
    expect(activityText({ action: 'deleted', title: 'Policy', actorRole: 'self' })).toBe('You deleted Policy');
  });
});

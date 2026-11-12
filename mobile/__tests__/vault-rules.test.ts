import {
  categoriesOf,
  expectedVaultPath,
  formatSize,
  MAX_VAULT_BYTES,
  parseGroup,
  cleanVaultTitle,
  titleFromFilename,
  validateVaultFile,
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

describe('titles and groups', () => {
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
  it('maps Home groups to categories', () => {
    expect(categoriesOf('identity')).toEqual(['identity']);
    expect(categoriesOf('insurance')).toEqual(['insurance']);
    expect(categoriesOf('documents')).not.toContain('identity');
    expect(categoriesOf(null)).toHaveLength(8);
    expect(parseGroup('identity')).toBe('identity');
    expect(parseGroup('nonsense')).toBeNull();
    expect(parseGroup(undefined)).toBeNull();
  });
  it('formats sizes and the expected path', () => {
    expect(formatSize(500)).toBe('1 KB');
    expect(formatSize(2_621_440)).toBe('2.5 MB');
    expect(expectedVaultPath('u', 'f', 'image/jpeg')).toBe('u/files/f/original.jpg');
  });
});

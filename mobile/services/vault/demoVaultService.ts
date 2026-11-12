/**
 * DEMO MODE ONLY. Loaded exclusively through services/demo/demoServices.ts, so production
 * builds never bundle these fictional files. Nothing is stored; the list lives in memory.
 */
import { ServiceError } from '../serviceError';
import type { VaultService } from './vaultService';
import { parseExpiry, validKind, validateVaultFile, type VaultFile } from './vaultRules';

const DEMO_SUBJECT = 'demo-person';
let counter = 0;
const nextId = () => `demo-file-${(counter += 1)}`;

function seed(): VaultFile[] {
  const now = Date.now();
  const inDays = (n: number) => new Date(now + n * 86400000).toISOString().slice(0, 10);
  const make = (subjectId: string, category: VaultFile['category'], kind: string | null, title: string, mimeType: VaultFile['mimeType'], daysAgo: number, bytes: number, expiresInDays: number | null = null): VaultFile => ({
    id: nextId(),
    subjectId,
    category,
    kind,
    expiresOn: expiresInDays === null ? null : inDays(expiresInDays),
    title,
    originalFilename: title.replace(/\s+/g, '_') + (mimeType === 'application/pdf' ? '.pdf' : '.jpg'),
    mimeType,
    fileSizeBytes: bytes,
    storagePath: `demo/${counter}`,
    uploadedAt: new Date(now - daysAgo * 86400000).toISOString(),
    createdAt: new Date(now - daysAgo * 86400000).toISOString(),
    addedBy: subjectId === 'demo-person' ? 'you' : 'family_member',
  });
  return [
    // Me
    make(DEMO_SUBJECT, 'identity', 'Passport', 'Passport (sample)', 'image/jpeg', 3, 1_800_000, 2100),
    make(DEMO_SUBJECT, 'identity', 'Driving Licence', 'Driving licence (sample)', 'image/jpeg', 9, 950_000, 60),
    make(DEMO_SUBJECT, 'insurance', 'Health', 'Family health policy (sample)', 'application/pdf', 20, 420_000, 200),
    make(DEMO_SUBJECT, 'education', null, 'Degree certificate (sample)', 'application/pdf', 45, 610_000),
    make(DEMO_SUBJECT, 'property_legal', null, 'Rental agreement (sample)', 'application/pdf', 60, 880_000),
    // Dad
    make('demo-dad', 'identity', 'Aadhaar', 'Dad Aadhaar (sample)', 'image/jpeg', 12, 700_000),
    make('demo-dad', 'identity', 'PAN', 'Dad PAN card (sample)', 'image/jpeg', 12, 500_000),
    make('demo-dad', 'identity', 'Passport', 'Dad passport (sample)', 'image/jpeg', 14, 1_400_000, 40),
    make('demo-dad', 'insurance', 'Health', 'Dad health policy (sample)', 'application/pdf', 30, 410_000, 320),
    // Mum
    make('demo-mum', 'identity', 'Aadhaar', 'Mum Aadhaar (sample)', 'image/jpeg', 8, 690_000),
    make('demo-mum', 'identity', 'Passport', 'Mum passport (sample)', 'image/jpeg', 8, 1_300_000, -20),
    make('demo-mum', 'insurance', 'Life', 'Mum life policy (sample)', 'application/pdf', 50, 430_000, 700),
  ];
}

let files: VaultFile[] = seed();
export const resetDemoVault = () => {
  files = seed();
};

export const demoVaultService: VaultService = {
  async list(subjectId) {
    return subjectId === null ? [] : files.filter((f) => f.subjectId === subjectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async upload(input, onStage) {
    onStage?.('checking');
    const checked = validateVaultFile(input.file);
    if (!checked.ok) throw new ServiceError('invalid_file', checked.message);
    onStage?.('saving');
    const created = new Date().toISOString();
    const file: VaultFile = {
      id: nextId(),
      subjectId: input.subjectId ?? DEMO_SUBJECT,
      category: input.category,
      kind: validKind(input.category, input.kind),
      expiresOn: input.expiresOn ? parseExpiry(input.expiresOn) : null,
      title: input.title,
      originalFilename: input.file.name ?? 'file',
      mimeType: checked.mimeType,
      fileSizeBytes: input.file.size ?? 1,
      storagePath: 'demo/new',
      uploadedAt: created,
      createdAt: created,
      addedBy: 'you',
    };
    files = [file, ...files];
    return file;
  },
  async listActivity(subjectId) {
    if (subjectId !== DEMO_SUBJECT) return [];
    const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
    return [
      { id: 'demo-act-1', action: 'added', title: 'Dad health policy (sample)', actorRole: 'manager', at: ago(26) },
      { id: 'demo-act-2', action: 'added', title: 'Passport (sample)', actorRole: 'self', at: ago(72) },
    ];
  },
  async openUrl() {
    throw new ServiceError('not_available', 'Opening files isn’t available in the demo. Your own files open from the real app.');
  },
  async remove(file) {
    files = files.filter((f) => f.id !== file.id);
  },
};

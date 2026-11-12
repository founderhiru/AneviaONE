/**
 * DEMO MODE ONLY. Loaded exclusively through services/demo/demoServices.ts, so production
 * builds never bundle these fictional files. Nothing is stored; the list lives in memory.
 */
import { ServiceError } from '../serviceError';
import type { VaultService } from './vaultService';
import { validateVaultFile, type VaultFile } from './vaultRules';

const DEMO_SUBJECT = 'demo-person';
let counter = 0;
const nextId = () => `demo-file-${(counter += 1)}`;

function seed(): VaultFile[] {
  const now = Date.now();
  const make = (category: VaultFile['category'], title: string, mimeType: VaultFile['mimeType'], daysAgo: number, bytes: number): VaultFile => ({
    id: nextId(),
    subjectId: DEMO_SUBJECT,
    category,
    title,
    originalFilename: title.replace(/\s+/g, '_') + (mimeType === 'application/pdf' ? '.pdf' : '.jpg'),
    mimeType,
    fileSizeBytes: bytes,
    storagePath: `demo/${counter}`,
    uploadedAt: new Date(now - daysAgo * 86400000).toISOString(),
    createdAt: new Date(now - daysAgo * 86400000).toISOString(),
  });
  return [
    make('identity', 'Passport (sample)', 'image/jpeg', 3, 1_800_000),
    make('identity', 'Driving licence (sample)', 'image/jpeg', 9, 950_000),
    make('insurance', 'Family health policy (sample)', 'application/pdf', 20, 420_000),
    make('education', 'Degree certificate (sample)', 'application/pdf', 45, 610_000),
    make('property', 'Rental agreement (sample)', 'application/pdf', 60, 880_000),
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
      title: input.title,
      originalFilename: input.file.name ?? 'file',
      mimeType: checked.mimeType,
      fileSizeBytes: input.file.size ?? 1,
      storagePath: 'demo/new',
      uploadedAt: created,
      createdAt: created,
    };
    files = [file, ...files];
    return file;
  },
  async openUrl() {
    throw new ServiceError('not_available', 'Opening files isn’t available in the demo. Your own files open from the real app.');
  },
  async remove(file) {
    files = files.filter((f) => f.id !== file.id);
  },
};

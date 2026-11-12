import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { CaptureResult } from '../documents/capture';

/**
 * Ways to add a file to the personal documents folder. The file goes to private storage
 * exactly as it is; nothing is read or interpreted here.
 */
export type VaultSource = 'file' | 'camera' | 'library';

export const VAULT_SOURCES: { source: VaultSource; label: string; description: string }[] = [
  { source: 'file', label: 'Choose a file', description: 'A PDF or photo from Files, WhatsApp or Gmail' },
  { source: 'camera', label: 'Take a photo', description: 'Photograph a paper document' },
  { source: 'library', label: 'Choose a photo', description: 'Use a photo already on your phone' },
];

const CAMERA_DENIED = 'Camera access is off. You can allow it for this app in Settings, or choose a file instead.';
const PHOTOS_DENIED = 'Photo access is off. You can allow it for this app in Settings, or choose a file instead.';

export async function pickVaultFile(source: VaultSource): Promise<CaptureResult> {
  if (source === 'file') {
    const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: false, copyToCacheDirectory: true });
    const a = picked.canceled ? undefined : picked.assets?.[0];
    return a ? { kind: 'file', file: { uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, source: 'upload' } } : { kind: 'cancelled' };
  }
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { kind: 'permission_denied', message: CAMERA_DENIED };
  } else {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { kind: 'permission_denied', message: PHOTOS_DENIED };
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false });
  const a = result.canceled ? undefined : result.assets?.[0];
  if (!a) return { kind: 'cancelled' };
  return { kind: 'file', file: { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize, source: source === 'camera' ? 'camera' : 'upload' } };
}

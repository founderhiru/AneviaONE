import { File } from 'expo-file-system';

/**
 * Reads a picked local file into memory for validation + upload.
 * Isolated here so the service can be unit-tested without native modules.
 * Files are capped at 20 MB before this is called.
 */
export async function readLocalFile(uri: string): Promise<ArrayBuffer> {
  return new File(uri).arrayBuffer();
}

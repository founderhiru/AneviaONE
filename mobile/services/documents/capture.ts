import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';

import type { PickedFile } from '../../types';

/**
 * The ways a health record can be added. Every path ends in a PDF that goes
 * through the same validated, private upload (`documentsService`): the
 * stored-document pipeline accepts PDFs only, so photos and scans are turned
 * into a PDF on the device first — nothing is sent anywhere else, and
 * nothing is read or interpreted here.
 */
export type CaptureMethod = 'pdf' | 'camera' | 'library' | 'scan';

export const CAPTURE_METHODS: { method: CaptureMethod; label: string; description: string }[] = [
  { method: 'pdf', label: 'Upload PDF', description: 'A report or prescription saved as a PDF' },
  { method: 'camera', label: 'Take Photo', description: 'Photograph a paper report' },
  { method: 'library', label: 'Choose Photo', description: 'Use photos already on your phone' },
  { method: 'scan', label: 'Scan Document', description: 'Photograph each page, one after another' },
];

export type CaptureResult = { kind: 'file'; file: PickedFile } | { kind: 'cancelled' } | { kind: 'permission_denied'; message: string };

/** One photographed or chosen page, as JPEG data for the PDF. */
export type CapturedPage = { base64: string; width: number; height: number };

export type PageResult = { kind: 'pages'; pages: CapturedPage[] } | { kind: 'cancelled' } | { kind: 'permission_denied'; message: string };

/** Keeps a photographed record well under the 20 MB document limit. */
const PHOTO_QUALITY = 0.6;
export const MAX_PAGES = 10;

const CAMERA_DENIED = 'Camera access is off. You can allow it for this app in Settings, or upload a PDF instead.';
const PHOTOS_DENIED = 'Photo access is off. You can allow it for this app in Settings, or upload a PDF instead.';

export async function pickPdf(): Promise<CaptureResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  const asset = picked.canceled ? undefined : picked.assets?.[0];
  if (!asset) return { kind: 'cancelled' };
  return { kind: 'file', file: { uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, source: 'upload' } };
}

function toPages(assets: ImagePicker.ImagePickerAsset[] | null | undefined): CapturedPage[] {
  return (assets ?? [])
    .filter((a): a is ImagePicker.ImagePickerAsset & { base64: string } => Boolean(a.base64))
    .map((a) => ({ base64: a.base64, width: a.width, height: a.height }));
}

/** Takes one photo with the camera. */
export async function photographPage(): Promise<PageResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { kind: 'permission_denied', message: CAMERA_DENIED };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: PHOTO_QUALITY, base64: true });
  const pages = result.canceled ? [] : toPages(result.assets);
  return pages.length ? { kind: 'pages', pages } : { kind: 'cancelled' };
}

/** Chooses one or more existing photos (one page each). */
export async function choosePhotoPages(): Promise<PageResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { kind: 'permission_denied', message: PHOTOS_DENIED };
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: PHOTO_QUALITY,
    base64: true,
    allowsMultipleSelection: true,
    selectionLimit: MAX_PAGES,
    orderedSelection: true,
  });
  const pages = result.canceled ? [] : toPages(result.assets);
  return pages.length ? { kind: 'pages', pages } : { kind: 'cancelled' };
}

// A4 at 72 PPI, the usual size for Indian lab reports.
const PAGE_W = 595;
const PAGE_H = 842;
const PAGE_MARGIN = 18;

/** Builds the PDF's HTML: one page per image, scaled to fit, in order. */
export function pagesToHtml(pages: CapturedPage[]): string {
  const body = pages.map((page) => `<div class="page"><img src="data:image/jpeg;base64,${page.base64}" /></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
@page { size: ${PAGE_W}px ${PAGE_H}px; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.page { width: ${PAGE_W}px; height: ${PAGE_H}px; box-sizing: border-box; padding: ${PAGE_MARGIN}px; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; overflow: hidden; }
.page:last-child { page-break-after: auto; break-after: auto; }
img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style></head><body>${body}</body></html>`;
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

/** Turns captured pages into one PDF file on the device, ready to upload. */
export async function pagesToPdf(pages: CapturedPage[], method: Exclude<CaptureMethod, 'pdf'>, now = new Date()): Promise<PickedFile> {
  const { uri } = await Print.printToFileAsync({
    html: pagesToHtml(pages.slice(0, MAX_PAGES)),
    width: PAGE_W,
    height: PAGE_H,
    margins: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  const kind = method === 'scan' ? 'Scanned document' : 'Photo record';
  return {
    uri,
    name: `${kind} ${stamp(now)}.pdf`,
    mimeType: 'application/pdf',
    source: method === 'library' ? 'upload' : 'camera',
  };
}

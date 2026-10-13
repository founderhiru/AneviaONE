/**
 * The app asks only for what it uses: the camera (photographing a report) and
 * the system photo picker (choosing existing photos). It never records audio,
 * never uses Face ID, and on Android 13+ the photo picker needs no media
 * permission — Google Play rejects READ_MEDIA_IMAGES for one-off picks, and
 * App Review questions purpose strings for features an app doesn't have.
 */
import app from '../app.json';
import pkg from '../package.json';

type PluginEntry = string | [string, Record<string, unknown>];
const plugins = app.expo.plugins as PluginEntry[];
const plugin = (name: string) => plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name);
const options = (name: string) => {
  const entry = plugin(name);
  return Array.isArray(entry) ? entry[1] : {};
};

describe('native permissions', () => {
  it('Android declares only the camera and blocks audio and broad media access', () => {
    expect(app.expo.android.permissions).toEqual(['android.permission.CAMERA']);
    expect(app.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
      ])
    );
  });

  it('iOS gets no microphone or Face ID purpose string', () => {
    expect(options('expo-image-picker').microphonePermission).toBe(false);
    expect(options('expo-secure-store').faceIDPermission).toBe(false);
    expect(JSON.stringify(app.expo.ios.infoPlist)).not.toMatch(/Microphone|FaceID/);
  });

  it('camera and photo purpose strings explain the health-record use', () => {
    expect(options('expo-image-picker').cameraPermission).toMatch(/health reports/);
    expect(options('expo-image-picker').photosPermission).toMatch(/health documents/);
  });

  it('expo-camera (unused; adds audio and barcode scanning) is not installed', () => {
    expect(plugin('expo-camera')).toBeUndefined();
    expect(Object.keys(pkg.dependencies)).not.toContain('expo-camera');
  });
});

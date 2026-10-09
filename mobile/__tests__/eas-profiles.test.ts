/**
 * Every EAS build profile is pinned to production mode and to its own EAS
 * environment (where the backend values live), so no cloud build can quietly
 * become a demo build or ship without knowing which backend it uses.
 */
import eas from '../eas.json';

type Profile = { environment?: string; env?: Record<string, string> };

describe('EAS build profiles', () => {
  const profiles = Object.entries(eas.build as Record<string, Profile>);

  it('covers development, preview and production', () => {
    expect(profiles.map(([name]) => name).sort()).toEqual(['development', 'preview', 'production']);
  });

  it.each(profiles)('%s: production mode, its own EAS environment, never demo', (name, profile) => {
    expect(profile.env?.EXPO_PUBLIC_APP_MODE).toBe('production');
    expect(profile.environment).toBe(name);
    expect(JSON.stringify(profile)).not.toMatch(/demo/i);
    // Backend values come from the EAS environment, never committed here.
    expect(profile.env?.EXPO_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(profile.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
  });

  it('pins the EAS CLI major version', () => {
    expect(eas.cli.version).toMatch(/< 25\.0\.0$/);
  });
});

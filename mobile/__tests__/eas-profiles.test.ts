/**
 * Every EAS build profile is pinned to production mode and to its own EAS
 * environment (where the backend values live), so no cloud build can quietly
 * become a demo build or ship without knowing which backend it uses.
 */
import eas from '../eas.json';

type Profile = { extends?: string; environment?: string; env?: Record<string, string> };

describe('EAS build profiles', () => {
  const build = eas.build as Record<string, Profile>;
  /** A profile as EAS sees it: its own settings on top of the one it extends. */
  const resolved = (name: string): Profile => {
    const own = build[name];
    const base = own.extends ? resolved(own.extends) : {};
    return { ...base, ...own, env: { ...base.env, ...own.env } };
  };
  const profiles = Object.keys(build).map((name) => [name, resolved(name), build[name]] as const);

  it('covers development, preview, production and the Android APK variant of production', () => {
    expect(profiles.map(([name]) => name).sort()).toEqual(['development', 'preview', 'production', 'production-apk']);
  });

  it.each(profiles)('%s: production mode, its own EAS environment, never demo', (name, profile, own) => {
    expect(profile.env?.EXPO_PUBLIC_APP_MODE).toBe('production');
    // A variant uses the environment of the profile it extends, and never sets its own.
    expect(profile.environment).toBe(own.extends ?? name);
    if (own.extends) expect(own.environment).toBeUndefined();
    expect(JSON.stringify(profile)).not.toMatch(/demo/i);
    // Backend values come from the EAS environment, never committed here.
    expect(profile.env?.EXPO_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(profile.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
  });

  it('the Android APK variant differs from production only in how it is packaged', () => {
    expect(build['production-apk']).toEqual({ extends: 'production', distribution: 'internal', android: { buildType: 'apk' } });
  });

  it('pins the EAS CLI major version', () => {
    expect(eas.cli.version).toMatch(/< 25\.0\.0$/);
  });
});

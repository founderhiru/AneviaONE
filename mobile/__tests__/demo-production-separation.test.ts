/**
 * Demo vs production separation (Gate 1):
 *   - screens never import the sample dataset (mock/) directly;
 *   - only the demo modules import mock/, and only demoServices.ts loads them,
 *     behind a literal EXPO_PUBLIC_APP_MODE check Metro folds away in
 *     production builds;
 *   - EAS production builds pin EXPO_PUBLIC_APP_MODE=production;
 *   - no secret-bearing server code or keys are reachable from the app.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const importsOf = (rel: string) => [...read(rel).matchAll(/(?:from\s+|require\()\s*'([^']+)'/g)].map((m) => m[1]);
const APP_CODE = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('hooks'), ...sourceFiles('services')];

const DEMO_MODULES = [
  'services/health/demoHealthService.ts',
  'services/ai/demoAiService.ts',
  'services/documents/demoDocumentsService.ts',
  'services/documents/sampleDocuments.ts',
  'services/auth/mockAuthService.ts',
];

describe('demo / production separation', () => {
  it('screens, components and hooks never import mock data', () => {
    const offenders = [...sourceFiles('app'), ...sourceFiles('components'), ...sourceFiles('hooks')].filter((f) =>
      importsOf(f).some((i) => /(^|\/)mock(\/|$)/.test(i))
    );
    expect(offenders).toEqual([]);
  });

  it('only the demo modules import mock data', () => {
    const importers = APP_CODE.filter((f) => importsOf(f).some((i) => /(^|\/)mock(\/|$)/.test(i)));
    expect(importers.sort()).toEqual(DEMO_MODULES.filter((m) => m !== 'services/auth/mockAuthService.ts').sort());
  });

  it('demo modules are reachable only through services/demo/demoServices.ts', () => {
    /** Imports that load code at runtime (type-only imports are erased). */
    const runtimeImports = (rel: string) => [
      ...[...read(rel).matchAll(/^import (?!type )[^;]*?from '([^']+)'/gms)].map((m) => m[1]),
      ...[...read(rel).matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]),
    ];
    for (const mod of DEMO_MODULES) {
      const name = path.basename(mod, '.ts');
      const importers = APP_CODE.filter((f) => f !== mod && runtimeImports(f).some((i) => i.endsWith(`/${name}`)));
      expect({ mod, importers }).toEqual({ mod, importers: ['services/demo/demoServices.ts'] });
    }
  });

  it('the demo loader is guarded by a literal, build-time-inlined comparison', () => {
    expect(read('services/demo/demoServices.ts')).toMatch(/if \(process\.env\.EXPO_PUBLIC_APP_MODE !== 'production'\) \{/);
  });

  it('EAS production builds pin production mode', () => {
    const eas = JSON.parse(read('eas.json'));
    expect(eas.build.production.env.EXPO_PUBLIC_APP_MODE).toBe('production');
  });

  it('loading demo services in a production build fails closed', () => {
    const saved = process.env.EXPO_PUBLIC_APP_MODE;
    process.env.EXPO_PUBLIC_APP_MODE = 'production';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadDemoServices } = require('../services/demo/demoServices');
      expect(() => loadDemoServices()).toThrow(/not available in production/);
    });
    process.env.EXPO_PUBLIC_APP_MODE = saved;
  });

  it('the app never references the service-role key, AI provider keys or the engine RPCs', () => {
    for (const f of APP_CODE) {
      const text = read(f);
      expect({ f, hit: /SERVICE_ROLE|service_role|ANTHROPIC_API_KEY|sk-ant-|engine_(claim|complete|fail|start|record|has)/.test(text) }).toEqual({ f, hit: false });
    }
  });
});

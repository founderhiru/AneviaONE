import path from 'node:path';

import type { NextConfig } from 'next';

// The repo root, so the site can import content shared with the mobile app
// (../shared — e.g. the FAQ). Pinning it also stops Next.js from inferring
// the root from an unrelated lockfile higher up the filesystem.
const repoRoot = path.join(__dirname, '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;

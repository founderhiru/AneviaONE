// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Content shared with the website (e.g. ../shared/faq.ts — the FAQ copy used
// by both /faq on the web and Me → Help & FAQ here). Pure TypeScript data with
// no imports, so it only needs to be watched, not resolved as a package.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];

module.exports = config;

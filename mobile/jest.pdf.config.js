/**
 * PDF text-layer tests run pdf.js inside Jest, which needs Node's
 * --experimental-vm-modules (see the `test:pdf` script). They are kept in a
 * separate run so the flag cannot change how the UI tests behave.
 */
const base = require('./package.json').jest;
module.exports = { ...base, testMatch: ['**/__tests__/**/*.pdf.test.ts'], testPathIgnorePatterns: ['/node_modules/'] };

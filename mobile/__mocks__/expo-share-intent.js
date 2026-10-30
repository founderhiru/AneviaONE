// Native module (iOS share extension / Android intent): inert in unit tests.
const React = require('react');

const idle = { hasShareIntent: false, shareIntent: { files: null, text: null, webUrl: null }, resetShareIntent: () => {}, error: null };
let current = idle;

module.exports = {
  ShareIntentProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  useShareIntent: () => current,
  __setShareIntentForTests: (value) => {
    current = value ? { ...idle, ...value } : idle;
  },
};

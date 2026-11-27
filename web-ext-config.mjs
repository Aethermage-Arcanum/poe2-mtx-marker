// Konfiguration für web-ext (lint, build, sign). Ins Paket kommen nur die Extension-Dateien.
export default {
  ignoreFiles: [
    'tests',
    'tools',
    'temp',
    'knowledge',
    'docs',
    '*.md',
    'package.json',
    'package-lock.json',
    'web-ext-config.mjs',
    // Nur Chromium (tools/build-chromium.mjs nimmt sie dort auf).
    'background-sw.js',
    'offscreen.html',
    'offscreen.js',
    'icons/png',
  ],
  build: {
    overwriteDest: true,
  },
  sign: {
    channel: 'unlisted',
  },
};

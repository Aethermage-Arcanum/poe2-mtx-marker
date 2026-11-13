// Konfiguration für web-ext (lint, build, sign). Ins Paket kommen nur die Extension-Dateien.
export default {
  ignoreFiles: [
    'tests',
    'tools',
    'temp',
    'knowledge',
    '*.md',
    'package.json',
    'package-lock.json',
    'web-ext-config.mjs',
  ],
  build: {
    overwriteDest: true,
  },
  sign: {
    channel: 'unlisted',
  },
};

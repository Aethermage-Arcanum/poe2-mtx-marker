'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/core.js');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

test('manifest: MV3 mit Gecko-ID, nur storage-Permission, Host-Permissions für Shop und poe2db', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.browser_specific_settings.gecko.id, /^[^@\s]+@[^@\s]+$/);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['*://*.pathofexile.com/*', 'https://poe2db.tw/*']);
  assert.deepEqual(core.HOST_PERMISSIONS, manifest.host_permissions);
});

test('manifest: Background als scripts, Content-Script auf allen Shop-Subdomains, options_ui, Popup', () => {
  assert.deepEqual(manifest.background.scripts, ['lib/core.js', 'background.js']);
  assert.equal(manifest.content_scripts.length, 1);
  const cs = manifest.content_scripts[0];
  assert.deepEqual(cs.matches, ['*://*.pathofexile.com/shop*']);
  assert.deepEqual(cs.matches, [core.SHOP_URL_PATTERN]);
  assert.deepEqual(cs.js, ['lib/core.js', 'content.js']);
  assert.deepEqual(cs.css, ['content.css']);
  assert.equal(manifest.options_ui.page, 'options.html');
  assert.equal(manifest.action.default_popup, 'popup.html');
});

test('manifest: alle referenzierten Dateien existieren', () => {
  const cs = manifest.content_scripts[0];
  const files = [
    ...manifest.background.scripts,
    ...cs.js,
    ...cs.css,
    manifest.options_ui.page,
    manifest.action.default_popup,
    'data/poe2db-shopid-map.json',
  ];
  for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});

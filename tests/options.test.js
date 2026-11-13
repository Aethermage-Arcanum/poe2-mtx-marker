'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const core = require('../lib/core.js');
const { initOptions, OPTION_IDS } = require('../options.js');
const { translator } = require('./helpers.js');

const OPTIONS_HTML = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');

function setup(stored) {
  const dom = new JSDOM(OPTIONS_HTML);
  const writes = [];
  const storage = {
    get: async (key) => (stored === undefined ? {} : { [key]: stored }),
    set: async (values) => {
      writes.push(values);
    },
  };
  return { dom, document: dom.window.document, storage, writes };
}

// jsdom normalisiert box-shadow beim Serialisieren; Vergleich daher über dieselbe CSS-Serialisierung.
function cssBoxShadow(document, value) {
  const probe = document.createElement('div');
  probe.style.boxShadow = value;
  assert.notEqual(probe.style.boxShadow, '');
  return probe.style.boxShadow;
}

function cssColor(document, value) {
  const probe = document.createElement('div');
  probe.style.color = value;
  assert.notEqual(probe.style.color, '');
  return probe.style.color;
}

function fire(dom, element, value) {
  element.value = value;
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

test('Optionen: gespeicherte Werte in Color-Picker, Slider und Vorschau', async () => {
  const { document, storage } = setup({ color: '#00ff00', intensity: 50 });
  await initOptions({ document, storage, t: translator() });
  assert.equal(document.getElementById(OPTION_IDS.COLOR).value, '#00ff00');
  assert.equal(document.getElementById(OPTION_IDS.INTENSITY).value, '50');
  assert.equal(document.getElementById(OPTION_IDS.INTENSITY).min, String(core.INTENSITY_MIN));
  assert.equal(document.getElementById(OPTION_IDS.INTENSITY).max, String(core.INTENSITY_MAX));
  const preview = document.getElementById(OPTION_IDS.PREVIEW);
  assert.equal(preview.style.boxShadow, cssBoxShadow(document, core.glowStyle({ color: '#00ff00', intensity: 50 }).boxShadow));
  assert.equal(document.getElementById(OPTION_IDS.PREVIEW_LABEL).textContent, core.LABEL_TEXT);
});

test('Optionen: ohne gespeicherte Werte gelten die Standardwerte', async () => {
  const { document, storage } = setup(undefined);
  await initOptions({ document, storage, t: translator() });
  assert.equal(document.getElementById(OPTION_IDS.COLOR).value, core.DEFAULT_SETTINGS.color);
  assert.equal(document.getElementById(OPTION_IDS.INTENSITY).value, String(core.DEFAULT_SETTINGS.intensity));
});

test('Optionen: Änderung aktualisiert Vorschau sofort und speichert in storage', async () => {
  const { dom, document, storage, writes } = setup(undefined);
  await initOptions({ document, storage, t: translator() });
  fire(dom, document.getElementById(OPTION_IDS.COLOR), '#3366ff');
  fire(dom, document.getElementById(OPTION_IDS.INTENSITY), '100');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const expected = { color: '#3366ff', intensity: 100 };
  assert.equal(document.getElementById(OPTION_IDS.PREVIEW).style.boxShadow, cssBoxShadow(document, core.glowStyle(expected).boxShadow));
  assert.deepEqual(writes.at(-1), { [core.STORAGE_KEYS.SETTINGS]: expected });
});

test('Optionen: Vorschau-Label nutzt schwarze oder weiße Schrift nach WCAG-Kontrast', async () => {
  const { dom, document, storage } = setup({ color: '#00ff00', intensity: 50 });
  await initOptions({ document, storage, t: translator() });
  const label = document.getElementById(OPTION_IDS.PREVIEW_LABEL);
  assert.equal(label.style.color, cssColor(document, '#000000'));
  fire(dom, document.getElementById(OPTION_IDS.COLOR), '#000080');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(label.style.color, cssColor(document, '#ffffff'));
});

test('Optionen: Vorschau-Label sitzt wie im Shop linksbündig unten (left 10px, bottom 4px), kein right / top / margin-top', () => {
  const { document } = setup(undefined);
  const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]);
  const matching = rules.filter((rule) => rule.selectorText && rule.selectorText.trim() === '.preview-label');
  assert.equal(matching.length, 1);
  const style = matching[0].style;
  assert.equal(style.getPropertyValue('position'), 'absolute');
  assert.equal(style.getPropertyValue('left'), '10px');
  assert.equal(style.getPropertyValue('bottom'), '4px');
  assert.equal(style.getPropertyValue('right'), '');
  assert.equal(style.getPropertyValue('top'), '');
  assert.equal(style.getPropertyValue('margin-top'), '');
});

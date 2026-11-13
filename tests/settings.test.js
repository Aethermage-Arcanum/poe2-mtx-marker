'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core.js');

test('normalizeSettings: fehlende/ungültige Werte -> Standard', () => {
  assert.deepEqual(core.normalizeSettings(undefined), core.DEFAULT_SETTINGS);
  assert.deepEqual(core.normalizeSettings({ color: 'rot', intensity: 'viel' }), core.DEFAULT_SETTINGS);
  assert.match(core.DEFAULT_SETTINGS.color, /^#[0-9a-f]{6}$/);
});

test('normalizeSettings: gültige Werte bleiben, Intensität wird auf 0..100 begrenzt und gerundet', () => {
  assert.deepEqual(core.normalizeSettings({ color: '#00AAff', intensity: 42 }), { color: '#00aaff', intensity: 42 });
  assert.deepEqual(core.normalizeSettings({ color: '#123456', intensity: 250 }), { color: '#123456', intensity: 100 });
  assert.deepEqual(core.normalizeSettings({ color: '#123456', intensity: -3 }), { color: '#123456', intensity: 0 });
  assert.deepEqual(core.normalizeSettings({ color: '#123456', intensity: '57.6' }), { color: '#123456', intensity: 58 });
});

test('glowStyle: Unschärfe 4..40 px und Ausdehnung 0..8 px linear über die Intensität', () => {
  assert.deepEqual(core.glowStyle({ color: '#ff0000', intensity: 0 }), { color: '#ff0000', boxShadow: '0 0 4px 0px #ff0000' });
  assert.deepEqual(core.glowStyle({ color: '#ff0000', intensity: 50 }), { color: '#ff0000', boxShadow: '0 0 22px 4px #ff0000' });
  assert.deepEqual(core.glowStyle({ color: '#00ff00', intensity: 100 }), { color: '#00ff00', boxShadow: '0 0 40px 8px #00ff00' });
});

// Erwartungswerte unabhängig per Python (WCAG 2) ermittelt.
const LABEL_TEXT_COLOR_CASES = [
  ['#ff2a2a', '#000000'],
  ['#00ff00', '#000000'],
  ['#3ddc97', '#000000'],
  ['#ffff00', '#000000'],
  ['#ffffff', '#000000'],
  ['#000080', '#ffffff'],
  ['#0000ff', '#ffffff'],
  ['#000000', '#ffffff'],
  ['#767676', '#000000'],
  ['#757575', '#ffffff'],
];

for (const [background, expected] of LABEL_TEXT_COLOR_CASES) {
  test(`labelTextColor: ${background} -> ${expected}`, () => {
    assert.equal(core.labelTextColor(background), expected);
  });
}

test('labelTextColor: Ergebnisse sind die benannten Konstanten', () => {
  assert.deepEqual(core.LABEL_TEXT_COLORS, { DARK: '#000000', LIGHT: '#ffffff' });
});

test('contrastRatio: WCAG-2-Werte der Grenzfälle', () => {
  assert.equal(core.contrastRatio('#ff2a2a', '#000000').toFixed(3), '5.617');
  assert.equal(core.contrastRatio('#ff2a2a', '#ffffff').toFixed(3), '3.739');
  assert.equal(core.contrastRatio('#767676', '#000000').toFixed(3), '4.623');
  assert.equal(core.contrastRatio('#767676', '#ffffff').toFixed(3), '4.542');
  assert.equal(core.contrastRatio('#757575', '#000000').toFixed(3), '4.558');
  assert.equal(core.contrastRatio('#757575', '#ffffff').toFixed(3), '4.608');
});

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

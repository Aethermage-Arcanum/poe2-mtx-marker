'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core.js');
const { listDocument, detailSlugs, readDetail, parseHtml, cardElement, readShopApi } = require('./helpers.js');

const listEntries = core.parsePoe2dbList(listDocument());

function fixtureIdMap() {
  const map = {};
  for (const slug of detailSlugs()) map[slug] = core.parseDetailShopIds(parseHtml(readDetail(slug)));
  return map;
}

function evaluateFixture(name, index) {
  const card = core.extractCard(cardElement(name));
  const result = core.evaluateCard(card, index);
  return { ...result, label: core.labelText(card, result) };
}

const fullIndex = core.buildIndex(listEntries, fixtureIdMap());

test('Matching mit Liste + ID-Map: Einzelitem Wolf -> "PoE2 ready"', () => {
  assert.deepEqual(evaluateFixture('en_single_WolfOfOghamPet', fullIndex), { matched: 1, total: 1, label: 'PoE2 ready' });
});

test('Matching mit Liste + ID-Map: Varianten Phoenix -> 3/3', () => {
  assert.deepEqual(evaluateFixture('en_variant_PhoenixPetVariations', fullIndex), { matched: 3, total: 3, label: 'PoE2 ready 3/3' });
});

test('Matching mit Liste + ID-Map: Varianten Kommandantenstiefel (DE) -> 2/2', () => {
  assert.deepEqual(evaluateFixture('de_variant_CommanderBootsVariations', fullIndex), { matched: 2, total: 2, label: 'PoE2 ready 2/2' });
});

test('Bündelzählung mit Liste + ID-Map: Chaotischer Sturmgeborener (DE) -> 4/4', () => {
  assert.deepEqual(evaluateFixture('de_bundle_ChaoticStormborneArmourPack', fullIndex), { matched: 4, total: 4, label: 'PoE2 ready 4/4' });
});

test('Bündelzählung nur über artKey (leere Map): Chaotischer Sturmgeborener -> 0/4, kein Label', () => {
  const artOnly = core.buildIndex(listEntries, {});
  assert.deepEqual(evaluateFixture('de_bundle_ChaoticStormborneArmourPack', artOnly), { matched: 0, total: 4, label: null });
});

test('NurseryWebSpiderPet (Shop-API-Fixture) trifft ausschließlich über artKey', () => {
  const item = readShopApi('de_pets_100').items.find((i) => i.id === 'NurseryWebSpiderPet');
  assert.equal(fullIndex.shopIds.has('NurseryWebSpiderPet'), false);
  const card = {
    id: item.id,
    type: core.CARD_TYPES.SINGLE,
    name: item.name,
    children: [{ id: item.id, artKey: core.artKeyFromShopImageUrl(item.imageUrl) }],
  };
  assert.deepEqual(core.evaluateCard(card, fullIndex), { matched: 1, total: 1 });
});

test('Teil-Treffer: Liste ohne Abyssal_Phoenix_Pet -> Phoenix 2/3', () => {
  const reducedIndex = core.buildIndex(listEntries.filter((e) => e.slug !== 'Abyssal_Phoenix_Pet'), fixtureIdMap());
  assert.equal(reducedIndex.shopIds.has('AbyssalPhoenixPet'), false);
  assert.equal(reducedIndex.artKeys.has('2ditems/pets/phoenixpetgreen'), false);
  assert.deepEqual(evaluateFixture('en_variant_PhoenixPetVariations', reducedIndex), { matched: 2, total: 3, label: 'PoE2 ready 2/3' });
});

test('Map-Einträge zu Slugs, die nicht mehr in der Liste stehen, zählen nicht', () => {
  const index = core.buildIndex(listEntries.filter((e) => e.slug !== 'Wolf_of_Ogham_Pet'), fixtureIdMap());
  assert.equal(index.shopIds.has('WolfOfOghamPet'), false);
  assert.deepEqual(evaluateFixture('en_single_WolfOfOghamPet', index), { matched: 0, total: 1, label: null });
});

test('buildIndex: fehlende Slugs = eindeutige Listen-Slugs ohne Map-Eintrag ([] gilt als vorhanden)', () => {
  const uniqueSlugs = new Set(listEntries.map((e) => e.slug));
  const mapped = detailSlugs();
  assert.equal(fullIndex.missingSlugs.length, uniqueSlugs.size - mapped.length);
  assert.equal(new Set(fullIndex.missingSlugs).size, fullIndex.missingSlugs.length);
  assert.equal(fullIndex.missingSlugs.includes('Nursery_Web_Spider_Pet'), false);
  assert.equal(fullIndex.missingSlugs.includes('Hideout_Music_Player'), true);
  for (const slug of mapped) assert.equal(fullIndex.missingSlugs.includes(slug), false);
});

test('Index-Payload: Hin- und Rückweg erhält Shop-IDs und artKeys', () => {
  const restored = core.indexFromPayload(JSON.parse(JSON.stringify(core.indexToPayload(fullIndex))));
  assert.deepEqual([...restored.shopIds].sort(), [...fullIndex.shopIds].sort());
  assert.deepEqual([...restored.artKeys].sort(), [...fullIndex.artKeys].sort());
});

test('labelText: Einzelitem, Mehrfach-Karte, 0 Treffer', () => {
  const single = { type: core.CARD_TYPES.SINGLE };
  const variant = { type: core.CARD_TYPES.VARIANT };
  const bundle = { type: core.CARD_TYPES.BUNDLE };
  assert.equal(core.labelText(single, { matched: 1, total: 1 }), 'PoE2 ready');
  assert.equal(core.labelText(variant, { matched: 2, total: 3 }), 'PoE2 ready 2/3');
  assert.equal(core.labelText(bundle, { matched: 1, total: 1 }), 'PoE2 ready 1/1');
  assert.equal(core.labelText(single, { matched: 0, total: 1 }), null);
  assert.equal(core.labelText(bundle, { matched: 0, total: 4 }), null);
});

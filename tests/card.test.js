'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core.js');
const { cardElement, parseHtml, readDomFixture } = require('./helpers.js');

test('extractCard: Einzelitem (EN, Wolf of Ogham)', () => {
  assert.deepEqual(core.extractCard(cardElement('en_single_WolfOfOghamPet')), {
    id: 'WolfOfOghamPet',
    type: core.CARD_TYPES.SINGLE,
    name: 'Wolf of Ogham Pet',
    children: [{ id: 'WolfOfOghamPet', artKey: '2ditems/pets/geonorwolf' }],
  });
});

test('extractCard: Varianten-Gruppe (EN, Phoenix, 3 Varianten mit Bildern)', () => {
  assert.deepEqual(core.extractCard(cardElement('en_variant_PhoenixPetVariations')), {
    id: 'PhoenixPetVariations',
    type: core.CARD_TYPES.VARIANT,
    name: 'Phoenix Pet Variations',
    children: [
      { id: 'BlueflamePhoenixPet', artKey: '2ditems/pets/phoenixpetblue' },
      { id: 'PhoenixPet', artKey: '2ditems/pets/phoenixpetred' },
      { id: 'AbyssalPhoenixPet', artKey: '2ditems/pets/phoenixpetgreen' },
    ],
  });
});

test('extractCard: Varianten-Gruppe (DE, Kommandantenstiefel, 2 Varianten)', () => {
  assert.deepEqual(core.extractCard(cardElement('de_variant_CommanderBootsVariations')), {
    id: 'CommanderBootsVariations',
    type: core.CARD_TYPES.VARIANT,
    name: 'Varianten: Kommandantenstiefel',
    children: [
      { id: 'ScourgeCommanderBoots', artKey: '2ditems/effects/shoes/bonelegioncommanderboots' },
      { id: 'LegionCommanderBoots', artKey: '2ditems/effects/shoes/legioncommanderboots' },
    ],
  });
});

test('extractCard: Bündel (DE, Chaotischer Sturmgeborener) - Kinder ohne Bild, artKey null', () => {
  assert.deepEqual(core.extractCard(cardElement('de_bundle_ChaoticStormborneArmourPack')), {
    id: 'ChaoticStormborneArmourPack',
    type: core.CARD_TYPES.BUNDLE,
    name: "'Chaotischer Sturmgeborener'-Rüstungsset",
    children: [
      { id: 'ChaoticStormborneBodyArmour', artKey: null },
      { id: 'StormborneHelmet', artKey: null },
      { id: 'StormborneGloves', artKey: null },
      { id: 'StormborneBoots', artKey: null },
    ],
  });
});

test('SHOP_SELECTORS.CARD: nur Karten mit id direkt in #mtx-list, keine Lade-Skelette', () => {
  const doc = parseHtml(`
    <div id="shop-item-loading"><div class="shopItemBase"></div><div class="shopItemBase"></div></div>
    <div id="mtx-list">${readDomFixture('en_single_WolfOfOghamPet')}<div class="shopItemBase"></div></div>`);
  const ids = [...doc.querySelectorAll(core.SHOP_SELECTORS.CARD)].map((el) => el.id);
  assert.deepEqual(ids, ['WolfOfOghamPet']);
});

test('isCardRendered: leere Karte (nur äußeres Element der Fixture) nein, befüllte Karte ja', () => {
  const filled = cardElement('en_variant_PhoenixPetVariations');
  const empty = filled.cloneNode(false);
  assert.equal(core.isCardRendered(empty), false);
  assert.equal(core.isCardRendered(filled), true);
});

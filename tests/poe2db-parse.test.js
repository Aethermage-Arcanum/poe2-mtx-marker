'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core.js');
const { listDocument, readDetail, parseHtml } = require('./helpers.js');

// Erwartete Mengen per Python-Regex direkt auf der Fixture gezählt (unabhängig von dieser Implementierung).
// 2623 Namens-Einträge, davon 2622 mit Bild; der Eintrag ohne Bild ist Hideout_Music_Player.
const EXPECTED_ENTRY_COUNT = 2623;
const EXPECTED_UNIQUE_SLUGS = 2594;
const EXPECTED_ENTRIES_WITH_ART = 2622;
const EXPECTED_UNIQUE_ART_KEYS = 2584;

test('parsePoe2dbList: Anzahl Einträge, Slugs und artKeys der Fixture-Liste', () => {
  const entries = core.parsePoe2dbList(listDocument());
  assert.equal(entries.length, EXPECTED_ENTRY_COUNT);
  assert.equal(new Set(entries.map((e) => e.slug)).size, EXPECTED_UNIQUE_SLUGS);
  assert.equal(entries.filter((e) => e.artKey !== null).length, EXPECTED_ENTRIES_WITH_ART);
  assert.equal(new Set(entries.filter((e) => e.artKey !== null).map((e) => e.artKey)).size, EXPECTED_UNIQUE_ART_KEYS);
});

test('parsePoe2dbList: bekannte Einträge mit Slug, Name und artKey', () => {
  const bySlug = new Map(core.parsePoe2dbList(listDocument()).map((e) => [e.slug, e]));
  assert.deepEqual(bySlug.get('Wolf_of_Ogham_Pet'), {
    slug: 'Wolf_of_Ogham_Pet',
    name: 'Wolf of Ogham Pet',
    artKey: '2ditems/pets/geonorwolf',
  });
  assert.equal(bySlug.get('Chaotic_Stormborne_Body_Armour').artKey, '2ditems/effects/bodyarmour/blackstormbornehuntressbodyarmour');
  assert.equal(bySlug.get('Nursery_Web_Spider_Pet').artKey, '2ditems/pets/webling');
});

test('parsePoe2dbList: Eintrag ohne Bild bleibt mit artKey null erhalten', () => {
  const entry = core.parsePoe2dbList(listDocument()).find((e) => e.slug === 'Hideout_Music_Player');
  assert.deepEqual(entry, { slug: 'Hideout_Music_Player', name: 'Hideout Music Player', artKey: null });
});

test('parsePoe2dbList: Slug ist das rohe href-Attribut (URL-kodiert, nicht aufgelöst)', () => {
  const slugs = new Set(core.parsePoe2dbList(listDocument()).map((e) => e.slug));
  assert.ok(slugs.has('Kraken_Stash_Skin_%28Currency%29'));
});

test('parsePoe2dbList: Dokument ohne Einträge ergibt leere Liste', () => {
  assert.deepEqual(core.parsePoe2dbList(parseHtml('<html><body><p>Wartung</p></body></html>')), []);
});

const EXPECTED_DETAIL_IDS = {
  Stormborne_Helmet: ['StormborneHelmet', 'StormborneHelmetVariation'],
  Stormborne_Boots: ['StormborneBoots', 'StormborneBootsVariation'],
  Stormborne_Gloves: ['StormborneGloves', 'StormborneGlovesVariation'],
  Chaotic_Stormborne_Body_Armour: ['ChaoticStormborneBodyArmour'],
  Phoenix_Pet: ['PhoenixPet'],
  Blueflame_Phoenix_Pet: ['BlueflamePhoenixPet'],
  Abyssal_Phoenix_Pet: ['AbyssalPhoenixPet'],
  Legion_Commander_Boots: ['LegionCommanderBoots'],
  Scourge_Commander_Boots: ['ScourgeCommanderBoots'],
  Wolf_of_Ogham_Pet: ['WolfOfOghamPet'],
  Molten_Portal_Effect: ['MoltenPortalEffect', 'MoltenPortalEffectVariation'],
  Celestial_Body_Armour: ['CelestialBodyArmour'],
  Nursery_Web_Spider_Pet: [],
};

for (const [slug, expected] of Object.entries(EXPECTED_DETAIL_IDS)) {
  test(`parseDetailShopIds: ${slug}`, () => {
    const ids = core.parseDetailShopIds(parseHtml(readDetail(slug)));
    assert.deepEqual([...ids].sort(), [...expected].sort());
  });
}

test('parseDetailShopIds: Duplikate werden entfernt, Freitext außerhalb von Tabellenzeilen zählt nicht', () => {
  const doc = parseHtml(`
    <p>shop_us FreitextId</p>
    <table><tbody>
      <tr><td>shop_us</td><td><a href="https://www.pathofexile2.com/shop/item/A">A</a></td></tr>
      <tr><td>shop_tw</td><td><a href="https://pathofexile.tw/shop/item/TwOnly">TwOnly</a></td></tr>
      <tr><td>shop_us</td><td><a href="https://www.pathofexile2.com/shop/item/A">A</a></td></tr>
      <tr><td>shop_us</td><td>B</td></tr>
    </tbody></table>
    <table><tbody><tr><td>shop_us</td><td><a href="x">A</a></td></tr></tbody></table>`);
  assert.deepEqual(core.parseDetailShopIds(doc), ['A', 'B']);
});

test('detailUrl: Slug wird relativ zur Listen-URL aufgelöst, nur poe2db.tw/us/ erlaubt', () => {
  assert.equal(core.POE2DB_LIST_URL, 'https://poe2db.tw/us/Microtransactions');
  assert.equal(core.detailUrl('Wolf_of_Ogham_Pet'), 'https://poe2db.tw/us/Wolf_of_Ogham_Pet');
  assert.equal(core.detailUrl('Kraken_Stash_Skin_%28Currency%29'), 'https://poe2db.tw/us/Kraken_Stash_Skin_%28Currency%29');
  assert.equal(core.detailUrl('https://example.com/x'), null);
  assert.equal(core.detailUrl('../../evil'), null);
});

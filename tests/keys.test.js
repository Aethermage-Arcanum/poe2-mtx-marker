'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core.js');
const { readShopApi, cardElement } = require('./helpers.js');

test('artKeyFromShopImageUrl: Einzelitem-Bild aus DOM-Fixture (Wolf of Ogham)', () => {
  const href = cardElement('en_single_WolfOfOghamPet').querySelector('a.itemImage').getAttribute('data-href');
  assert.equal(core.artKeyFromShopImageUrl(href), '2ditems/pets/geonorwolf');
});

test('artKeyFromShopImageUrl: Varianten-Bilder aus DOM-Fixture (Phoenix)', () => {
  const srcs = [...cardElement('en_variant_PhoenixPetVariations').querySelectorAll('.variantSelector button.variant img')]
    .map((img) => img.getAttribute('src'));
  assert.deepEqual(srcs.map(core.artKeyFromShopImageUrl), [
    '2ditems/pets/phoenixpetblue',
    '2ditems/pets/phoenixpetred',
    '2ditems/pets/phoenixpetgreen',
  ]);
});

test('artKeyFromShopImageUrl: imageUrl aus Shop-API-Fixture (NurseryWebSpiderPet)', () => {
  const item = readShopApi('de_pets_100').items.find((i) => i.id === 'NurseryWebSpiderPet');
  assert.equal(core.artKeyFromShopImageUrl(item.imageUrl), '2ditems/pets/webling');
});

test('artKeyFromShopImageUrl: ungültige Eingaben ergeben null', () => {
  assert.equal(core.artKeyFromShopImageUrl(null), null);
  assert.equal(core.artKeyFromShopImageUrl(''), null);
  assert.equal(core.artKeyFromShopImageUrl('https://example.com/image/abc.png'), null);
  assert.equal(core.artKeyFromShopImageUrl('https://web.poecdn.com/gen/image/!!!kein-base64!!!/abc/x.png'), null);
  // base64url von [21,14,{"x":"2DItems/Pets/A"}] - JSON ohne "k"
  assert.equal(core.artKeyFromShopImageUrl('https://web.poecdn.com/gen/image/WzIxLDE0LHsieCI6IjJESXRlbXMvUGV0cy9BIn1d/abc/A.png'), null);
});

test('artKeyFromPoe2dbSrc: Pfad hinter /image/Art/ ohne .webp, lowercase', () => {
  assert.equal(core.artKeyFromPoe2dbSrc('https://cdn.poe2db.tw/image/Art/2DItems/Pets/GeonorWolf.webp'), '2ditems/pets/geonorwolf');
  assert.equal(
    core.artKeyFromPoe2dbSrc('https://cdn.poe2db.tw/image/Art/2DItems/Effects/BodyArmour/BlackStormborneHuntressBodyArmour.webp'),
    '2ditems/effects/bodyarmour/blackstormbornehuntressbodyarmour',
  );
});

test('artKeyFromPoe2dbSrc: URL-Kodierung im Pfad wird aufgelöst (Fixture-Eintrag NgamahuTikiALTART%20)', () => {
  assert.equal(
    core.artKeyFromPoe2dbSrc('https://cdn.poe2db.tw/image/Art/2DItems/Amulets/NgamahuTikiALTART%20.webp'),
    '2ditems/amulets/ngamahutikialtart ',
  );
});

test('artKeyFromPoe2dbSrc: fremde Pfade ergeben null', () => {
  assert.equal(core.artKeyFromPoe2dbSrc(null), null);
  assert.equal(core.artKeyFromPoe2dbSrc('https://cdn.poe2db.tw/image/Art/2DArt/UIImages/InGame/WorldMap/MapButtonUltimatum.webp'), null);
  assert.equal(core.artKeyFromPoe2dbSrc('https://example.com/image/Art/2DItems/Pets/GeonorWolf.webp'), null);
});

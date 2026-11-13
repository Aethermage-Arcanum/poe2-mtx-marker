'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { POE2DB_LIST_FIXTURE, POE2DB_DETAIL_DIR, listDocument } = require('./helpers.js');
const core = require('../lib/core.js');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'build-idmap.mjs');
const SHIPPED_MAP = path.join(ROOT, 'data', 'poe2db-shopid-map.json');

// Unabhängig ermittelte shop_us-Zuordnung der Fixture-Detailseiten.
const EXPECTED_MAP = {
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
const UNIQUE_LIST_SLUGS = 2594;

function sortedMap(map) {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]).sort(([a], [b]) => a.localeCompare(b)));
}

function runTool(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

test('build-idmap CLI: baut Map aus Fixture-Liste und -Details, meldet fehlende Detaildateien auf stderr', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poe2mtx-'));
  const outFile = path.join(outDir, 'map.json');
  const result = runTool([POE2DB_LIST_FIXTURE, POE2DB_DETAIL_DIR, outFile]);
  assert.equal(result.status, 0, result.stderr);

  const written = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(new Date(written.generatedAt).toISOString(), written.generatedAt);
  assert.deepEqual(sortedMap(written.map), sortedMap(EXPECTED_MAP));

  const missingLines = result.stderr.split(/\r?\n/).filter((line) => line.startsWith('fehlt: '));
  assert.equal(missingLines.length, UNIQUE_LIST_SLUGS - Object.keys(EXPECTED_MAP).length);
  assert.ok(missingLines.includes('fehlt: Hideout_Music_Player'));
  assert.equal(missingLines.includes('fehlt: Wolf_of_Ogham_Pet'), false);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('build-idmap CLI: falsche Argumente -> Exit-Code != 0 und Hinweis auf Aufruf', () => {
  const result = runTool([POE2DB_LIST_FIXTURE]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /build-idmap\.mjs <list\.html> <detailDir> <out\.json>/);
});

test('data/poe2db-shopid-map.json: volle Map, deckt die Listen-Fixture ab, Fixture-Slugs exakt', () => {
  const shipped = JSON.parse(fs.readFileSync(SHIPPED_MAP, 'utf8'));
  assert.equal(new Date(shipped.generatedAt).toISOString(), shipped.generatedAt);
  for (const [slug, ids] of Object.entries(EXPECTED_MAP)) {
    assert.deepEqual(shipped.map[slug], ids, slug);
  }
  // Map und Listen-Fixture stammen vom selben Stand; beim Neubau der Map auch die Fixture erneuern.
  const listSlugs = new Set(core.parsePoe2dbList(listDocument()).map((e) => e.slug));
  const uncovered = [...listSlugs].filter((slug) => !Object.prototype.hasOwnProperty.call(shipped.map, slug));
  assert.deepEqual(uncovered, []);
  for (const ids of Object.values(shipped.map)) {
    assert.ok(Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id !== ''));
  }
});

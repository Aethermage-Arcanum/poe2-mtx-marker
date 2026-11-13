'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/core.js');
const { listDocument } = require('./helpers.js');

const realEntries = core.parsePoe2dbList(listDocument());
const NOW = new Date(2026, 10, 13, 15, 30).getTime();
const CACHED_AT = new Date(2026, 10, 12, 9, 5).getTime();

test('Cache-Fallback: Fetch erfolgreich -> Quelle live, Zeitstempel jetzt, Cache wird geschrieben', () => {
  const state = core.resolveDataState({
    fetchResult: { ok: true, entries: realEntries },
    cache: { entries: realEntries.slice(0, 10), fetchedAt: CACHED_AT },
    now: NOW,
  });
  assert.equal(state.source, core.DATA_SOURCES.LIVE);
  assert.equal(state.entries, realEntries);
  assert.equal(state.fetchedAt, NOW);
  assert.equal(state.error, null);
  assert.equal(state.storeCache, true);
});

test('Cache-Fallback: Fetch-Fehler mit Cache -> Quelle cache, Zeitstempel des Caches, Fehler bleibt sichtbar', () => {
  const state = core.resolveDataState({
    fetchResult: { ok: false, error: 'HTTP 503' },
    cache: { entries: realEntries, fetchedAt: CACHED_AT },
    now: NOW,
  });
  assert.equal(state.source, core.DATA_SOURCES.CACHE);
  assert.equal(state.entries, realEntries);
  assert.equal(state.fetchedAt, CACHED_AT);
  assert.equal(state.error, 'HTTP 503');
  assert.equal(state.storeCache, false);
});

test('Cache-Fallback: Fetch-Fehler ohne Cache -> Quelle none, keine Einträge', () => {
  const state = core.resolveDataState({ fetchResult: { ok: false, error: 'NetworkError' }, cache: null, now: NOW });
  assert.deepEqual(state, {
    source: core.DATA_SOURCES.NONE,
    entries: null,
    fetchedAt: null,
    error: 'NetworkError',
    storeCache: false,
  });
});

test('Cache-Fallback: leere Live-Liste gilt als Fehler und überschreibt den Cache nicht', () => {
  const state = core.resolveDataState({
    fetchResult: { ok: true, entries: [] },
    cache: { entries: realEntries, fetchedAt: CACHED_AT },
    now: NOW,
  });
  assert.equal(state.source, core.DATA_SOURCES.CACHE);
  assert.equal(state.fetchedAt, CACHED_AT);
  assert.equal(state.error, core.ERROR_TEXTS.EMPTY_LIST);
  assert.equal(state.storeCache, false);
});

test('Cache-Fallback: leerer Cache zählt nicht als Cache', () => {
  const state = core.resolveDataState({
    fetchResult: { ok: false, error: 'HTTP 500' },
    cache: { entries: [], fetchedAt: CACHED_AT },
    now: NOW,
  });
  assert.equal(state.source, core.DATA_SOURCES.NONE);
});

test('formatDateTime / staleNoticeText: lokales Datum TT.MM.JJJJ HH:MM', () => {
  assert.equal(core.formatDateTime(CACHED_AT), '12.11.2026 09:05');
  assert.equal(core.staleNoticeText(CACHED_AT), 'Stand vom 12.11.2026 09:05');
});

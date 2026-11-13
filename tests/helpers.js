'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const DOM_FIXTURE_DIR = path.join(FIXTURE_DIR, 'dom');
const POE2DB_LIST_FIXTURE = path.join(FIXTURE_DIR, 'poe2db', 'list_2026-11-13.html');
const POE2DB_DETAIL_DIR = path.join(FIXTURE_DIR, 'poe2db', 'detail');
const SHOP_API_DIR = path.join(FIXTURE_DIR, 'shop-api');

const parserWindow = new JSDOM('').window;

function parseHtml(html) {
  return new parserWindow.DOMParser().parseFromString(html, 'text/html');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function readDomFixture(name) {
  return readText(path.join(DOM_FIXTURE_DIR, `${name}.html`));
}

function readShopApi(name) {
  return JSON.parse(readText(path.join(SHOP_API_DIR, `${name}.json`)));
}

function detailSlugs() {
  return fs.readdirSync(POE2DB_DETAIL_DIR)
    .filter((f) => f.endsWith('.html'))
    .map((f) => decodeURIComponent(f.slice(0, -'.html'.length)));
}

function readDetail(slug) {
  return readText(path.join(POE2DB_DETAIL_DIR, `${encodeURIComponent(slug)}.html`));
}

let listDocCache = null;
function listDocument() {
  if (!listDocCache) listDocCache = parseHtml(readText(POE2DB_LIST_FIXTURE));
  return listDocCache;
}

function cardElement(name) {
  const doc = parseHtml(`<div id="mtx-list">${readDomFixture(name)}</div>`);
  return doc.querySelector('#mtx-list > div');
}

module.exports = {
  FIXTURE_DIR,
  POE2DB_LIST_FIXTURE,
  POE2DB_DETAIL_DIR,
  parseHtml,
  readText,
  readDomFixture,
  readShopApi,
  detailSlugs,
  readDetail,
  listDocument,
  cardElement,
};

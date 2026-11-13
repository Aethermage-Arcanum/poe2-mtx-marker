'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { MARK_CLASS, LABEL_CLASS, CSS_VARS } = require('../content.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'content.css'), 'utf8');
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
const styleEl = dom.window.document.createElement('style');
styleEl.textContent = CSS;
dom.window.document.head.appendChild(styleEl);
const rules = [...dom.window.document.styleSheets[0].cssRules];

function ruleFor(predicate) {
  const found = rules.filter((rule) => rule.selectorText && predicate(rule.selectorText));
  assert.equal(found.length, 1, `genau eine passende Regel erwartet, gefunden: ${found.length}`);
  return found[0].style;
}

test('content.css: markierte Karte mit echtem border und box-sizing border-box (Kartenbreite bleibt 460 px)', () => {
  const style = ruleFor((selector) => selector.includes(`.${MARK_CLASS}`));
  assert.equal(style.getPropertyValue('box-sizing'), 'border-box');
  // Mit var() im Shorthand bleiben die Longhands laut CSS-Spezifikation leer; daher den Shorthand prüfen.
  const border = style.getPropertyValue('border');
  assert.match(border, /(^|\s)[1-9]\d*px(\s|$)/);
  assert.match(border, /(^|\s)solid(\s|$)/);
});

test('content.css: Label innerhalb der Karte unten rechts, kein top / margin-top', () => {
  const style = ruleFor((selector) => selector.trim() === `.${LABEL_CLASS}`);
  assert.equal(style.getPropertyValue('position'), 'absolute');
  assert.notEqual(style.getPropertyValue('bottom'), '');
  assert.notEqual(style.getPropertyValue('right'), '');
  assert.equal(style.getPropertyValue('top'), '');
  assert.equal(style.getPropertyValue('margin-top'), '');
});

test('content.css: Label-Schrift nutzt die Kontrast-Variable, kein text-shadow', () => {
  const style = ruleFor((selector) => selector.trim() === `.${LABEL_CLASS}`);
  assert.equal(style.getPropertyValue('color'), `var(${CSS_VARS.LABEL_TEXT})`);
  assert.equal(style.getPropertyValue('text-shadow'), '');
});

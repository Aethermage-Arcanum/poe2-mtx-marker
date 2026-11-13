(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PoE2Mtx = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SHOP_IMAGE_PATH_MARKER = '/gen/image/';
  const SHOP_IMAGE_HOST = 'web.poecdn.com';
  const POE2DB_IMAGE_PREFIX = 'https://cdn.poe2db.tw/image/Art/';
  const POE2DB_IMAGE_SUFFIX = '.webp';
  const ART_KEY_ROOT = '2ditems/';

  function decodeBase64Url(segment) {
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function artKeyFromShopImageUrl(url) {
    if (typeof url !== 'string' || url === '') return null;
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return null;
    }
    if (parsed.hostname !== SHOP_IMAGE_HOST || !parsed.pathname.startsWith(SHOP_IMAGE_PATH_MARKER)) return null;
    const segment = parsed.pathname.slice(SHOP_IMAGE_PATH_MARKER.length).split('/')[0];
    let payload;
    try {
      payload = JSON.parse(decodeBase64Url(segment));
    } catch (e) {
      return null;
    }
    if (!Array.isArray(payload)) return null;
    const descriptor = payload.find((part) => part && typeof part === 'object' && typeof part.k === 'string');
    return descriptor ? descriptor.k.toLowerCase() : null;
  }

  function artKeyFromPoe2dbSrc(src) {
    if (typeof src !== 'string' || !src.startsWith(POE2DB_IMAGE_PREFIX) || !src.endsWith(POE2DB_IMAGE_SUFFIX)) return null;
    const rawPath = src.slice(POE2DB_IMAGE_PREFIX.length, -POE2DB_IMAGE_SUFFIX.length);
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch (e) {
      decoded = rawPath;
    }
    const key = decoded.toLowerCase();
    return key.startsWith(ART_KEY_ROOT) ? key : null;
  }

  const POE2DB_SELECTORS = Object.freeze({
    LIST_LINK: 'a.MTXTypes',
    LIST_NAME_LINK: 'div.fw-bold > a.MTXTypes',
    LIST_ENTRY_CONTAINER: '.d-flex',
    LIST_IMAGE: 'a.MTXTypes img',
    DETAIL_ROW: 'tr',
  });
  const DETAIL_SHOP_ID_KEY = 'shop_us';
  const HREF_ATTR = 'href';
  const SRC_ATTR = 'src';

  function listEntryArtKey(nameLink, slug) {
    const container = nameLink.closest(POE2DB_SELECTORS.LIST_ENTRY_CONTAINER);
    if (!container) return null;
    const img = [...container.querySelectorAll(POE2DB_SELECTORS.LIST_IMAGE)]
      .find((candidate) => candidate.closest(POE2DB_SELECTORS.LIST_LINK).getAttribute(HREF_ATTR) === slug);
    return img ? artKeyFromPoe2dbSrc(img.getAttribute(SRC_ATTR)) : null;
  }

  function parsePoe2dbList(doc) {
    return [...doc.querySelectorAll(POE2DB_SELECTORS.LIST_NAME_LINK)]
      .map((nameLink) => {
        const slug = nameLink.getAttribute(HREF_ATTR);
        return { slug, name: nameLink.textContent.trim(), artKey: listEntryArtKey(nameLink, slug) };
      })
      .filter((entry) => entry.slug);
  }

  const POE2DB_LIST_URL = 'https://poe2db.tw/us/Microtransactions';
  const POE2DB_DETAIL_BASE_URL = 'https://poe2db.tw/us/';

  function detailUrl(slug) {
    let resolved;
    try {
      resolved = new URL(slug, POE2DB_LIST_URL).href;
    } catch (e) {
      return null;
    }
    return resolved.startsWith(POE2DB_DETAIL_BASE_URL) ? resolved : null;
  }

  function parseDetailShopIds(doc) {
    const ids = [];
    for (const row of doc.querySelectorAll(POE2DB_SELECTORS.DETAIL_ROW)) {
      const cells = [...row.children];
      if (cells.length < 2 || cells[0].textContent.trim() !== DETAIL_SHOP_ID_KEY) continue;
      const id = cells[1].textContent.trim();
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  const SHOP_SELECTORS = Object.freeze({
    LIST_CONTAINER: '#mtx-list',
    CARD: '#mtx-list > div.shopItemBase[id]',
    BUNDLE_CLASS: 'shopItemPackage',
    VARIANT_MARKER: '.variantGroupInfo',
    NAME: 'h4.name-container > a.name',
    SINGLE_IMAGE: 'a.itemImage[data-href]',
    VARIANT_BUTTON: '.variantSelector button.variant[data-variant]',
    VARIANT_IMAGE: 'img[src]',
    BUNDLE_LINE_ITEM: '.lineItems .lineItem[data-id]',
  });
  const SHOP_ATTRS = Object.freeze({
    IMAGE_HREF: 'data-href',
    VARIANT_ID: 'data-variant',
    LINE_ITEM_ID: 'data-id',
  });

  const CARD_TYPES = Object.freeze({
    SINGLE: 'single',
    VARIANT: 'variant',
    BUNDLE: 'bundle',
  });

  function cardType(el) {
    if (el.classList.contains(SHOP_SELECTORS.BUNDLE_CLASS)) return CARD_TYPES.BUNDLE;
    if (el.querySelector(SHOP_SELECTORS.VARIANT_MARKER)) return CARD_TYPES.VARIANT;
    return CARD_TYPES.SINGLE;
  }

  function cardChildren(el, type) {
    if (type === CARD_TYPES.BUNDLE) {
      return [...el.querySelectorAll(SHOP_SELECTORS.BUNDLE_LINE_ITEM)]
        .map((line) => ({ id: line.getAttribute(SHOP_ATTRS.LINE_ITEM_ID), artKey: null }));
    }
    if (type === CARD_TYPES.VARIANT) {
      return [...el.querySelectorAll(SHOP_SELECTORS.VARIANT_BUTTON)].map((button) => {
        const img = button.querySelector(SHOP_SELECTORS.VARIANT_IMAGE);
        return {
          id: button.getAttribute(SHOP_ATTRS.VARIANT_ID),
          artKey: img ? artKeyFromShopImageUrl(img.getAttribute(SRC_ATTR)) : null,
        };
      });
    }
    const image = el.querySelector(SHOP_SELECTORS.SINGLE_IMAGE);
    return [{ id: el.id, artKey: image ? artKeyFromShopImageUrl(image.getAttribute(SHOP_ATTRS.IMAGE_HREF)) : null }];
  }

  function extractCard(el) {
    const type = cardType(el);
    const nameLink = el.querySelector(SHOP_SELECTORS.NAME);
    return {
      id: el.id,
      type,
      name: nameLink ? nameLink.textContent.trim() : '',
      children: cardChildren(el, type),
    };
  }

  const LABEL_TEXT = 'PoE2 ready';

  function buildIndex(entries, idMap) {
    const shopIds = new Set();
    const artKeys = new Set();
    const missingSlugs = [];
    const seenSlugs = new Set();
    for (const entry of entries) {
      if (entry.artKey) artKeys.add(entry.artKey);
      if (seenSlugs.has(entry.slug)) continue;
      seenSlugs.add(entry.slug);
      if (Object.prototype.hasOwnProperty.call(idMap, entry.slug)) {
        for (const id of idMap[entry.slug]) shopIds.add(id);
      } else {
        missingSlugs.push(entry.slug);
      }
    }
    return { shopIds, artKeys, missingSlugs };
  }

  function indexToPayload(index) {
    return { shopIds: [...index.shopIds], artKeys: [...index.artKeys] };
  }

  function indexFromPayload(payload) {
    return { shopIds: new Set(payload.shopIds), artKeys: new Set(payload.artKeys) };
  }

  function evaluateCard(card, index) {
    const matched = card.children.filter(
      (child) => index.shopIds.has(child.id) || (child.artKey !== null && index.artKeys.has(child.artKey)),
    ).length;
    return { matched, total: card.children.length };
  }

  const MIN_ITEMS_FOR_COUNT_LABEL = 2;

  function labelText(result) {
    if (result.matched === 0) return null;
    if (result.total < MIN_ITEMS_FOR_COUNT_LABEL) return LABEL_TEXT;
    return `${LABEL_TEXT} ${result.matched}/${result.total}`;
  }

  const DATA_SOURCES = Object.freeze({
    LIVE: 'live',
    CACHE: 'cache',
    NONE: 'none',
  });

  const ERROR_TEXTS = Object.freeze({
    EMPTY_LIST: 'Die poe2db-Liste enthält keine lesbaren Einträge.',
  });

  function hasEntries(value) {
    return Boolean(value) && Array.isArray(value.entries) && value.entries.length > 0;
  }

  function resolveDataState({ fetchResult, cache, now }) {
    if (fetchResult.ok && fetchResult.entries.length > 0) {
      return { source: DATA_SOURCES.LIVE, entries: fetchResult.entries, fetchedAt: now, error: null, storeCache: true };
    }
    const error = fetchResult.ok ? ERROR_TEXTS.EMPTY_LIST : fetchResult.error;
    if (hasEntries(cache)) {
      return { source: DATA_SOURCES.CACHE, entries: cache.entries, fetchedAt: cache.fetchedAt, error, storeCache: false };
    }
    return { source: DATA_SOURCES.NONE, entries: null, fetchedAt: null, error, storeCache: false };
  }

  const STALE_NOTICE_PREFIX = 'Stand vom';

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatDateTime(timestamp) {
    const d = new Date(timestamp);
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function staleNoticeText(timestamp) {
    return `${STALE_NOTICE_PREFIX} ${formatDateTime(timestamp)}`;
  }

  const DEFAULT_SETTINGS = Object.freeze({ color: '#ff2a2a', intensity: 60 });
  const INTENSITY_MIN = 0;
  const INTENSITY_MAX = 100;
  const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
  const GLOW_BLUR_BASE_PX = 4;
  const GLOW_BLUR_PER_STEP_PX = 0.36;
  const GLOW_SPREAD_PER_STEP_PX = 0.08;

  function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
  }

  function normalizeSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const color = typeof source.color === 'string' && HEX_COLOR_PATTERN.test(source.color)
      ? source.color.toLowerCase()
      : DEFAULT_SETTINGS.color;
    const numeric = toNumber(source.intensity);
    const intensity = Number.isFinite(numeric)
      ? Math.min(INTENSITY_MAX, Math.max(INTENSITY_MIN, Math.round(numeric)))
      : DEFAULT_SETTINGS.intensity;
    return { color, intensity };
  }

  function glowStyle(settings) {
    const blur = Math.round(GLOW_BLUR_BASE_PX + settings.intensity * GLOW_BLUR_PER_STEP_PX);
    const spread = Math.round(settings.intensity * GLOW_SPREAD_PER_STEP_PX);
    return { color: settings.color, boxShadow: `0 0 ${blur}px ${spread}px ${settings.color}` };
  }

  const STORAGE_KEYS = Object.freeze({
    SETTINGS: 'settings',
    LIST_CACHE: 'poe2dbListCache',
    RUNTIME_ID_MAP: 'runtimeIdMap',
    STATUS: 'dataStatus',
  });

  const MESSAGE_TYPES = Object.freeze({
    PAGE_OPENED: 'poe2mtx:pageOpened',
    DATA_UPDATED: 'poe2mtx:dataUpdated',
    GET_STATS: 'poe2mtx:getStats',
  });

  const SHOP_URL_PATTERN = '*://*.pathofexile.com/shop*';
  const HOST_PERMISSIONS = Object.freeze(['*://*.pathofexile.com/*', 'https://poe2db.tw/*']);

  return {
    STORAGE_KEYS,
    MESSAGE_TYPES,
    SHOP_URL_PATTERN,
    HOST_PERMISSIONS,
    SHOP_SELECTORS,
    CARD_TYPES,
    DATA_SOURCES,
    ERROR_TEXTS,
    DEFAULT_SETTINGS,
    INTENSITY_MIN,
    INTENSITY_MAX,
    LABEL_TEXT,
    resolveDataState,
    formatDateTime,
    staleNoticeText,
    normalizeSettings,
    glowStyle,
    buildIndex,
    indexToPayload,
    indexFromPayload,
    evaluateCard,
    labelText,
    artKeyFromShopImageUrl,
    artKeyFromPoe2dbSrc,
    parsePoe2dbList,
    parseDetailShopIds,
    POE2DB_LIST_URL,
    detailUrl,
    extractCard,
  };
});

(function (root) {
  'use strict';

  const core = root.PoE2Mtx || require('./lib/core.js');

  const OPTION_IDS = Object.freeze({
    COLOR: 'color',
    INTENSITY: 'intensity',
    INTENSITY_VALUE: 'intensity-value',
    PREVIEW: 'preview',
    PREVIEW_LABEL: 'preview-label',
  });
  const INPUT_EVENT = 'input';

  async function initOptions({ document, storage, t }) {
    core.localizeDocument(document, t);
    const byId = (id) => document.getElementById(id);
    const colorInput = byId(OPTION_IDS.COLOR);
    const intensityInput = byId(OPTION_IDS.INTENSITY);
    intensityInput.min = String(core.INTENSITY_MIN);
    intensityInput.max = String(core.INTENSITY_MAX);
    byId(OPTION_IDS.PREVIEW_LABEL).textContent = core.LABEL_TEXT;

    function applyPreview(settings) {
      const glow = core.glowStyle(settings);
      const preview = byId(OPTION_IDS.PREVIEW);
      preview.style.borderColor = glow.color;
      preview.style.boxShadow = glow.boxShadow;
      byId(OPTION_IDS.PREVIEW_LABEL).style.background = glow.color;
      byId(OPTION_IDS.PREVIEW_LABEL).style.color = core.labelTextColor(glow.color);
      byId(OPTION_IDS.INTENSITY_VALUE).textContent = String(settings.intensity);
    }

    const stored = await storage.get(core.STORAGE_KEYS.SETTINGS);
    const initial = core.normalizeSettings(stored[core.STORAGE_KEYS.SETTINGS]);
    colorInput.value = initial.color;
    intensityInput.value = String(initial.intensity);
    applyPreview(initial);

    function onInput() {
      const settings = core.normalizeSettings({ color: colorInput.value, intensity: intensityInput.value });
      applyPreview(settings);
      return storage.set({ [core.STORAGE_KEYS.SETTINGS]: settings });
    }
    colorInput.addEventListener(INPUT_EVENT, onInput);
    intensityInput.addEventListener(INPUT_EVENT, onInput);
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { initOptions, OPTION_IDS };
  } else {
    const t = core.createTranslator((key, substitutions) => root.browser.i18n.getMessage(key, substitutions));
    initOptions({ document: root.document, storage: root.browser.storage.local, t });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

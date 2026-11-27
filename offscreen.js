(function (root) {
  'use strict';

  // Nur Chromium: Offscreen-Dokument, in dem der Service Worker poe2db-HTML parsen lässt.
  const core = root.PoE2Mtx || require('./lib/core.js');

  const HTML_MIME_TYPE = 'text/html';

  function errorText(error) {
    return error && error.message ? error.message : String(error);
  }

  // Antwort für PARSE_HTML: {result} oder {error}; andere Nachrichten gehen dieses Dokument nichts an.
  function createParseHandler(DOMParser) {
    return (message) => {
      if (!message || message.type !== core.MESSAGE_TYPES.PARSE_HTML) return undefined;
      try {
        const doc = new DOMParser().parseFromString(message.html, HTML_MIME_TYPE);
        return Promise.resolve({ result: core.parsePoe2db(message.kind, doc) });
      } catch (error) {
        return Promise.resolve({ error: errorText(error) });
      }
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { createParseHandler };
  } else {
    core.extensionApi(root).runtime.onMessage.addListener(core.messageListener(createParseHandler(root.DOMParser)));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Firefox-Extension (Manifest V3, kein Build-Schritt), die auf `*.pathofexile.com/shop*` Karten markiert, deren
MTX laut https://poe2db.tw/us/Microtransactions in PoE2 verfügbar sind. Projektsprache ist Deutsch (Code-Kommentare,
UI-Texte, Commit-Messages im Stil `feat:`/`fix:`/`test:`/`docs:`/`data:`/`tools:` + deutscher Satz).
`README.md` enthält die fachliche Spezifikation (Label-Regeln, Optik, Phase-0-Befunde zu Shop-DOM und poe2db) –
vor Änderungen am Matching oder an der Darstellung dort nachlesen. `LESSONS_LEARNED.md` sammelt Fallstricke und
wird bei neuen Erkenntnissen ergänzt.

## Befehle

```
npm install                              # devDependencies: jsdom (Tests), web-ext (lint/build/sign)
npm test                                 # node --test, alle tests/*.test.js
node --test tests/matching.test.js       # einzelne Testdatei
node --test --test-name-pattern="<Name>" # einzelner Test
node tools/build-idmap.mjs temp/poe2db_mtx.html temp/poe2db_detail data/poe2db-shopid-map.json
npm run lint                             # web-ext lint (2 erwartete Warnungen zu data_collection_permissions)
npm run build                            # unsigniertes ZIP nach web-ext-artifacts/
npm run sign                             # unlisted bei AMO signieren, braucht WEB_EXT_API_KEY/_SECRET
```

Signieren/Weitergeben siehe README-Abschnitt "Signieren und weitergeben". `npm run sign` lädt das Paket zu
Mozilla hoch – nur auf ausdrücklichen Wunsch ausführen. Neue Extension-Dateien sind automatisch im Paket;
neue Nicht-Extension-Dateien im Wurzelverzeichnis in `web-ext-config.mjs` unter `ignoreFiles` eintragen.

Laden in Firefox: `about:debugging#/runtime/this-firefox` → "Temporäres Add-on laden" → `manifest.json`.

Abnahme im echten Firefox (Python 3.13, Selenium, Daten und Ergebnisse in `temp/`, gitignored): Ablauf siehe
README-Abschnitt "Abnahme in Firefox". `tools/acceptance/expected.py` berechnet Soll-Werte bewusst mit einem
eigenen Parser, unabhängig vom Extension-Code – nicht auf `lib/core.js` umstellen.

## Architektur

- **`lib/core.js`** ist reine, DOM-API-basierte Logik ohne Browser-Seiteneffekte (UMD: im Browser global
  `PoE2Mtx`, in Node per `require`). Alle Konstanten (Selektoren, Storage-Keys, Message-Typen, Texte) liegen hier.
  Parser bekommen ein fertiges `Document`; den `DOMParser` liefert der Aufrufer (Firefox im Background, jsdom in
  Tests und `tools/build-idmap.mjs`).
- **`background.js`, `content.js`** folgen demselben Muster: eine Fabrik (`createBackgroundService`,
  `createMarker`) mit injizierten Abhängigkeiten (fetch, storage, now, sleep, logger, MutationObserver …) plus
  ein `bootstrap`, das nur außerhalb von Node läuft (`module.exports` vorhanden → nur exportieren). Tests rufen
  die Fabriken mit Fakes auf; neue Browser-Zugriffe daher ebenfalls injizieren statt direkt `browser.*` zu nutzen.
- **Datenfluss:** Content-Script sendet `PAGE_OPENED` → Background lädt die poe2db-Liste live (bei Fehler
  Cache-Fallback über `resolveDataState`, Status in `dataStatus`), baut den Index aus Liste + ID-Map und
  antwortet mit `{index, source, fetchedAt, error}`. Fehlende Slugs lädt der Background sequentiell nach
  (≥ 1200 ms Abstand zwischen poe2db-Requests), speichert sie in `runtimeIdMap` und schickt `DATA_UPDATED` an
  alle offenen Shop-Tabs. Popup fragt Zahlen per `GET_STATS` beim Content-Script ab; Optionen wirken über
  `storage.onChanged`.
- **Matching ("Option D"):** Item trifft, wenn seine Shop-ID zu einem gelisteten Slug gehört (ID-Map =
  mitgelieferte `data/poe2db-shopid-map.json`, überlagert von `runtimeIdMap`) oder sein artKey (aus dem
  base64url-Segment der Shop-Bild-URL bzw. dem poe2db-Bildpfad) einem gelisteten Eintrag entspricht.
  Die Extension arbeitet rein DOM-basiert (Varianten-/Bündel-Kinder aus dem Karten-DOM), nicht über die Shop-API.
- **Content-Script** bewertet Karten erst, wenn `isCardRendered` gilt, und bewertet bei Mutationen im
  Karten-Teilbaum neu (Shop hängt Karten leer an und befüllt sie asynchron). Eigene Label-Mutationen werden
  ignoriert.
- **Texte (i18n):** Nutzertexte stehen in `_locales/{de,en}/messages.json` (`default_locale` en), nicht im Code.
  Ein Übersetzer `t` (`core.createTranslator` über `browser.i18n.getMessage`) wird wie andere Abhängigkeiten
  injiziert; HTML-Texte per `data-i18n` und `core.localizeDocument`. Tests nutzen `translator(locale)` aus
  `tests/helpers.js`; `tests/i18n.test.js` prüft gleiche Schlüssel in allen Sprachen und keine fehlenden/toten
  Schlüssel. Konsolen-Logs und technische Fehlergründe bleiben unübersetzt. Neue Dateien/Ordner der Extension
  auch in `EXT_FILES` von `tools/acceptance/acceptance_firefox.py` eintragen.

## Fallstricke

- jsdom rechnet kein Layout: Breiten-/Rahmenprobleme (920-px-Flex mit 460-px-Karten, daher
  `box-sizing: border-box` an markierten Karten) und asynchrones Befüllen zeigen sich nur in der
  Firefox-Abnahme.
- poe2db-Slugs sind rohe, teils schon URL-kodierte `href`-Werte; nie erneut kodieren. Detail-Dateinamen in
  Fixtures/`temp/` sind `encodeURIComponent(slug) + ".html"`.
- Beim Neubau der ID-Map auch `tests/fixtures/poe2db/list_*.html` auf denselben Stand bringen; ein Test prüft
  die Abdeckung der mitgelieferten Map gegen die Listen-Fixture.
- Fixtures unter `tests/fixtures/` sind echte Abzüge (Shop-DOM EN/DE, Shop-API, poe2db); Testhelfer in
  `tests/helpers.js`.

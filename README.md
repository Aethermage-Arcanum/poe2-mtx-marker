# poe2-mtx-marker

Firefox-Extension (Manifest V3), die auf den Shop-Seiten von pathofexile.com (alle Sprach-Subdomains)
Karten markiert, deren MTX laut https://poe2db.tw/us/Microtransactions in Path of Exile 2 verfügbar sind.

## Status

Phase 1 abgeschlossen (2026-11-13). Abnahme im installierten Firefox als temporäres Add-on per Selenium:
www. und de., Kategorien pets (233), armour-effects (457) und bundles (47) inkl. Endlos-Scroll mit
0 Abweichungen gegen unabhängig berechnete Soll-Werte; Optionen wirken live; Cache-Fallback mit
"Stand vom"-Hinweis; ohne Cache keine Markierung und Fehlermeldung im Popup. Die ID-Map
(`data/poe2db-shopid-map.json`) hat den Stand der poe2db-Liste vom 2026-11-13.

Schlüsselstrategie "Option D" ist freigegeben und umgesetzt: Ein Shop-Item ist ein
Treffer, wenn seine Shop-ID zu einem aktuell auf poe2db gelisteten Slug gehört (Zuordnung Slug -> Shop-IDs
aus den poe2db-Detailseiten) oder sein Bildpfad-Schlüssel (artKey) dem eines gelisteten Eintrags entspricht.

Label an markierten Karten (ab 1 Treffer): Karten mit genau einem Item (Einzelitem, aber auch Bündel oder
Varianten-Gruppe mit nur einem Item) zeigen "PoE2 ready", Karten mit mindestens zwei Items "PoE2 ready x/y"
(x = Treffer, y = Anzahl Items). 0 Treffer: keine Markierung, kein Label.
Optik: Das Label sitzt innerhalb der Karte linksbündig direkt unter dem Kaufen-Button, im freien
Streifen am unteren Kartenrand (`left: 10px; bottom: 4px`). Markierte Karten erhalten `box-sizing: border-box`,
damit der 2-px-Rahmen die Kartenbreite (460 px im 920 px breiten Flex-Container) nicht vergrößert und das
zweispaltige Layout erhalten bleibt.
Die Label-Schrift ist schwarz oder weiß, je nachdem, was auf der eingestellten Farbe den höheren
WCAG-2-Kontrast hat (bei Gleichstand schwarz); das Content-Script setzt sie als CSS-Variable
`--poe2mtx-label-text`, die Options-Vorschau nutzt dieselbe Regel.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `manifest.json` | MV3-Manifest (Firefox, Background als `scripts`) |
| `lib/core.js` | Reine Kernlogik: Schlüssel, Parser, Kartenextraktion, Index, Bewertung, Label, Cache-Entscheidung, Einstellungen. Im Browser global `PoE2Mtx`, in Node per `require` |
| `background.js` | Lädt bei jedem Shop-Seitenaufruf die poe2db-Liste live, Cache-Fallback, Status, Nachladen fehlender Detailseiten (sequentiell, >= 1200 ms Abstand), Benachrichtigung offener Shop-Tabs |
| `content.js`, `content.css` | Markiert Karten in `#mtx-list` (MutationObserver), Label, Hinweis "Stand vom" bei Cache-Daten, Konsolen-Protokoll nicht gematchter Karten |
| `popup.html`, `popup.js` | Treffer, Karten gesamt, Datenstand, Quelle, Fehler- und Berechtigungshinweise |
| `options.html`, `options.js` | Farbe, Intensität, Live-Vorschau; offene Shop-Tabs übernehmen Änderungen über `storage.onChanged` |
| `_locales/{de,en}/messages.json` | Texte von Manifest-Beschreibung, Popup, Optionen und "Stand vom"-Hinweis; Firefox wählt nach seiner Sprache, sonst Englisch (`default_locale`). Das Label "PoE2 ready" ist in allen Sprachen gleich |
| `icons/icon.svg`, `icons/icon-small.svg` | Icon ab 48 px mit Schriftzug, 16/32 px (Toolbar) ohne. Flach, ohne Verläufe; Schriftzug "PoE2" als Pfade aus Cinzel (SIL Open Font License 1.1) |
| `data/poe2db-shopid-map.json` | Mitgelieferte Zuordnung Slug -> Shop-IDs (`{"generatedAt", "map"}`) |
| `tools/build-idmap.mjs` | Baut die Zuordnung aus einer Listen-HTML und gecachten Detailseiten |
| `tools/acceptance/` | Datenabruf und Firefox-Abnahme per Selenium (siehe unten) |
| `tests/` | Node-Tests (`node --test`) mit den echten Fixtures aus Phase 0 |

HTML wird im Background mit dem `DOMParser` von Firefox geparst, in Tests und im Build-Tool mit dem
`DOMParser` von jsdom. Die Parser-Funktionen in `lib/core.js` bekommen jeweils ein fertiges `Document`.

## Laden in Firefox

1. `about:debugging#/runtime/this-firefox` öffnen.
2. "Temporäres Add-on laden ..." und `manifest.json` aus diesem Ordner wählen.
3. Unter `about:addons` > PoE2 MTX Marker > Berechtigungen prüfen, dass der Zugriff auf
   pathofexile.com und poe2db.tw erlaubt ist (in Firefox MV3 vom Nutzer entziehbar; das Popup meldet es).

## Signieren und weitergeben

Release-Firefox installiert dauerhaft nur von Mozilla signierte Add-ons. Signiert wird "unlisted": kostenlos,
automatische Prüfung, das Add-on erscheint nicht im Store. Die signierte `.xpi` kann man direkt weitergeben
(in Firefox ziehen oder öffnen).

1. Auf addons.mozilla.org anmelden, unter Developer Hub > Tools > Manage API Keys einen JWT-Issuer und ein
   Secret erzeugen. Die Schlüssel nicht ins Repo schreiben.
2. Vor jeder neuen Signierung `version` in `manifest.json` (und `package.json`) erhöhen; eine Version lässt
   sich nur einmal signieren. Die Add-on-ID (`poe2-mtx-marker@djih`) nicht mehr ändern, Updates hängen an ihr.
3. Prüfen und signieren (PowerShell):
   ```
   npm run lint
   $env:WEB_EXT_API_KEY = "<JWT-Issuer>"; $env:WEB_EXT_API_SECRET = "<Secret>"
   npm run sign
   ```
   Die signierte `.xpi` landet in `web-ext-artifacts/` (gitignored).

`web-ext-config.mjs` legt fest, was ins Paket kommt (nur die Extension-Dateien, keine Tests, Tools, Doku),
und setzt den Kanal `unlisted`. `npm run build` baut ein unsigniertes ZIP zum Prüfen des Paketinhalts.
`npm run lint` meldet zwei erwartete Warnungen: `data_collection_permissions` wird erst ab Firefox 140
(Android 142) ausgewertet, ältere Versionen ignorieren den Schlüssel.

## Tests ausführen

```
npm install
npm test
```

`npm test` ruft `node --test` auf. Einzige Abhängigkeit ist `jsdom` (devDependency).

## ID-Map neu bauen

```
node tools/build-idmap.mjs <list.html> <detailDir> data/poe2db-shopid-map.json
```

- `<list.html>`: gespeicherte Seite https://poe2db.tw/us/Microtransactions
- `<detailDir>`: Detailseiten, Dateiname = `encodeURIComponent(slug) + ".html"`, wobei `slug` das rohe
  `href` des Listeneintrags ist (z. B. `Kraken_Stash_Skin_%28Currency%29` -> `Kraken_Stash_Skin_%2528Currency%2529.html`).
- Slugs ohne Detaildatei werden auf stderr gemeldet (`fehlt: <slug>`) und nicht in die Map geschrieben;
  die Extension lädt sie zur Laufzeit nach.
- Liste und Detailseiten lädt `tools/acceptance/download_details.py` nach `temp/` (siehe unten), danach:
  `node tools/build-idmap.mjs temp/poe2db_mtx.html temp/poe2db_detail data/poe2db-shopid-map.json`.
  Beim Neubau auch `tests/fixtures/poe2db/list_*.html` auf denselben Stand bringen (Test prüft die Abdeckung).

## Abnahme in Firefox (Selenium)

Prüft die Extension im installierten Firefox als temporäres Add-on (gleicher Mechanismus wie
about:debugging) gegen unabhängig berechnete Soll-Werte. Rohdaten und Ergebnisse liegen in `temp/`.

```
py -3.13 -m venv temp/.venv
temp/.venv/Scripts/python.exe -m pip install -r tools/acceptance/requirements.txt
py -3.13 tools/acceptance/fetch_shop.py
py -3.13 tools/acceptance/download_details.py
temp/.venv/Scripts/python.exe tools/acceptance/acceptance_firefox.py
temp/.venv/Scripts/python.exe tools/acceptance/scenario3.py
```

| Skript | Aufgabe |
| --- | --- |
| `fetch_shop.py` | Shop-Bestand EN + DE über die Shop-API nach `temp/shop_api` (Cache, vorhandene Dateien bleiben) |
| `download_details.py` | poe2db-Liste und alle Detailseiten nach `temp/` (1,2 s Abstand, fortsetzbar; `--refresh-list` lädt die Liste neu) |
| `expected.py` | Soll-Label je Shop-Karte mit eigenem Parser, unabhängig vom Extension-Code |
| `acceptance_firefox.py` | Szenarien: Live EN + DE (pets, armour-effects, bundles inkl. Endlos-Scroll, Layout), Optionen live, Cache-Fallback, ohne Cache. `--headed` zeigt das Fenster |
| `scenario3.py` | Cache-Fallback isoliert, zwei Läufe |

Selenium Manager lädt beim ersten Start geckodriver. Screenshots und Logs: `temp/acceptance/`.
Die Soll-Werte setzen voraus, dass `temp/` (Shop-Abzug, poe2db-Liste, Detailseiten) zeitnah zum Lauf
abgerufen wurde; ändert sich der Shop oder poe2db dazwischen, zeigt der Vergleich Abweichungen, die keine
Fehler der Extension sind.

## Technische Befunde (Phase 0)

Shop:
- Karten nur auf `/shop/category/<kategorie>` (und `/shop/item/<id>`), `/shop` selbst listet nur Kategorien.
- Karte: `#mtx-list > div.shopItemBase`, DOM-`id` = Shop-Item-ID. Einzelitem `.shopItem`,
  Bündel `.shopItemPackage`, Varianten-Gruppe hat `.variantGroupInfo` ("x{N} Variations").
- Titel: `h4.name-container > a.name` (`href="/shop/item/<id>"`), Bild: `a.itemImage[data-href]`.
- Erste Seite als JSON im Inline-Script (`new Category({... items: [...]})`), danach Endlos-Scroll über
  `GET /api/shop-microtransaction-categories/<kategorie>?offset=N`. Suche/Gilde laden die Liste neu.
- Item-ID und `imageUrl` sind auf www. und de. identisch (2632 IDs, 0 Abweichungen).
- `imageUrl`: `https://web.poecdn.com/gen/image/<base64url [21,14,{"k":"2DItems/..."}]>/<hash>/<datei>`.
- Varianten (`variantGroup: true`) und Bündel (`bundle: true`) haben `items[]` mit Kind-IDs.
  Varianten-Kinder haben `imageUrl`, Bündel-Kinder nicht (nur `id`, `name`, `quantity`).
- Varianten- und Bündel-Kinder stehen doch im Karten-DOM: Varianten als
  `.variantSelector button.variant[data-variant]` (ID) mit `img[src]` (Bild), Bündel als
  `.lineItems .lineItem[data-id]` (ID, ohne Bild). Auf de.pathofexile.com/shop/category/armour-effects
  (457 Karten, 192 Bündel, 55 Varianten, vollständig gescrollt) und bundles (47) zu 100 % deckungsgleich
  mit der Shop-API. Die Extension arbeitet daher rein DOM-basiert.
- Lade-Skelette `#shop-item-loading .shopItemBase` haben keine `id` und liegen nicht in `#mtx-list`.

poe2db:
- Liste: 2622 Einträge mit Bild, je Eintrag Link-Slug (aus EN-Name), EN-Name, Bild
  `https://cdn.poe2db.tw/image/Art/2DItems/...webp`. Keine Shop-ID auf der Liste.
  Zusätzlich ein Eintrag ohne Bild (`Hideout_Music_Player`), insgesamt also 2623 Namens-Einträge
  (2594 eindeutige Slugs); er zählt als gelistet und kann nur über die Shop-ID treffen.
- Detailseite `https://poe2db.tw/us/<slug>` enthält Tabellenzeilen `shop_us` -> `<ShopId>`, identisch zur
  Shop-Item-ID, ggf. mehrfach (z. B. `StormborneHelmet` und `StormborneHelmetVariation`).

# poe2-mtx-marker

Firefox-Extension (Manifest V3), die auf den Shop-Seiten von pathofexile.com (alle Sprach-Subdomains)
Karten markiert, deren MTX laut https://poe2db.tw/us/Microtransactions in Path of Exile 2 verfügbar sind.

## Status

Phase 1 in Arbeit. Schlüsselstrategie "Option D" ist freigegeben und umgesetzt: Ein Shop-Item ist ein
Treffer, wenn seine Shop-ID zu einem aktuell auf poe2db gelisteten Slug gehört (Zuordnung Slug -> Shop-IDs
aus den poe2db-Detailseiten) oder sein Bildpfad-Schlüssel (artKey) dem eines gelisteten Eintrags entspricht.

Label an markierten Karten (ab 1 Treffer): Karten mit genau einem Item (Einzelitem, aber auch Bündel oder
Varianten-Gruppe mit nur einem Item) zeigen "PoE2 ready", Karten mit mindestens zwei Items "PoE2 ready x/y"
(x = Treffer, y = Anzahl Items). 0 Treffer: keine Markierung, kein Label.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `manifest.json` | MV3-Manifest (Firefox, Background als `scripts`) |
| `lib/core.js` | Reine Kernlogik: Schlüssel, Parser, Kartenextraktion, Index, Bewertung, Label, Cache-Entscheidung, Einstellungen. Im Browser global `PoE2Mtx`, in Node per `require` |
| `background.js` | Lädt bei jedem Shop-Seitenaufruf die poe2db-Liste live, Cache-Fallback, Status, Nachladen fehlender Detailseiten (sequentiell, >= 1200 ms Abstand), Benachrichtigung offener Shop-Tabs |
| `content.js`, `content.css` | Markiert Karten in `#mtx-list` (MutationObserver), Label, Hinweis "Stand vom" bei Cache-Daten, Konsolen-Protokoll nicht gematchter Karten |
| `popup.html`, `popup.js` | Treffer, Karten gesamt, Datenstand, Quelle, Fehler- und Berechtigungshinweise |
| `options.html`, `options.js` | Farbe, Intensität, Live-Vorschau; offene Shop-Tabs übernehmen Änderungen über `storage.onChanged` |
| `data/poe2db-shopid-map.json` | Mitgelieferte Zuordnung Slug -> Shop-IDs (`{"generatedAt", "map"}`) |
| `tools/build-idmap.mjs` | Baut die Zuordnung aus einer Listen-HTML und gecachten Detailseiten |
| `tests/` | Node-Tests (`node --test`) mit den echten Fixtures aus Phase 0 |

HTML wird im Background mit dem `DOMParser` von Firefox geparst, in Tests und im Build-Tool mit dem
`DOMParser` von jsdom. Die Parser-Funktionen in `lib/core.js` bekommen jeweils ein fertiges `Document`.

## Laden in Firefox

1. `about:debugging#/runtime/this-firefox` öffnen.
2. "Temporäres Add-on laden ..." und `manifest.json` aus diesem Ordner wählen.
3. Unter `about:addons` > PoE2 MTX Marker > Berechtigungen prüfen, dass der Zugriff auf
   pathofexile.com und poe2db.tw erlaubt ist (in Firefox MV3 vom Nutzer entziehbar; das Popup meldet es).

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

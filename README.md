# poe2-mtx-marker

Firefox-Extension (Manifest V3), die auf den Shop-Seiten von pathofexile.com (alle Sprach-Subdomains)
Karten markiert, deren MTX laut https://poe2db.tw/us/Microtransactions in Path of Exile 2 verfügbar sind.

## Status

Phase 0 (Discovery) abgeschlossen, Ergebnis: BLOCKED. Es gibt keinen gemeinsamen sprachneutralen
Schlüssel, der auf der poe2db-Listenseite vollständig vorliegt. Entscheidung zur Schlüsselstrategie
steht aus. Phase 1 startet erst nach Freigabe.

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

poe2db:
- Liste: 2622 Einträge, je Eintrag Link-Slug (aus EN-Name), EN-Name, Bild
  `https://cdn.poe2db.tw/image/Art/2DItems/...webp`. Keine Shop-ID auf der Liste.
- Detailseite `https://poe2db.tw/us/<slug>` enthält `shop_us <ShopId>`, identisch zur Shop-Item-ID.

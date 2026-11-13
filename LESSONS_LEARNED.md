# Lessons Learned

- Der PoE-Shop rendert Karten clientseitig. Ein HTML-Abruf zeigt nur Platzhalter; die Daten stehen als
  JSON im Inline-Script und hinter `/api/shop-microtransaction-categories/<kategorie>`.
- Gleicher Bildpfad heißt nicht gleiches Item und umgekehrt: poe2db nutzt für viele MTX eine neue
  PoE2-Grafik (z. B. `BodyArmourIconArcane` statt der PoE1-Grafik), außerdem teilen sich Varianten-Gruppe
  und erste Variante im Shop denselben Bildpfad.
- Die API-Angabe `total` kann größer sein als die tatsächlich gelieferte Anzahl (specials: 351 vs. 331).
- poe2db-Slugs sind rohe, teils bereits URL-kodierte `href`-Werte (`..._%28Currency%29`). Für den Abruf
  relativ zur Listen-URL auflösen, nicht erneut kodieren; sonst entsteht `%2528` und eine falsche Seite.
- Nicht jeder poe2db-Listeneintrag hat ein Bild (`Hideout_Music_Player`). Zählungen über die Bild-Links
  unterschlagen ihn.
- jsdom normalisiert `box-shadow` beim Serialisieren (`rgb(...) 0px ...`). Stilwerte in Tests über dieselbe
  CSS-Serialisierung vergleichen, nicht als Rohstring.
- Der Shop hängt `div.shopItemBase#<id>` zuerst leer an `#mtx-list` an und befüllt die Karte danach
  asynchron per `$el.html(...)`. Karten erst bewerten, wenn ihr Inhalt da ist, und bei Mutationen im
  Karten-Teilbaum neu bewerten. Jsdom-Tests mit fertig eingefügtem HTML decken das nicht ab.
- Der Shop-Kartencontainer ist ein 920 px breiter Flex-Wrap mit 460-px-Karten (`content-box`). Jeder
  zusätzliche Rahmen ohne `box-sizing: border-box` macht den Shop einspaltig. Nur im echten Browser sichtbar,
  jsdom berechnet kein Layout.
- Für Abnahmetests "poe2db nicht erreichbar" reicht `network.dns.localDomains` allein nicht: Firefox
  verwendet offene Verbindungen weiter. Zusätzlich DNS-Cache leeren und Verbindungen kappen
  (`net:prune-all-connections`).

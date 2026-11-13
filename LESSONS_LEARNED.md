# Lessons Learned

- Der PoE-Shop rendert Karten clientseitig. Ein HTML-Abruf zeigt nur Platzhalter; die Daten stehen als
  JSON im Inline-Script und hinter `/api/shop-microtransaction-categories/<kategorie>`.
- Gleicher Bildpfad heißt nicht gleiches Item und umgekehrt: poe2db nutzt für viele MTX eine neue
  PoE2-Grafik (z. B. `BodyArmourIconArcane` statt der PoE1-Grafik), außerdem teilen sich Varianten-Gruppe
  und erste Variante im Shop denselben Bildpfad.
- Die API-Angabe `total` kann größer sein als die tatsächlich gelieferte Anzahl (specials: 351 vs. 331).

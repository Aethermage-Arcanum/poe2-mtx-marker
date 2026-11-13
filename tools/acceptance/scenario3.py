"""Szenario 3 isoliert: poe2db nach einem Live-Abruf blockiert, Cache muss greifen (zwei Läufe)."""
import acceptance_firefox as a
from expected import build_index, shop_category
from paths import POE2DB_LIST, POE2DB_DETAIL_DIR
ids, arts, _, _ = build_index(POE2DB_LIST, POE2DB_DETAIL_DIR)
problems = 0
for run in (1, 2):
    d = a.make_driver(False); uuid = a.ext_uuid(d)
    a.load_all(d, 'https://de.pathofexile.com/shop/category/bundles', 47)
    a.block_poe2db(d)
    st = a.load_all(d, 'https://de.pathofexile.com/shop/category/pets', len(shop_category('de', 'pets')))
    m, _ = a.compare('de', 'pets', st, ids, arts); problems += len(m) + a.layout_problems(d)
    notice = d.execute_script("return document.getElementById('poe2mtx-notice')?.textContent ?? null")
    print(f'   Lauf {run}: Hinweis {notice!r}')
    if not notice or not notice.startswith(a.STALE_NOTICE_PREFIXES): problems += 1
    a.screenshot(d, f'cache_de_pets_run{run}')
    text, _ = a.popup_text(d, uuid); print('   Popup:', text.replace('\n', ' | '))
    if not any(s in text for s in a.POPUP_SOURCE_CACHE): problems += 1
    d.quit()
print('ERGEBNIS Szenario 3:', 'OK' if problems == 0 else f'{problems} Probleme')

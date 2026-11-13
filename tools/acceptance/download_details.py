"""Lädt die poe2db-Liste und alle Detailseiten nach temp/ (gedrosselt, fortsetzbar).

Dateiname = quote(slug, safe='') + '.html' (entspricht encodeURIComponent, wie tools/build-idmap.mjs erwartet).
Der Slug ist das rohe href der Liste und wird für den Abruf nicht erneut kodiert.
"""
import html, os, re, sys, time, urllib.parse, urllib.request
from paths import POE2DB_LIST, POE2DB_DETAIL_DIR, USER_AGENT

LIST_URL = 'https://poe2db.tw/us/Microtransactions'
DETAIL_BASE = 'https://poe2db.tw/us/'
DELAY_S = 1.2
RETRIES = 3


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': USER_AGENT}), timeout=30).read()


def main():
    if '--refresh-list' in sys.argv or not os.path.exists(POE2DB_LIST):
        with open(POE2DB_LIST, 'wb') as f:
            f.write(fetch(LIST_URL))
    with open(POE2DB_LIST, encoding='utf8') as f:
        s = f.read()
    slugs = list(dict.fromkeys(html.unescape(x) for x in re.findall(r'<div class="fw-bold"><a class="MTXTypes" href="([^"]+)"', s)))
    print('Slugs', len(slugs), flush=True)
    os.makedirs(POE2DB_DETAIL_DIR, exist_ok=True)
    failed = []
    for n, slug in enumerate(slugs, 1):
        f = os.path.join(POE2DB_DETAIL_DIR, urllib.parse.quote(slug, safe='') + '.html')
        if os.path.exists(f) and os.path.getsize(f) > 0:
            continue
        for attempt in range(RETRIES):
            try:
                data = fetch(DETAIL_BASE + slug)
                with open(f, 'wb') as out:
                    out.write(data)
                break
            except Exception as e:
                err = e
                time.sleep(5 * (attempt + 1))
        else:
            failed.append((slug, str(err)))
            print('FEHLER', slug, err, flush=True)
        if n % 100 == 0:
            print('Fortschritt', n, len(slugs), flush=True)
        time.sleep(DELAY_S)
    print('fertig, Fehler', len(failed), flush=True)


if __name__ == '__main__':
    main()

"""Lädt den Shop-Bestand (EN + DE) über die Shop-API nach temp/shop_api. Vorhandene Dateien bleiben."""
import json, os, time, urllib.request
from paths import SHOP_API_DIR, USER_AGENT

CATEGORIES = ('account-features alternate-skill-effects armour-effects back-attachments bundles '
              'character-effects finisher-effects footprint-effects guild guild-hideout hideout new-items '
              'pets portals specials stash-tabs weapon-effects').split()
LANGS = ('www', 'de')
DELAY_S = 0.7


def main():
    os.makedirs(SHOP_API_DIR, exist_ok=True)
    for lang in LANGS:
        for cat in CATEGORIES:
            offset = 0
            while True:
                f = os.path.join(SHOP_API_DIR, f'{lang}_{cat}_{offset}.json')
                if not os.path.exists(f):
                    req = urllib.request.Request(
                        f'https://{lang}.pathofexile.com/api/shop-microtransaction-categories/{cat}?offset={offset}',
                        headers={'User-Agent': USER_AGENT, 'X-Requested-With': 'XMLHttpRequest'})
                    with open(f, 'wb') as out:
                        out.write(urllib.request.urlopen(req, timeout=30).read())
                    time.sleep(DELAY_S)
                with open(f, encoding='utf8') as fh:
                    d = json.load(fh)
                n = len(d['items'])
                offset += n
                # Die API meldet in "total" teils mehr Items, als sie liefert (specials: 351 vs. 331).
                if n == 0 or offset >= d['total']:
                    print(lang, cat, 'total', d['total'], 'geladen', offset, flush=True)
                    break


if __name__ == '__main__':
    main()

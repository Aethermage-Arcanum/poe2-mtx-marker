"""Unabhängige Soll-Werte je Shop-Karte (eigener Parser, nicht der Extension-Code)."""
import base64, glob, html as H, json, os, re, urllib.parse
from paths import SHOP_API_DIR

LABEL = 'PoE2 ready'


def art_key(url):
    if not url:
        return None
    seg = url.split('/gen/image/')[1].split('/')[0]
    seg += '=' * (-len(seg) % 4)
    return json.loads(base64.urlsafe_b64decode(seg))[2]['k'].lower()


def poe2db_list(path):
    s = open(path, encoding='utf8').read()
    entries = []
    for m in re.finditer(r'<div class="d-flex border-top rounded">(.*?)<div class="fw-bold"><a class="MTXTypes" href="([^"]+)">', s, re.S):
        img = re.search(r'src="https://cdn\.poe2db\.tw/image/Art/([^"]+)\.webp"', m.group(1))
        entries.append((H.unescape(m.group(2)), img.group(1).lower() if img else None))
    return entries


def shop_ids_from_detail(path):
    t = re.sub(r'<[^>]+>', ' ', open(path, encoding='utf8').read())
    return list(dict.fromkeys(re.findall(r'shop_us\s+([A-Za-z0-9_]+)', t)))


def build_index(list_path, detail_dir):
    entries = poe2db_list(list_path)
    ids, arts, missing = set(), set(), []
    for slug, art in entries:
        if art:
            arts.add(art)
        f = os.path.join(detail_dir, urllib.parse.quote(slug, safe='') + '.html')
        if os.path.exists(f):
            ids.update(shop_ids_from_detail(f))
        else:
            missing.append(slug)
    return ids, arts, entries, sorted(set(missing))


def shop_category(lang, cat):
    items = []
    files = sorted(glob.glob(os.path.join(SHOP_API_DIR, f'{lang}_{cat}_*.json')),
                   key=lambda f: int(re.search(r'_(\d+)\.json$', f).group(1)))
    seen = set()
    for f in files:
        for it in json.load(open(f, encoding='utf8'))['items']:
            if it['id'] not in seen:
                seen.add(it['id'])
                items.append(it)
    return items


def expected_label(it, ids, arts):
    if it.get('items'):
        leaves = [(c['id'], art_key(c.get('imageUrl')) if not it['bundle'] else None) for c in it['items']]
    else:
        leaves = [(it['id'], art_key(it.get('imageUrl')))]
    hits = sum(1 for i, a in leaves if i in ids or (a is not None and a in arts))
    if hits == 0:
        return None
    return LABEL if len(leaves) < 2 else f'{LABEL} {hits}/{len(leaves)}'

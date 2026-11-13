"""Abnahme der Extension im installierten Firefox (temporäres Add-on wie about:debugging)."""
import json, os, sys, time, zipfile
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import ROOT, OUT, POE2DB_LIST, POE2DB_DETAIL_DIR  # noqa: E402
from expected import build_index, shop_category, expected_label  # noqa: E402

FIREFOX = r'C:\Program Files\Mozilla Firefox\firefox.exe'
EXT_FILES = ['manifest.json', 'background.js', 'content.js', 'content.css', 'popup.html', 'popup.js',
             'options.html', 'options.js', 'lib', 'data', 'icons']
MARK_CLASS = 'poe2mtx-marked'
LABEL_CLASS = 'poe2mtx-label'
NOTICE_ID = 'poe2mtx-notice'
with open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8') as f:
    GECKO_ID = json.load(f)['browser_specific_settings']['gecko']['id']
HEADLESS = '--headed' not in sys.argv
os.makedirs(OUT, exist_ok=True)
console = []


def build_zip():
    path = os.path.join(OUT, 'poe2-mtx-marker.zip')
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for item in EXT_FILES:
            full = os.path.join(ROOT, item)
            if os.path.isdir(full):
                for base, _, files in os.walk(full):
                    for f in files:
                        p = os.path.join(base, f)
                        z.write(p, os.path.relpath(p, ROOT))
            else:
                z.write(full, item)
    return path


def make_driver(block_poe2db):
    o = Options()
    o.binary_location = FIREFOX
    if HEADLESS:
        o.add_argument('-headless')
    o.enable_bidi = True
    o.set_preference('network.dnsCacheExpiration', 0)
    o.set_preference('network.trr.mode', 5)
    if block_poe2db:
        o.set_preference('network.dns.localDomains', 'poe2db.tw')
    d = webdriver.Firefox(options=o, service=Service(service_args=['--allow-system-access']))
    d.set_window_size(1400, 1100)
    try:
        d.script.add_console_message_handler(lambda e: console.append(getattr(e, 'text', str(e))))
    except Exception as e:  # BiDi-Konsole ist optional für die Abnahme
        print('BiDi-Konsole nicht verfügbar:', e)
    d.install_addon(build_zip(), temporary=True)
    return d


def chrome(d, script):
    with d.context(d.CONTEXT_CHROME):
        return d.execute_script(script)


def ext_uuid(d):
    return json.loads(chrome(d, "return Services.prefs.getStringPref('extensions.webextensions.uuids')"))[GECKO_ID]


def block_poe2db(d):
    chrome(d, "Services.prefs.setStringPref('network.dns.localDomains','poe2db.tw');"
              "Services.dns.clearCache(true);"
              "Services.obs.notifyObservers(null, 'net:prune-all-connections');")


def cards_state(d):
    return d.execute_script(f"""
      return [...document.querySelectorAll('#mtx-list > div.shopItemBase[id]')].map(c => [
        c.id, c.classList.contains('{MARK_CLASS}'),
        (c.querySelector('.{LABEL_CLASS}') || c.parentElement.querySelector('#'+CSS.escape(c.id)+' ~ .{LABEL_CLASS}'))?.textContent?.trim() ?? null]);""")


def load_all(d, url, total):
    t0 = time.time()
    d.get(url)
    for _ in range(120):
        if any(m for _, m, _ in cards_state(d)):
            break
        time.sleep(0.5)
    print(f'   erste Markierung nach {time.time() - t0:.1f}s')
    for _ in range(60):
        n = len(cards_state(d))
        if n >= total:
            break
        d.execute_script('window.scrollTo(0, document.body.scrollHeight); window.dispatchEvent(new Event("scroll"));')
        time.sleep(1.5)
    last, stable = None, 0
    for _ in range(40):
        st = cards_state(d)
        if st == last:
            stable += 1
            if stable >= 3:
                break
        else:
            stable = 0
        last = st
        time.sleep(1)
    return last


def compare(lang, cat, state, ids, arts):
    exp = {it['id']: expected_label(it, ids, arts) for it in shop_category(lang, cat)}
    got = {cid: (marked, label) for cid, marked, label in state}
    mism = []
    for cid, label in exp.items():
        if cid not in got:
            mism.append((cid, 'fehlt im DOM', label))
            continue
        marked, glabel = got[cid]
        if marked != (label is not None) or glabel != label:
            mism.append((cid, f'ist {marked}/{glabel}', f'soll {label}'))
    extra = [c for c in got if c not in exp]
    marked = sum(1 for v in got.values() if v[0])
    print(f'[{lang} {cat}] Karten DOM {len(got)} / Soll {len(exp)}, markiert {marked}, '
          f'Soll markiert {sum(1 for v in exp.values() if v)}, Abweichungen {len(mism)}, nur im DOM {len(extra)}')
    for m in mism[:15]:
        print('   ', m)
    return mism, extra


def layout_problems(d):
    r = d.execute_script(f"""
      const cards = [...document.querySelectorAll('#mtx-list > div.shopItemBase[id]')];
      const xs = new Set(cards.map(c => Math.round(c.getBoundingClientRect().x)));
      const widths = new Set(cards.map(c => Math.round(c.getBoundingClientRect().width)));
      const outside = cards.filter(c => c.classList.contains('{MARK_CLASS}')).filter(c => {{
        const l = c.querySelector(':scope > .{LABEL_CLASS}'); if (!l) return true;
        const a = c.getBoundingClientRect(), b = l.getBoundingClientRect();
        return b.left < a.left || b.right > a.right || b.top < a.top || b.bottom > a.bottom; }}).map(c => c.id);
      const notUnderBuy = cards.filter(c => c.classList.contains('{MARK_CLASS}')).filter(c => {{
        const l = c.querySelector(':scope > .{LABEL_CLASS}'), btn = c.querySelector('.controls .buyButton, .controls .singleOwnedIcon');
        if (!l || !btn) return true;
        const b = l.getBoundingClientRect(), k = btn.getBoundingClientRect();
        return b.top < k.bottom - 1 || Math.abs(b.left - k.left) > 2; }}).map(c => c.id);
      return {{columns: xs.size, widths: [...widths], labelOutside: outside.slice(0, 5), nOutside: outside.length,
               labelNotUnderBuy: notUnderBuy.slice(0, 5), nNotUnderBuy: notUnderBuy.length}};""")
    ok = r['columns'] == 2 and r['widths'] == [460] and r['nOutside'] == 0 and r['nNotUnderBuy'] == 0
    print('   Layout:', r, 'OK' if ok else 'FEHLER')
    return 0 if ok else 1


def screenshot(d, name):
    d.execute_script(f"document.querySelector('.{MARK_CLASS}')?.scrollIntoView({{block:'center'}})")
    time.sleep(1)
    p = os.path.join(OUT, name + '.png')
    d.save_screenshot(p)
    print('   Screenshot', p)


def set_options(d, uuid, color, intensity_max):
    d.switch_to.new_window('tab')
    d.get(f'moz-extension://{uuid}/options.html')
    time.sleep(1)
    d.execute_script("""
      const c=document.querySelector('input[type=color]'); c.value=arguments[0];
      c.dispatchEvent(new Event('input',{bubbles:true})); c.dispatchEvent(new Event('change',{bubbles:true}));
      const r=document.querySelector('input[type=range]'); if (arguments[1]) r.value=String(r.max);
      r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true}));""", color, intensity_max)
    time.sleep(1)
    d.save_screenshot(os.path.join(OUT, f'options_{color.lstrip("#")}.png'))
    d.close()
    d.switch_to.window(d.window_handles[0])
    time.sleep(1.5)


def marked_style(d):
    return d.execute_script(f"""const c=document.querySelector('.{MARK_CLASS}'); const s=getComputedStyle(c);
      const l=getComputedStyle(c.querySelector(':scope > .{LABEL_CLASS}'));
      return {{border: s.borderTopColor, shadow: s.boxShadow, labelBg: l.backgroundColor, labelText: l.color}}""")


def popup_text(d, uuid):
    d.switch_to.new_window('tab')
    d.get(f'moz-extension://{uuid}/popup.html')
    time.sleep(2)
    text = d.find_element('tag name', 'body').text
    stats = d.execute_async_script("""
      const cb = arguments[arguments.length - 1];
      browser.tabs.query({url: '*://*.pathofexile.com/shop*'}).then(ts =>
        Promise.all(ts.map(t => browser.tabs.sendMessage(t.id, {type: 'poe2mtx:getStats'}).catch(e => String(e)))))
        .then(cb, e => cb(String(e)));""")
    d.save_screenshot(os.path.join(OUT, f'popup_{int(time.time())}.png'))
    d.close()
    d.switch_to.window(d.window_handles[0])
    return text, stats


def main():
    ids, arts, entries, missing = build_index(POE2DB_LIST, POE2DB_DETAIL_DIR)
    print(f'Soll-Index: {len(entries)} Listeneinträge, {len(ids)} Shop-IDs, {len(arts)} artKeys, ohne Detailseite {len(missing)}')
    totals = {}
    for lang in ('www', 'de'):
        for cat in ('pets', 'armour-effects', 'bundles'):
            totals[(lang, cat)] = len(shop_category(lang, cat))
    problems = 0

    print('\n== Szenario 1: Live-Daten, EN und DE ==')
    d = make_driver(block_poe2db=False)
    uuid = ext_uuid(d)
    print('Extension-UUID', uuid)
    for lang in ('www', 'de'):
        for cat in ('pets', 'armour-effects', 'bundles'):
            st = load_all(d, f'https://{lang}.pathofexile.com/shop/category/{cat}', totals[(lang, cat)])
            m, _ = compare(lang, cat, st, ids, arts)
            problems += len(m)
            problems += layout_problems(d)
            notice = d.execute_script(f"return document.getElementById('{NOTICE_ID}')?.textContent ?? null")
            print('   Hinweis "Stand vom" auf der Seite:', notice)
            if notice:
                problems += 1
            screenshot(d, f'live_{lang}_{cat}')
    text, stats = popup_text(d, uuid)
    print('   Popup:', text.replace('\n', ' | '))
    print('   Stats aus Content-Script:', stats)

    print('\n== Szenario 2: Optionen wirken live ==')
    # Erwartete Label-Schrift nach WCAG-2-Kontrast (unabhängig in Python berechnet).
    cases = [(None, 'rgb(255, 42, 42)', 'rgb(0, 0, 0)'),
             ('#00ff00', 'rgb(0, 255, 0)', 'rgb(0, 0, 0)'),
             ('#000080', 'rgb(0, 0, 128)', 'rgb(255, 255, 255)'),
             ('#ff2a2a', 'rgb(255, 42, 42)', 'rgb(0, 0, 0)')]
    for color, border, text in cases:
        if color:
            set_options(d, uuid, color, color == '#00ff00')
        st_ = marked_style(d)
        ok = st_['border'] == border and st_['labelBg'] == border and st_['labelText'] == text
        print(f'   Farbe {color or "Standard"}: {st_}', 'OK' if ok else f'FEHLER (soll Rahmen {border}, Schrift {text})')
        if not ok:
            problems += 1
        if color == '#000080':
            screenshot(d, 'options_live_navy_de_bundles')
    screenshot(d, 'options_live_de_bundles')

    print('\n== Szenario 3: poe2db nicht erreichbar, Cache vorhanden ==')
    block_poe2db(d)
    st = load_all(d, 'https://de.pathofexile.com/shop/category/pets', totals[('de', 'pets')])
    m, _ = compare('de', 'pets', st, ids, arts)
    problems += len(m)
    notice = d.execute_script(f"return document.getElementById('{NOTICE_ID}')?.textContent ?? null")
    print('   Hinweis auf der Seite:', notice)
    if not notice or 'Stand vom' not in notice:
        problems += 1
    screenshot(d, 'cache_de_pets')
    text, stats = popup_text(d, uuid)
    print('   Popup:', text.replace('\n', ' | '))
    d.quit()

    print('\n== Szenario 4: poe2db nicht erreichbar, kein Cache ==')
    d = make_driver(block_poe2db=True)
    uuid = ext_uuid(d)
    st = load_all(d, 'https://www.pathofexile.com/shop/category/pets', totals[('www', 'pets')])
    marked = sum(1 for _, mk, _ in st if mk)
    print(f'   Karten {len(st)}, markiert {marked} (Soll 0)')
    if marked:
        problems += 1
    d.save_screenshot(os.path.join(OUT, 'nocache_www_pets.png'))
    text, stats = popup_text(d, uuid)
    print('   Popup:', text.replace('\n', ' | '))
    d.quit()

    print('\nKonsole (Auszug, poe2mtx):', [c for c in console if 'poe2' in c.lower()][:5], 'gesamt', len([c for c in console if 'poe2' in c.lower()]))
    print('\nERGEBNIS:', 'OK' if problems == 0 else f'{problems} Probleme')


if __name__ == '__main__':
    main()

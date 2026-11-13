"""Gemeinsame Pfade der Abnahme-Werkzeuge. Rohdaten und Ergebnisse liegen im ungetrackten temp/."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DATA = os.path.join(ROOT, 'temp')
POE2DB_LIST = os.path.join(DATA, 'poe2db_mtx.html')
POE2DB_DETAIL_DIR = os.path.join(DATA, 'poe2db_detail')
SHOP_API_DIR = os.path.join(DATA, 'shop_api')
OUT = os.path.join(DATA, 'acceptance')
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'

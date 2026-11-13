import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const core = require('../lib/core.js');

const USAGE = 'Aufruf: node tools/build-idmap.mjs <list.html> <detailDir> <out.json>';
const DETAIL_FILE_EXTENSION = '.html';
const MISSING_PREFIX = 'fehlt: ';
const HTML_MIME_TYPE = 'text/html';

export function buildIdMap({ listHtml, readDetail, parseHtml }) {
  const slugs = [...new Set(core.parsePoe2dbList(parseHtml(listHtml)).map((entry) => entry.slug))];
  const map = {};
  const missingSlugs = [];
  for (const slug of slugs) {
    const html = readDetail(slug);
    if (html === null) {
      missingSlugs.push(slug);
    } else {
      map[slug] = core.parseDetailShopIds(parseHtml(html));
    }
  }
  return { map, missingSlugs };
}

export function detailFileName(slug) {
  return encodeURIComponent(slug) + DETAIL_FILE_EXTENSION;
}

function main(args) {
  if (args.length !== 3) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const [listFile, detailDir, outFile] = args;
  const window = new JSDOM('').window;
  const parseHtml = (html) => new window.DOMParser().parseFromString(html, HTML_MIME_TYPE);
  const readDetail = (slug) => {
    const file = path.join(detailDir, detailFileName(slug));
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  };

  const { map, missingSlugs } = buildIdMap({ listHtml: fs.readFileSync(listFile, 'utf8'), readDetail, parseHtml });
  for (const slug of missingSlugs) process.stderr.write(`${MISSING_PREFIX}${slug}\n`);
  process.stderr.write(`${Object.keys(map).length} Slugs mit Detailseite, ${missingSlugs.length} ohne Detaildatei (werden zur Laufzeit nachgeladen).\n`);

  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), map }, null, 2)}\n`, 'utf8');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

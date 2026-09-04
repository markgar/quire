// @ts-check
/**
 * Conformance check: parse and render the fixtures with src/, and compare
 * against reviewed golden snapshots.
 *
 * Two gates per fixture:
 *   parse   - the spec, deep-compared including key order
 *   render  - the slides fragment, compared byte for byte
 *
 * The fragment is compared rather than the whole page so a CSS or shell change
 * does not make parser and renderer snapshots noisy.
 *
 * Usage: node test/conformance.js
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inline, parseQuire } from '../src/deck.js';
import { imageSource, renderSlides, page, readSource } from '../src/render.js';
import { AUTHORING_GUIDE } from '../src/guide.js';
import { safeDeckUrl } from '../src/deck-url.js';
import { packQuire, referencedAssetPaths, unpackQuire } from '../skills/quire/package.js';
import { validateQuireSource } from '../skills/quire/source.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

/**
 * Collect every path where two JSON-compatible values differ.
 *
 * @param {any} a expected
 * @param {any} b actual
 * @param {string} path
 * @param {string[]} out
 * @returns {string[]}
 */
function diff(a, b, path = '', out = []) {
  if (a === b) return out;

  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) {
    out.push(`${path}: expected ${aIsArr ? 'array' : typeof a}, got ${bIsArr ? 'array' : typeof b}`);
    return out;
  }

  if (aIsArr && bIsArr) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} -> ${b.length}`);
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      diff(a[i], b[i], `${path}[${i}]`, out);
    }
    return out;
  }

  const aIsObj = a !== null && typeof a === 'object';
  const bIsObj = b !== null && typeof b === 'object';
  if (aIsObj && bIsObj) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    for (const k of ka) if (!kb.includes(k)) out.push(`${path}.${k}: missing`);
    for (const k of kb) if (!ka.includes(k)) out.push(`${path}.${k}: unexpected`);
    // Key order is part of the contract while both implementations coexist:
    // it is what lets a plain JSON diff stand in for a structural comparison.
    const shared = ka.filter((k) => kb.includes(k));
    const orderA = shared.join(',');
    const orderB = kb.filter((k) => ka.includes(k)).join(',');
    if (orderA !== orderB) out.push(`${path}: key order ${orderA} -> ${orderB}`);
    for (const k of shared) diff(a[k], b[k], `${path}.${k}`, out);
    return out;
  }

  out.push(`${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  return out;
}

/**
 * First differing lines, with a little context. More useful than a byte offset
 * when the artefact is generated HTML.
 *
 * @param {string} expected
 * @param {string} actual
 * @returns {string[]}
 */
function lineDiff(expected, actual) {
  const ae = expected.split('\n');
  const ac = actual.split('\n');
  const out = [];
  if (ae.length !== ac.length) out.push(`line count ${ae.length} -> ${ac.length}`);
  for (let i = 0; i < Math.max(ae.length, ac.length); i += 1) {
    if (ae[i] !== ac[i]) {
      out.push(`line ${i + 1}:`);
      out.push(`  expected: ${JSON.stringify(ae[i])}`);
      out.push(`  actual:   ${JSON.stringify(ac[i])}`);
      if (out.length > 12) break;
    }
  }
  return out;
}

let failed = 0;
let checked = 0;

{
  checked += 1;
  const cases = [
    ['**bold [md](/url) inside**', '<strong>bold <a href="/url">md</a> inside</strong>'],
    ['**bold <a href="u">x</a> inside**', '<strong>bold <a href="u">x</a> inside</strong>'],
    ['**bold <br> across**', '<strong>bold <br> across</strong>'],
    ['*em <a>x</a>*', '<em>em <a>x</a></em>'],
    ['`code <a>x</a>`', '<code>code <a>x</a></code>'],
    ['`<b>`', '<code><b></code>'],
    ['<b>inner **bold**</b>', '<b>inner **bold**</b>'],
  ];
  const problems = cases
    .map(([input, expected]) => {
      const actual = inline(input);
      return actual === expected ? '' : `${JSON.stringify(input)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    })
    .filter(Boolean);
  if (problems.length) {
    failed += 1;
    console.log('FAIL  inline markup across raw HTML');
    for (const problem of problems) console.log(`   ${problem}`);
  } else {
    console.log('PASS  inline markup across raw HTML  emphasis, code, and links preserve raw elements');
  }
}

{
  checked += 1;
  const invalid = [
    '# Raw HTML',
    '',
    '<a href="one">one</a> and <strong>bold</strong>',
    '<span><b>nested bold</b></span>',
    '<span title="`"></span><em>visible violation</em><span title="`"></span>',
    '<a',
    ' href="two">multiline link</a>',
    '<span',
    ' title="```">safe</span><b>visible after attribute backticks</b>',
    '',
    '---',
    '',
    '## More raw HTML',
    '',
    '<i>italic</i> and <code>code</code>',
    '`<b>inline code is exempt</b>`',
    '',
    '```html',
    '<em>fenced code is exempt</em>',
    '```',
  ].join('\n');
  const expected = [
    'slide 1, line 3: raw <a> tag — use [label](URL) instead',
    'slide 1, line 3: raw <strong> tag — use **bold** instead',
    'slide 1, line 4: raw <b> tag — use **bold** instead',
    'slide 1, line 5: raw <em> tag — use *italic* instead',
    'slide 1, line 6: raw <a> tag — use [label](URL) instead',
    'slide 1, line 9: raw <b> tag — use **bold** instead',
    'slide 2, line 15: raw <i> tag — use *italic* instead',
    'slide 2, line 15: raw <code> tag — use `code` instead',
  ];
  let message = '';
  try {
    validateQuireSource(invalid);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  const legal = [
    '# Legal HTML',
    '',
    '**bold with <br> inside** <span title="<i>example</i>">span</span> <sup>2</sup> <img src="x"> <svg></svg>',
    '<!--',
    '<strong>comment example</strong>',
    '-->',
    '<span',
    ' title="<i>attribute example</i>">span</span>',
    '<script>',
    'const example = "<b>";',
    '</script>',
    '````html',
    '```',
    '---',
    '<b>inside a longer fence</b>',
    '````',
  ].join('\n');
  let legalError = '';
  try {
    validateQuireSource(legal);
  } catch (error) {
    legalError = error instanceof Error ? error.message : String(error);
  }
  const missing = expected.filter((violation) => !message.includes(violation));
  if (missing.length || legalError || message.split('\n').length !== expected.length + 1) {
    failed += 1;
    console.log('FAIL  raw HTML validation errors');
    if (missing.length) console.log(`   missing ${JSON.stringify(missing)} from ${JSON.stringify(message)}`);
    if (legalError) console.log(`   legal HTML failed validation: ${legalError}`);
    if (message.split('\n').length !== expected.length + 1) console.log(`   unexpected error count: ${JSON.stringify(message)}`);
  } else {
    console.log('PASS  raw HTML validation errors  aggregate violations and exempt code and native-less tags');
  }
}

{
  checked += 1;
  const base = 'https://quire.example/app/quire.html';
  const origin = 'https://quire.example';
  const allowed = new Map([
    ['deck.md', 'https://quire.example/app/deck.md'],
    ['decks/demo.quire', 'https://quire.example/app/decks/demo.quire'],
    ['./nearby.md?raw=1#slide-2', 'https://quire.example/app/nearby.md?raw=1#slide-2'],
  ]);
  const refused = [
    'https://evil.example/x.md',
    'http://evil.example/x.md',
    '//evil.example/x.md',
    '/outside.md',
    'javascript:alert(1)',
    'data:text/markdown,## hi',
  ];
  const problems = [];
  for (const [value, expected] of allowed) {
    const actual = safeDeckUrl(value, base, origin);
    if (actual !== expected) problems.push(`${value}: expected ${expected}, got ${actual}`);
  }
  for (const value of refused) {
    if (safeDeckUrl(value, base, origin) !== null) problems.push(`${value}: unsafe URL was accepted`);
  }
  if (problems.length) {
    failed += 1;
    console.log('FAIL  browser deck URL policy');
    for (const problem of problems) console.log(`   ${problem}`);
  } else {
    console.log('PASS  browser deck URL policy  relative same-origin paths only');
  }
}

for (const name of readdirSync(fixtures).filter((/** @type {string} */ f) => f.endsWith('.md')).sort()) {
  const base = name.replace(/\.md$/, '');
  const specPath = join(fixtures, `${base}.expected.json`);
  const htmlPath = join(fixtures, `${base}.expected.html`);

  if (!existsSync(specPath)) {
    console.log(`SKIP  ${name}  (no ${base}.expected.json)`);
    continue;
  }

  checked += 1;
  const md = readFileSync(join(fixtures, name), 'utf8');
  const actual = parseQuire(md);

  const parseDiffs = diff(JSON.parse(readFileSync(specPath, 'utf8')), actual);
  const renderDiffs = existsSync(htmlPath)
    ? lineDiff(readFileSync(htmlPath, 'utf8'), renderSlides(actual))
    : null;

  const problems = parseDiffs.length + (renderDiffs ? renderDiffs.length : 0);
  if (problems === 0) {
    const render = renderDiffs ? 'render ok' : 'render skipped';
    console.log(`PASS  ${name}  ${actual.slides.length} slides  parse ok  ${render}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
    for (const d of parseDiffs.slice(0, 20)) console.log(`   parse   ${d}`);
    for (const d of (renderDiffs || []).slice(0, 14)) console.log(`   render  ${d}`);
  }
}

// Page assembly is small enough to assert inline rather than by golden.
const shellPath = join(here, '..', 'skills', 'quire', 'shell.html');
if (existsSync(shellPath)) {
  const shell = readFileSync(shellPath, 'utf8');
  const html = page(
    { title: 'Ampersand & <em>markup</em>', theme: 'dark', slides: [{ layout: 'blank', title: 'One' }] },
    shell,
  );
  const problems = [];
  if (/\{title\}|\{theme\}|\{slides\}|\{n\}|\{source\}/.test(html)) {
    problems.push('unsubstituted placeholder left in output');
  }
  if (!html.includes('<title>Ampersand &amp; <em>markup</em></title>')) problems.push('title not escaped as expected');
  if (!html.includes('data-deck-theme="dark"')) problems.push('deck theme not stored in page');
  if (!html.includes('1 / 1')) problems.push('slide count not substituted');
  if (html.includes('id="quire-source"')) problems.push('source element left behind when no source was supplied');
  if (problems.length) {
    failed += 1;
    console.log('FAIL  page assembly');
    for (const p of problems) console.log(`   ${p}`);
  } else {
    console.log('PASS  page assembly  theme, placeholders, title escaping, slide count, no stray source');
  }

  const themed = parseQuire('---\ntitle: Themed\ntheme: DARK\n---\n\n# One');
  const invalidTheme = parseQuire('---\ntheme: sepia\n---\n\n# One');
  if (themed.theme !== 'dark' || invalidTheme.theme !== undefined) {
    failed += 1;
    console.log('FAIL  document theme  light/dark parsing or invalid-value handling');
  } else {
    console.log('PASS  document theme  stored light/dark value, rejected invalid value');
  }

  // A self-describing deck must give back the exact Markdown it was built from
  // — including a deck that contains the one string
  // capable of terminating the element it is stored in.
  const adversarial = [
    '---',
    'title: Round trip',
    '---',
    '',
    'layout: cards2',
    '',
    '## Contains </script> and &lt; and &amp;',
    'Ampersands & angle brackets < > and a tag <b>bold</b>.',
    '',
    '### A card with a script close </script>',
    'Body with backslash \\ and dollar $& and backtick `code`.',
    '',
    '> **Note:** trailing.',
    '',
  ].join('\n');

  const roundTrips = [
    ['adversarial', adversarial],
    ['trusting-the-suite fixture', readFileSync(join(fixtures, 'trusting-the-suite.md'), 'utf8')],
    ['edge-cases fixture', readFileSync(join(fixtures, 'edge-cases.md'), 'utf8')],
    ['visual-language fixture', readFileSync(join(fixtures, 'visual-language.md'), 'utf8')],
  ];

  const rtProblems = [];
  for (const [label, md] of roundTrips) {
    const built = page(parseQuire(md), shell, md);
    const recovered = readSource(built);
    if (recovered === null) {
      rtProblems.push(`${label}: no source element found`);
    } else if (recovered !== md) {
      const at = [...md].findIndex((c, i) => c !== recovered[i]);
      rtProblems.push(
        `${label}: source differs at offset ${at} ` +
          `(expected ${JSON.stringify(md.slice(at, at + 24))}, ` +
          `got ${JSON.stringify(recovered.slice(at, at + 24))})`,
      );
    }
    // Re-rendering the recovered source must give the same deck back, which is
    // the property that makes the file editable rather than merely readable.
    if (recovered !== null) {
      const rebuilt = page(parseQuire(recovered), shell, recovered);
      if (rebuilt !== built) rtProblems.push(`${label}: re-render from recovered source differs`);
    }
  }

  if (rtProblems.length) {
    failed += 1;
    console.log('FAIL  source round-trip');
    for (const p of rtProblems) console.log(`   ${p}`);
  } else {
    console.log(`PASS  source round-trip  ${roundTrips.length} decks recovered exactly and re-rendered identically`);
  }

  {
    checked += 1;
    const problems = [];
    if (imageSource('javascript:alert(1)')) problems.push('accepted a script URL as an image');
    if (imageSource('//example.com/image.png')) problems.push('accepted a protocol-relative image');
    if (imageSource('data:image/svg+xml,<svg onload=alert(1)>')) problems.push('accepted executable image data');
    if (!imageSource('data:image/svg+xml;base64,PHN2Zy8+')) problems.push('rejected packaged SVG image data');
    if (!imageSource('data:image/avif;base64,AAAA')) problems.push('rejected embedded AVIF image data');
    if (!imageSource('./image.png')) problems.push('rejected a relative same-origin image');
    if (imageSource('https://example.com/image.png')) problems.push('accepted an unresolved hosted image URL');
    if (!imageSource('data:image/png;base64,iVBORw0KGgo=')) problems.push('rejected embedded raster data');
    const based = parseQuire('image: ./image.png\n\n## Image', {
      assetBase: 'https://example.com/decks/demo/',
    });
    if (based.slides[0]?.image !== '/decks/demo/image.png') {
      problems.push('did not resolve an image relative to the deck URL');
    }

    {
      checked += 1;
      const problems = [];
      const titleWithSource = renderSlides({
        title: 'Visual edges',
        slides: [{ layout: 'title', headline: 'Title', source: 'Reference' }],
      });
      if (!titleWithSource.includes('Source: Reference')) problems.push('title slides drop source attribution');

      const media = renderSlides({
        title: 'Visual edges',
        slides: [{ layout: 'media', title: 'Image', sub: 'One description', image: './image.png' }],
      });
      if ((media.match(/One description/g) || []).length !== 1) problems.push('cardless media duplicates its description');
      const fullMediaCards = renderSlides({
        title: 'Visual edges',
        slides: [{
          layout: 'media',
          title: 'Image',
          image: './image.png',
          imagePosition: 'full',
          cards: [{ h: 'Kept', p: 'This card remains visible.', accent: false }],
        }],
      });
      if (!fullMediaCards.includes('This card remains visible.') || !fullMediaCards.includes('mixed-media-full')) {
        problems.push('full-position media discarded card content');
      }

      const mixedChart = parseQuire([
        '# Visual edges',
        '',
        '---',
        '',
        'image: ./mission.jpg',
        'image-fit: contain',
        'chart: bar',
        '',
        '## Mission distance',
        'A chart with supporting photography.',
        '',
        '| Leg | Miles |',
        '|---|---:|',
        '| Earth to Moon | 238855 |',
      ].join('\n'));
      const mixedChartHtml = renderSlides(mixedChart);
      if (mixedChart.slides[1]?.layout !== 'chart') problems.push('an image replaced an inferred chart layout');
      if (!mixedChartHtml.includes('mixed-media-right')) problems.push('chart image was not composed beside the chart');
      if (!mixedChartHtml.includes('chart-bar')) problems.push('chart content disappeared when an image was present');
      if (!mixedChartHtml.includes('media-fit-contain')) problems.push('image-fit contain was not rendered');

      const mixedDiagram = parseQuire([
        '# Visual edges',
        '',
        '---',
        '',
        'image: ./rocket.jpg',
        'diagram: process',
        '',
        '## Flight plan',
        '',
        '1. **Launch** Leave Earth.',
        '2. **Coast** Cross cislunar space.',
      ].join('\n'));
      const mixedDiagramHtml = renderSlides(mixedDiagram);
      if (mixedDiagram.slides[1]?.layout !== 'diagram') problems.push('an image replaced an inferred diagram layout');
      if (!mixedDiagramHtml.includes('diagram-process')) problems.push('diagram content disappeared when an image was present');

      const mixedTitle = renderSlides({
        title: 'Visual edges',
        slides: [{ layout: 'title', headline: 'Mission', image: './moon.jpg', imageAlt: 'The Moon' }],
      });
      if (!mixedTitle.includes('mixed-media-right') || !mixedTitle.includes('Mission')) {
        problems.push('title content and image were not composed together');
      }

      try {
        parseQuire('layout: media\ndiagram: process\nimage: ./rocket.jpg\n\n## Bad\n\n1. **Launch** Leave Earth.');
        problems.push('a conflicting media layout silently discarded diagram content');
      } catch {
        // Expected.
      }
      try {
        parseQuire('layout: groups\n\n### Lost\nBefore any group.\n\ngroup: Kept\n\n### Kept\nInside the group.');
        problems.push('a groups layout silently discarded an ungrouped card');
      } catch {
        // Expected.
      }
      try {
        parseQuire('layout: title\ndiagram: process\n\n# Bad\n\n1. **Launch** Leave Earth.');
        problems.push('a title layout silently discarded diagram content');
      } catch {
        // Expected.
      }
      try {
        parseQuire('layout: title\n\n# Bad\n\n> [!NOTE] This closer would disappear.');
        problems.push('a title layout silently discarded a closer');
      } catch {
        // Expected.
      }

      const donut = renderSlides({
        title: 'Visual edges',
        slides: [{
          layout: 'chart',
          title: 'Zero',
          chart: 'donut',
          columns: ['Label', 'Value'],
          rows: [['One', '0'], ['Two', '0']],
        }],
      });
      if (!donut.includes('<span>0</span>')) problems.push('zero-valued donut displays a nonzero total');

      const line = renderSlides({
        title: 'Visual edges',
        slides: [{
          layout: 'chart',
          title: 'Aligned',
          chart: 'line',
          columns: ['Week', 'Authors'],
          rows: [['Week 1', '12'], ['Week 2', '19'], ['Week 3', '31'], ['Week 4', '48']],
        }],
      });
      const markerPositions = [...line.matchAll(/chart-line-point" style="left:([\d.]+)%;top:([\d.]+)%"/g)]
        .map((match) => match[1]);
      const labelPositions = [...line.matchAll(/<span style="left:([\d.]+)%">Week/g)]
        .map((match) => match[1]);
      if (markerPositions.length !== 4 || markerPositions.join() !== labelPositions.join()) {
        problems.push('line chart markers and labels use different coordinates');
      }

      const bar = renderSlides({
        title: 'Visual edges',
        slides: [{
          layout: 'chart',
          title: 'Inset values',
          chart: 'bar',
          columns: ['Workflow', 'Minutes'],
          rows: [['Manual editing', '42'], ['Quire source', '9']],
        }],
      });
      if (!/chart-bar-fill[^>]*><strong>42<\/strong>/.test(bar) || /chart-value/.test(bar)) {
        problems.push('bar chart values are not inset inside their bars');
      }

      try {
        renderSlides({
          title: 'Visual edges',
          slides: [{ layout: 'chart', title: 'Bad', chart: 'radar', rows: [['One', '1']] }],
        });
        problems.push('unknown chart type did not fail');
      } catch {
        // Expected.
      }

      if (problems.length) {
        failed += 1;
        console.log('FAIL  native visual edge cases');
        for (const problem of problems) console.log(`   ${problem}`);
      } else {
        console.log('PASS  native visual edge cases  mixed media, attribution, zero data, and invalid types');
      }
    }
    if (problems.length) {
      failed += 1;
      console.log('FAIL  native image sources');
      for (const problem of problems) console.log(`   ${problem}`);
    } else {
      console.log('PASS  native image sources  same-origin paths, deck-relative URLs, and embedded image data');
    }
  }
}

{
  const markdown = '---\ntitle: Package\n---\n\nimage: ./images/pixel.png\n\n# One';
  const image = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
  const packed = packQuire(markdown, [{ path: 'images/pixel.png', bytes: image, type: 'image/png' }]);
  const unpacked = unpackQuire(packed);
  const problems = [];
  if (packed[0] !== 0x50 || packed[1] !== 0x4b) problems.push('package is not a ZIP file');
  if (unpacked.markdown !== markdown) problems.push('deck.md did not round-trip');
  if (unpacked.assets.length !== 1) problems.push(`expected one asset, got ${unpacked.assets.length}`);
  if (unpacked.assets[0]?.path !== 'images/pixel.png') problems.push('asset path did not round-trip');
  if (unpacked.assets[0]?.type !== 'image/png') problems.push('asset MIME type did not round-trip');
  if (String(unpacked.assets[0]?.bytes) !== String(image)) problems.push('asset bytes did not round-trip');
  if (String(referencedAssetPaths(markdown)) !== 'images/pixel.png') problems.push('relative asset was not discovered');
  const positionedImages = [
    '# First',
    '',
    'image: ./not-metadata.png',
    '',
    '---',
    '',
    '  Image: ./images/second.png',
    '',
    '## Second',
  ].join('\n');
  if (String(referencedAssetPaths(positionedImages)) !== 'images/second.png') {
    problems.push('asset discovery did not follow parsed metadata position and casing');
  }
  try {
    packQuire(markdown, [{ path: '../escape.png', bytes: image }]);
    problems.push('package accepted a traversal path');
  } catch {
    // Expected.
  }
  if (problems.length) {
    failed += 1;
    console.log('FAIL  native quire package');
    for (const problem of problems) console.log(`   ${problem}`);
  } else {
    console.log('PASS  native quire package  ZIP container, source, assets, MIME types, and traversal guard');
  }
}

// The app is assembled by concatenating modules into one script element. A
// single closing script tag anywhere in that source truncates the app, and the
// browser reports only "Invalid or unexpected token" — so assert the built
// artefact parses, rather than finding out by loading it.
const appPath = join(here, '..', 'quire.html');
if (existsSync(appPath)) {
  const app = readFileSync(appPath, 'utf8');
  const problems = [];
  const module = /<script type="module">([\s\S]*?)<\/script>/.exec(app);
  if (!module) {
    problems.push('no module script found in quire.html');
  } else {
    try {
      // Throws on a syntax error without executing anything.
      new Function(`return async () => { ${module[1]} }`);
    } catch (err) {
      problems.push(`module does not parse: ${err instanceof Error ? err.message : String(err)}`);
    }
    // Assert these are *defined*, not merely mentioned. Checking for the bare
    // name passes when a module fails to inline but its call site survives:
    // dropping fit.js leaves app.js still calling measureDeck, which read as
    // green while the app threw ReferenceError on first render.
    for (const symbol of [
      'parseQuire',
      'renderSlides',
      'measureDeck',
      'exportHtml',
      'readDeckFile',
      'rememberHandle',
      'safeDeckUrl',
    ]) {
      if (!new RegExp(`function ${symbol}\\b`).test(module[1])) {
        problems.push(`module does not define ${symbol} — a module failed to inline, or was truncated`);
      }
    }
    // Browser APIs the app calls; these are referenced, never declared.
    for (const symbol of ['showOpenFilePicker']) {
      if (!module[1].includes(symbol)) problems.push(`module is missing ${symbol} — likely truncated`);
    }
  }
  if (!/function fitMetricValues\b/.test(app)) {
    problems.push('app does not fit metric values to their individual cards');
  }
  if (!/@property \{number\} wide/.test(app) ||
      !/overflowing:\s*\(\)\s*=>\s*fitReport\.filter\(\(r\)\s*=>\s*r\.over\s*>\s*0\s*\|\|\s*r\.wide\s*>\s*0\)/.test(app)) {
    problems.push('live viewer fit reports do not include horizontal overflow');
  }
  if (!/function contentOverflow\b/.test(app) || /scrollWidth\s*-\s*node\.clientWidth/.test(app)) {
    problems.push('live viewer width checks do not ignore decorative pseudo-elements');
  }
  if (!/function remeasureAfterAssets\b/.test(app) || !/\.addEventListener\('load', settle\)/.test(app)) {
    problems.push('app does not remeasure overflow after images settle');
  }

  {
    checked += 1;
    const required = [
      '### Card heading',
      'Start the next slide',
      'group: Label',
      '[!ASIDE]',
      'executable content',
      'quire-package.mjs create',
      'quire-package.mjs import',
      'quire-package.mjs fit',
      'quire-package.mjs render',
      'gh skill update quire --dry-run',
      'A newer version of the Quire skill is available',
      'slides replace',
      'atomically replaces',
      'Never edit ZIP bytes',
      'exact headings',
      'quireFit.overflowing()',
      'Do not toggle `.active`',
    ];
    const guideText = AUTHORING_GUIDE.replace(/\s+/g, ' ');
    const missing = required.filter((text) => !guideText.includes(text));
    if (missing.length) {
      failed += 1;
      console.log(`FAIL  authoring guide  missing: ${missing.join(', ')}`);
    } else {
      console.log('PASS  authoring guide  native CLI, cards, slides, groups, closers, and trust boundary');
    }
  }
  if (!/id="scaler"/.test(app)) problems.push('no stage in quire.html');
  if (!/id="linkPreview"/.test(app) || !/\.slide\.active a\[href\]/.test(app)) {
    problems.push('slide link destination preview is not present in quire.html');
  }
  if (!/id="fitBtn"/.test(app)) problems.push('no overflow badge in quire.html');
  if (!/id="exportBtn"/.test(app)) problems.push('no export button in quire.html');
  if (!/id="installBtn"/.test(app)) problems.push('no PWA install button in quire.html');
  if (!/id="updateNotice"/.test(app)) problems.push('no PWA update notice in quire.html');
  if (!/rel="manifest" href="\/manifest\.webmanifest"/.test(app)) problems.push('no web app manifest link');
  if (!/serviceWorker\.register\('\/service-worker\.js'/.test(app)) problems.push('service worker is not registered');
  if (!/id="introDialog"/.test(app)) problems.push('no first-run explanation in quire.html');
  if (!/getAsFileSystemHandle/.test(app)) problems.push('file drop handles are not present in quire.html');
  if (!/unpackQuire/.test(app)) problems.push('native .quire package loading is not present in quire.html');
  if (!/quire:intro:v1/.test(app)) problems.push('first-run explanation is not remembered locally');
  if (!/\.diagram-process\s*\{[^}]*align-content:\s*center;[^}]*align-items:\s*stretch;/s.test(app)) {
    problems.push('process diagram nodes are not equalized as one multi-node visual');
  }
  if (!/\.media-figure img\s*\{[^}]*height:\s*0;[^}]*flex:\s*1 1 0;/s.test(app)) {
    problems.push('image intrinsic height can distort slide overflow measurement');
  }

  // The shell is embedded so the app can export offline through the same
  // page() the CLI uses. If it drifts from skills/quire/shell.html, an export stops
  // matching a CLI build and the difference is invisible until someone opens
  // an exported file.
  const embedded = /<script>\nwindow\.quireShell = ([\s\S]*?);\n<\/script>/.exec(app);
  if (!embedded) {
    problems.push('no embedded shell in quire.html — the app cannot export');
  } else {
    let shellText = null;
    try {
      shellText = JSON.parse(embedded[1]);
    } catch (err) {
      problems.push(`embedded shell is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (shellText !== null) {
      const source = readFileSync(join(here, '..', 'skills', 'quire', 'shell.html'), 'utf8');
      if (shellText !== source) {
        problems.push('embedded shell does not match skills/quire/shell.html — an export would differ from a CLI build');
      }
      const metricSource = readFileSync(join(here, '..', 'skills', 'quire', 'metrics.js'), 'utf8');
      if (!source.includes('/*__QUIRE_METRICS__*/') || !/function fitMetricValues\b/.test(metricSource)) {
        problems.push('exported decks do not include the shared metric fitting runtime');
      }
      if (!/document\.fonts\?\.ready/.test(metricSource)) {
        problems.push('metric fitting does not rerun after fonts load');
      }
      const packageSource = readFileSync(join(here, '..', 'skills', 'quire', 'quire-package.mjs'), 'utf8');
      if (!/contactSheetHtml[\s\S]*fitMetricValuesAfterFonts/.test(packageSource) ||
          !/singleSlideHtml[\s\S]*fitMetricValuesAfterFonts/.test(packageSource)) {
        problems.push('PNG render paths do not run the shared metric fitting runtime');
      }
      // Escaping `</script` is what keeps the embedded template from closing
      // its own element. Losing it truncates the app with a syntax error whose
      // message says nothing about the cause.
      if (/<\/script/i.test(embedded[1])) {
        problems.push('embedded shell contains an unescaped closing script tag — the app is truncated');
      }
    }

    const manifestPath = join(here, '..', 'manifest.webmanifest');
    const workerPath = join(here, '..', 'service-worker.js');
    const iconPath = join(here, '..', 'quire-icon.svg');
    if (existsSync(manifestPath) && existsSync(workerPath) && existsSync(iconPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const worker = readFileSync(workerPath, 'utf8');
      const problems = [];
      if (manifest.display !== 'standalone') problems.push('manifest is not standalone');
      if (manifest.start_url !== '/' || manifest.scope !== '/') problems.push('manifest start URL or scope is not root');
      if (!Array.isArray(manifest.icons)) {
        problems.push('manifest has no icons');
      } else if (
        !manifest.icons.some(
          (/** @type {{sizes?: string, purpose?: string}} */ icon) =>
            icon.sizes === '512x512' && String(icon.purpose).includes('maskable'),
        )
      ) {
        problems.push('manifest has no maskable icon');
      }
      if (
        Array.isArray(manifest.icons) &&
        !manifest.icons.some((/** @type {{sizes?: string}} */ icon) => icon.sizes === '192x192')
      ) {
        problems.push('manifest has no 192px install icon');
      }
      const quireHandler = manifest.file_handlers?.find(
        (/** @type {{accept?: Record<string, string[]>}} */ handler) =>
          handler.accept?.['application/vnd.quire+zip']?.includes('.quire'),
      );
      if (!quireHandler) problems.push('manifest does not register the installed app for .quire files');
      if (manifest.launch_handler?.client_mode !== 'new-client') {
        problems.push('manifest does not open launched decks in separate app windows');
      }
      if (!app.includes('launchQueue.setConsumer')) {
        problems.push('app does not consume files launched through the installed PWA');
      }
      if (!app.includes('BroadcastChannel') || !app.includes('isSameEntry')) {
        problems.push('app does not deduplicate PWA launches of an already-open deck');
      }
      if (
        !app.includes('updateViaCache: \'none\'') ||
        !app.includes("window.addEventListener('focus', checkForUpdatesAutomatically)") ||
        !app.includes('UPDATE_CHECK_INTERVAL')
      ) {
        problems.push('app does not proactively check for updates on launch, focus, and an interval');
      }
      if (!app.includes("'window-controls-overlay'") || !app.includes("'minimal-ui'")) {
        problems.push('app does not recognize all installed PWA display modes');
      }
      if (worker.includes('__QUIRE_VERSION__')) problems.push('service worker version was not generated');
      if (!worker.includes("'/manifest.webmanifest'") || !worker.includes("'/quire-icon-512.png'")) {
        problems.push('service worker does not cache the PWA assets');
      }
      if (!worker.includes('SKIP_WAITING')) problems.push('service worker cannot activate an accepted update');
      if (!worker.includes('FOCUS_CLIENT')) problems.push('service worker cannot focus an existing deck window');
      if (problems.length) {
        failed += 1;
        console.log('FAIL  progressive web app');
        for (const problem of problems) console.log(`   ${problem}`);
      } else {
        console.log('PASS  progressive web app  install manifest, offline shell, and controlled updates');
      }
    } else {
      failed += 1;
      console.log('FAIL  progressive web app  manifest, worker, or icon is missing');
    }
  }

  // Check the app's own markup only. The inlined render.js legitimately
  // contains these strings as arguments to its replace calls, and the embedded
  // shell is a template that is supposed to still have its placeholders.
  const moduleAt = app.indexOf('<script type="module">');
  const markup = (embedded ? app.slice(0, app.indexOf(embedded[0])) : app.slice(0, moduleAt));
  if (/\{slides\}|\{title\}|\{n\}/.test(markup)) problems.push('shell placeholder leaked into the app markup');

  if (problems.length) {
    failed += 1;
    console.log('FAIL  app build');
    for (const p of problems) console.log(`   ${p}`);
  } else {
    console.log('PASS  app build  module parses, runtime present, no leaked placeholders');
  }
}

if (checked === 0) {
  console.log('No fixtures with golden output.');
  process.exit(1);
}
process.exit(failed ? 1 : 0);

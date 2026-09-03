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
import { parseQuire } from '../src/deck.js';
import { imageSource, renderSlides, page, readSource } from '../src/render.js';
import { AUTHORING_GUIDE } from '../src/guide.js';

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
const shellPath = join(here, '..', 'src', 'shell.html');
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
        console.log('PASS  native visual edge cases  attribution, media, zero data, and invalid types');
      }
    }
    if (problems.length) {
      failed += 1;
      console.log('FAIL  native image sources');
      for (const problem of problems) console.log(`   ${problem}`);
    } else {
      console.log('PASS  native image sources  same-origin paths, deck-relative URLs, and embedded raster');
    }
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
    for (const symbol of ['parseQuire', 'renderSlides', 'measureDeck', 'exportHtml']) {
      if (!new RegExp(`function ${symbol}\\b`).test(module[1])) {
        problems.push(`module does not define ${symbol} — a module failed to inline, or was truncated`);
      }
    }
    // Browser APIs the app calls; these are referenced, never declared.
    for (const symbol of ['showOpenFilePicker']) {
      if (!module[1].includes(symbol)) problems.push(`module is missing ${symbol} — likely truncated`);
    }
  }

  {
    checked += 1;
    const required = [
      '### Card heading',
      'Start the next slide',
      'group: Label',
      '[!ASIDE]',
      'executable content',
      'general-purpose Quire deck access tool',
      'Wait for an explicit answer',
      'representative Quire fixture with known results',
    ];
    const guideText = AUTHORING_GUIDE.replace(/\s+/g, ' ');
    const missing = required.filter((text) => !guideText.includes(text));
    if (missing.length) {
      failed += 1;
      console.log(`FAIL  authoring guide  missing: ${missing.join(', ')}`);
    } else {
      console.log('PASS  authoring guide  cards, slides, groups, closers, and trust boundary');
    }
  }
  if (!/id="scaler"/.test(app)) problems.push('no stage in quire.html');
  if (!/id="fitBtn"/.test(app)) problems.push('no overflow badge in quire.html');
  if (!/id="exportBtn"/.test(app)) problems.push('no export button in quire.html');
  if (!/id="introDialog"/.test(app)) problems.push('no first-run explanation in quire.html');
  if (!/quire:intro:v1/.test(app)) problems.push('first-run explanation is not remembered locally');

  // The shell is embedded so the app can export offline through the same
  // page() the CLI uses. If it drifts from src/shell.html, an export stops
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
      const source = readFileSync(join(here, '..', 'src', 'shell.html'), 'utf8');
      if (shellText !== source) {
        problems.push('embedded shell does not match src/shell.html — an export would differ from a CLI build');
      }
      // Escaping `</script` is what keeps the embedded template from closing
      // its own element. Losing it truncates the app with a syntax error whose
      // message says nothing about the cause.
      if (/<\/script/i.test(embedded[1])) {
        problems.push('embedded shell contains an unescaped closing script tag — the app is truncated');
      }
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

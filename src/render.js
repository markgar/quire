// @ts-check
/**
 * Render a deck spec to HTML.
 *
 * The renderers use deterministic string concatenation so output changes remain
 * precise and reviewable in the golden snapshots.
 *
 * This module does not read files. `page()` takes the shell as a string so the
 * same code works in Node (shell read from disk) and in the browser (shell is
 * the document that is already loaded).
 */

import { mapOutsideHtml } from './html.js';

/** @typedef {import('./deck.js').Slide} Slide */
/** @typedef {import('./deck.js').Card} Card */
/** @typedef {import('./deck.js').Deck} Deck */

const ENTITY = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

/**
 * Escape bare ampersands, leave tags and existing entities intact.
 *
 * The format deliberately passes raw HTML through, so this cannot be a blanket
 * escape. It only fixes the one character that would silently corrupt output.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function h(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return mapOutsideHtml(text, (plain) => {
    let out = '';
    let pos = 0;
    ENTITY.lastIndex = 0;
    for (let m = ENTITY.exec(plain); m; m = ENTITY.exec(plain)) {
      out += plain.slice(pos, m.index).replace(/&/g, '&amp;');
      out += m[0];
      pos = m.index + m[0].length;
    }
    return out + plain.slice(pos).replace(/&/g, '&amp;');
  });
}

/**
 * Escape text for an HTML attribute while preserving no markup.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function attr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Indent every non-blank line. Blank lines stay blank rather than becoming
 * lines of spaces, which matters because the output is diffed.
 *
 * @param {string} text
 * @param {number} spaces
 * @returns {string}
 */
export function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : line))
    .join('\n');
}

/**
 * Return a default only when the value is absent, so an intentionally empty
 * string survives.
 *
 * @template T
 * @param {T | undefined | null} value
 * @param {T} fallback
 * @returns {T}
 */
const or = (value, fallback) => (value === undefined || value === null ? fallback : value);

// ---------------------------------------------------------------------------
// shared pieces
// ---------------------------------------------------------------------------

/**
 * Eyebrow + title + sub, shared by every non-title layout.
 * @param {Slide} slide
 */
export function head(slide, includeSub = true) {
  const parts = [];
  if (slide.eyebrow) parts.push(`<div class="eyebrow">${h(slide.eyebrow)}</div>`);
  parts.push(`<h2>${h(or(slide.title, 'Slide title'))}</h2>`);
  if (includeSub && slide.sub) parts.push(`<p class="sub">${h(slide.sub)}</p>`);
  return parts.join('\n');
}

/**
 * Trailing note and/or kicker - the last one is bottom-anchored by CSS.
 * @param {Slide} slide
 */
export function closer(slide) {
  const out = [];
  if (slide.note) out.push(`<div class="note">${h(slide.note)}</div>`);
  if (slide.kicker) out.push(`<div class="kicker">${h(slide.kicker)}</div>`);
  if (slide.source) out.push(`<div class="source-line">Source: ${h(slide.source)}</div>`);
  return out.join('\n');
}

/**
 * @param {string} inner
 * @param {Slide} slide
 */
export function wrapBody(inner, slide) {
  const blocks = [inner, closer(slide)].filter(Boolean);
  return '<div class="body">\n' + indent(blocks.join('\n'), 2) + '\n</div>';
}

// ---------------------------------------------------------------------------
// layouts
// ---------------------------------------------------------------------------

/** @param {Slide} slide */
export function lTitle(slide) {
  const parts = [
    `<div class="eyebrow">${h(or(slide.eyebrow, 'EYEBROW &middot; CONTEXT'))}</div>`,
    `<h1>${h(or(slide.headline, or(slide.title, 'Headline that states the argument')))}</h1>`,
  ];
  if (slide.lede) parts.push(`<p class="lede">${h(slide.lede)}</p>`);
  const meta = slide.meta || [];
  if (meta.length) {
    const spans = meta.map((m) => `  <span>${h(m)}</span>`).join('\n');
    parts.push('<div class="title-meta">\n' + spans + '\n</div>');
  }
  if (slide.source) parts.push(`<div class="source-line title-source">Source: ${h(slide.source)}</div>`);
  return parts.join('\n');
}

/**
 * @param {{cards?: Card[], numbered?: boolean}} slide
 * @param {number} cols
 */
export function lCards(slide, cols) {
  const cards =
    slide.cards ||
    Array.from({ length: cols }, () => /** @type {Card} */ ({ h: 'Point', p: 'Detail.' }));
  const numbered = or(slide.numbered, false);
  const out = [`<div class="grid g${cols}">`];
  cards.forEach((c, i) => {
    const cls = c.accent ? 'card accent' : 'card';
    const bits = [`<div class="${cls}">`];
    if (numbered) bits.push(`  <span class="num">${i + 1}</span>`);
    bits.push(`  <h3>${h(or(c.h, 'Point'))}</h3>`);
    bits.push(`  <p>${h(or(c.p, 'Detail.'))}</p>`);
    bits.push('</div>');
    out.push(indent(bits.join('\n'), 2));
  });
  out.push('</div>');
  return out.join('\n');
}

/** @param {Slide} slide */
export function lTable(slide) {
  const cols = slide.columns || ['Column A', 'Column B', 'Column C'];
  const rows = slide.rows || [['Item', 'Before', 'After']];
  const classes = ['k', 'was', 'is'];
  let out = ['<table>', '  <thead>', '    <tr>'];
  out = out.concat(cols.map((c) => `      <th>${h(c)}</th>`));
  out = out.concat(['    </tr>', '  </thead>', '  <tbody>']);
  for (const r of rows) {
    out.push('    <tr>');
    r.forEach((cell, j) => {
      const cls = j < classes.length ? classes[j] : '';
      const attr = cls ? ` class="${cls}"` : '';
      out.push(`      <td${attr}>${h(cell)}</td>`);
    });
    out.push('    </tr>');
  }
  out = out.concat(['  </tbody>', '</table>']);
  return out.join('\n');
}

/** @param {Slide} slide */
export function lRows(slide) {
  const items = slide.items || [{ q: 'Question', a: 'Answer.' }];
  const badge = or(slide.badge, 'number');
  const out = ['<div class="rows">'];
  items.forEach((it, i) => {
    const mark = badge === 'check' ? '&check;' : String(i + 1);
    const block = [
      '<div class="row">',
      `  <span class="badge">${mark}</span>`,
      '  <div>',
      `    <div class="q">${h(or(it.q, 'Question'))}</div>`,
      `    <div class="a">${h(or(it.a, 'Answer.'))}</div>`,
      '  </div>',
      '</div>',
    ];
    out.push(indent(block.join('\n'), 2));
  });
  out.push('</div>');
  return out.join('\n');
}

/** @param {Slide & {emphasis?: string, cols?: number}} slide */
export function lPull(slide) {
  const quote = or(slide.quote, 'The line worth quoting back.');
  const emph = slide.emphasis;
  let text = h(quote);
  if (emph) text += ` <em>${h(emph)}</em>`;
  const out = [`<div class="pull">\n  ${text}\n</div>`];
  if (slide.cards) out.push(lCards(slide, or(slide.cols, 2)));
  return out.join('\n');
}

/**
 * Labelled bands of cards - two questions rather than one list.
 * @param {Slide} slide
 */
export function lGroups(slide) {
  const out = [];
  for (const g of slide.groups || []) {
    const cards = g.cards || [];
    const cols = /** @type {any} */ (g).cols || (cards.length >= 3 ? 3 : 2);
    const inner = lCards({ cards, numbered: slide.numbered }, cols);
    const block = [
      '<div class="group">',
      `  <div class="group-label">${h(or(g.label, ''))}</div>`,
      indent(inner, 2),
      '</div>',
    ];
    out.push(block.join('\n'));
  }
  return out.join('\n');
}

/** @param {Slide} slide */
export function lMetrics(slide) {
  const cards = slide.cards || [];
  const out = ['<div class="metrics">'];
  cards.forEach((card) => {
    const cls = card.accent ? 'metric accent' : 'metric';
    out.push(indent([
      `<div class="${cls}">`,
      `  <div class="metric-value">${h(card.h)}</div>`,
      `  <div class="metric-label">${h(card.p)}</div>`,
      '</div>',
    ].join('\n'), 2));
  });
  out.push('</div>');
  return out.join('\n');
}

/**
 * Image sources are deliberately limited to same-origin paths and embedded
 * raster data. Raw HTML remains the explicit escape hatch for anything else.
 *
 * @param {string | undefined} value
 * @returns {string}
 */
export function imageSource(value) {
  const source = String(value || '').trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
  if (/^(?:\/(?!\/)|\.{1,2}\/)[^\s]*$/i.test(source)) return source;
  if (/^[a-z0-9][a-z0-9._/-]*$/i.test(source)) return source;
  return '';
}

/** @param {Slide} slide */
export function lMedia(slide) {
  const src = imageSource(slide.image);
  if (slide.imagePosition && !['left', 'right', 'full'].includes(slide.imagePosition)) {
    throw new Error(`unknown image position ${JSON.stringify(slide.imagePosition)}; choose left, right, or full`);
  }
  const position = slide.imagePosition || 'right';
  const figure = [
    `<figure class="media-figure media-${position}">`,
    src
      ? `  <img src="${attr(src)}" alt="${attr(or(slide.imageAlt, ''))}">`
      : '  <div class="media-missing">Image unavailable</div>',
  ];
  if (slide.caption || slide.credit) {
    const caption = [slide.caption, slide.credit].filter(Boolean).map(h).join(' · ');
    figure.push(`  <figcaption>${caption}</figcaption>`);
  }
  figure.push('</figure>');

  if (position === 'full') return figure.join('\n');
  const content = slide.cards?.length
    ? lCards(slide, Math.min(slide.cards.length, 2))
    : `<p class="media-copy">${h(or(slide.sub, ''))}</p>`;
  const pieces = position === 'left' ? [figure.join('\n'), content] : [content, figure.join('\n')];
  return `<div class="media-split">\n${indent(pieces.join('\n'), 2)}\n</div>`;
}

/** @param {unknown} value */
function number(value) {
  const parsed = Number(String(value ?? '').replace(/[,%$]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** @param {Slide} slide */
export function lChart(slide) {
  const rows = slide.rows || [];
  const values = rows.map((row) => number(row[1]));
  if (!rows.length || rows.some((row) => row.length < 2)) {
    throw new Error('a chart needs a table with label and value columns');
  }
  if (values.some((value) => value === null)) {
    throw new Error('chart values must be numbers');
  }
  if (slide.chart && !['bar', 'line', 'donut'].includes(slide.chart)) {
    throw new Error(`unknown chart ${JSON.stringify(slide.chart)}; choose bar, line, or donut`);
  }
  const numeric = /** @type {number[]} */ (values);
  const max = Math.max(...numeric, 1);
  const kind = slide.chart || 'bar';

  if (kind === 'bar') {
    const bars = rows.map((row, index) => {
      const width = Math.max(2, (numeric[index] / max) * 100);
      return [
        '<div class="chart-bar-row">',
        `  <div class="chart-label">${h(row[0])}</div>`,
        `  <div class="chart-track"><span style="width:${width.toFixed(2)}%"></span></div>`,
        `  <div class="chart-value">${h(row[1])}</div>`,
        '</div>',
      ].join('\n');
    });
    return `<div class="chart chart-bar">\n${indent(bars.join('\n'), 2)}\n</div>`;
  }

  if (kind === 'line') {
    const width = 820;
    const height = 280;
    const step = rows.length > 1 ? width / (rows.length - 1) : 0;
    const points = numeric.map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 20);
      return [x, y];
    });
    const polyline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const dots = points.map(([x, y], index) => [
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"><title>${attr(rows[index][0])}: ${attr(rows[index][1])}</title></circle>`,
      `<text x="${x.toFixed(1)}" y="${Math.max(16, y - 16).toFixed(1)}">${h(rows[index][1])}</text>`,
    ].join('\n')).join('\n');
    const labels = rows.map((row) => `<span>${h(row[0])}</span>`).join('');
    return [
      '<div class="chart chart-line">',
      `  <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${attr(or(slide.imageAlt, 'Line chart'))}">`,
      `    <polyline points="${polyline}"></polyline>`,
      indent(dots, 4),
      '  </svg>',
      `  <div class="chart-axis">${labels}</div>`,
      '</div>',
    ].join('\n');
  }

  const total = numeric.reduce((sum, value) => sum + value, 0);
  const denominator = total || 1;
  let cursor = 0;
  const stops = numeric.map((value, index) => {
    const start = cursor;
    cursor += (value / denominator) * 100;
    return `var(--chart-${(index % 5) + 1}) ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const legend = rows.map((row, index) => [
    '<div class="chart-legend-item">',
    `  <span class="chart-swatch swatch-${(index % 5) + 1}"></span>`,
    `  <span>${h(row[0])}</span>`,
    `  <strong>${h(row[1])}</strong>`,
    '</div>',
  ].join('\n')).join('\n');
  return [
    '<div class="chart chart-donut">',
    `  <div class="donut" style="background:conic-gradient(${stops.join(',')})">`,
    `    <span>${h(String(total))}</span>`,
    '  </div>',
    `  <div class="chart-legend">\n${indent(legend, 4)}\n  </div>`,
    '</div>',
  ].join('\n');
}

/** @param {Slide} slide */
export function lDiagram(slide) {
  const items = slide.items || [];
  if (!items.length) throw new Error('a diagram needs a list of nodes');
  if (slide.diagram && !['process', 'timeline', 'hierarchy'].includes(slide.diagram)) {
    throw new Error(`unknown diagram ${JSON.stringify(slide.diagram)}; choose process, timeline, or hierarchy`);
  }
  const kind = slide.diagram || 'process';
  const nodes = items.map((item, index) => [
    `<div class="diagram-node${index === 0 ? ' accent' : ''}">`,
    `  <span class="diagram-mark">${index + 1}</span>`,
    `  <strong>${h(item.q)}</strong>`,
    `  <p>${h(item.a)}</p>`,
    '</div>',
  ].join('\n')).join('\n');
  return `<div class="diagram diagram-${kind}">\n${indent(nodes, 2)}\n</div>`;
}

/** @type {Record<string, ((s: any) => string) | null>} */
export const LAYOUTS = {
  title: null, // handled specially - no .body wrapper
  cards2: (s) => lCards(s, 2),
  cards3: (s) => lCards(s, 3),
  groups: lGroups,
  table: lTable,
  rows: lRows,
  pull: lPull,
  metrics: lMetrics,
  media: lMedia,
  chart: lChart,
  diagram: lDiagram,
  blank: () => '<!-- content -->',
};

/**
 * @param {Slide} slide
 * @param {boolean} first
 * @returns {string}
 */
export function renderSlide(slide, first) {
  const layout = or(slide.layout, 'cards3');
  if (!(layout in LAYOUTS)) {
    throw new Error(`unknown layout ${JSON.stringify(layout)}; choose from ${Object.keys(LAYOUTS).join(', ')}`);
  }

  const active = first ? ' active' : '';
  const hid = slide.hidden ? ' data-hidden="true"' : '';
  const modifiers = [
    slide.tone === 'accent' || slide.tone === 'contrast' ? ` tone-${slide.tone}` : '',
    slide.align === 'center' ? ' align-center' : '',
    layout === 'media' && ['left', 'right', 'full'].includes(slide.imagePosition || '')
      ? ` media-position-${slide.imagePosition}`
      : layout === 'media'
        ? ' media-position-right'
        : '',
  ].join('');
  if (layout === 'title') {
    return `<section class="slide title-slide${modifiers}${active}"${hid}>\n${indent(lTitle(slide), 2)}\n</section>`;
  }

  const fn = LAYOUTS[layout];
  if (!fn) throw new Error(`layout ${layout} has no renderer`);
  const inner = wrapBody(fn(slide), slide);
  const mediaUsesSub =
    layout === 'media' && slide.imagePosition !== 'full' && !(slide.cards && slide.cards.length);
  return `<section class="slide${modifiers}${active}"${hid}>\n${indent(head(slide, !mediaUsesSub), 2)}\n${indent(inner, 2)}\n</section>`;
}

/**
 * Render every slide as one indented fragment.
 * @param {Deck} spec
 */
export function renderSlides(spec) {
  const slides = spec.slides || [];
  if (!slides.length) throw new Error('spec has no slides');
  return slides.map((s, i) => indent(renderSlide(s, i === 0), 2)).join('\n\n');
}

/**
 * Escape Markdown for embedding in a `text/plain` script element.
 *
 * Script elements are raw text: the parser does not decode entities, it only
 * scans for a closing tag. Escaping every `<` therefore makes it impossible
 * for embedded content to terminate the element early — including a deck that
 * legitimately contains a closing script tag as literal text.
 *
 * Only `&` and `<` are touched, so the source stays readable in view-source.
 * The pair is exactly reversible: `&` is escaped first and unescaped last, so
 * a deck containing `&lt;` round-trips to `&lt;` rather than to `<`.
 *
 * (This comment deliberately avoids writing that closing tag out. These
 * modules are concatenated into one script element to build the app, and the
 * HTML parser does not care that an occurrence sits inside a comment.)
 *
 * @param {string} markdown
 * @returns {string}
 */
export function escapeSource(markdown) {
  return markdown.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/**
 * Inverse of escapeSource. Order matters — see there.
 *
 * @param {string} escaped
 * @returns {string}
 */
export function unescapeSource(escaped) {
  return escaped.replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

/** Matches the source element in the shell, whole line, so it can be removed. */
const SOURCE_TAG = /^[ \t]*<script type="text\/plain" id="quire-source">\{source\}<\/script>[ \t]*\r?\n?/m;

/** The placeholders the shell defines, matched in one pass. */
const PLACEHOLDER = /\{(title|theme|slides|n|source)\}/g;

/**
 * Fill the shell with a rendered deck.
 *
 * The shell is passed in rather than read, so this works unchanged in the
 * browser once a deck renders itself at runtime.
 *
 * When `markdown` is supplied it is embedded, making the output a
 * self-describing file. When it is omitted the source element is removed rather
 * than left empty, so a deck built without a source does not claim to carry one.
 *
 * Every placeholder is substituted in a single pass, and the replacement
 * function form means `$&` inside deck content is never read as a replacement
 * pattern.
 *
 * The single pass is load-bearing. Replacing one at a time walked the string
 * again after each substitution, so a deck could hand a later placeholder to
 * an earlier one: a deck titled `{slides}` put that text into `<title>` first,
 * and the next replacement then filled *that* copy — the whole deck body
 * landed inside the title element, the real slide slot survived verbatim, and
 * the reader saw an empty deck. The round-trip guard did not notice, because
 * the source still recovered exactly.
 *
 * @param {Deck} spec
 * @param {string} shell
 * @param {string} [markdown]
 * @returns {string}
 */
export function page(spec, shell, markdown) {
  const embed = markdown !== undefined && markdown !== null;
  /** @type {Record<string, string>} */
  const values = {
    title: h(or(spec.title, 'Presentation')),
    theme: spec.theme || '',
    slides: renderSlides(spec) + '\n',
    n: String((spec.slides || []).length),
    source: embed ? escapeSource(/** @type {string} */ (markdown)) : '',
  };
  const base = embed ? shell : shell.replace(SOURCE_TAG, '');
  PLACEHOLDER.lastIndex = 0;
  return base.replace(PLACEHOLDER, (_match, /** @type {string} */ key) => values[key]);
}

/**
 * Recover the Markdown a deck was built from.
 *
 * Takes the HTML as a string so it works on a file read from disk as well as
 * on a live document, and so recovery can be tested without a browser.
 *
 * @param {string} html
 * @returns {string | null} the exact source, or null if the deck carries none
 */
export function readSource(html) {
  const m = /<script type="text\/plain" id="quire-source">([\s\S]*?)<\/script>/.exec(html);
  return m ? unescapeSource(m[1]) : null;
}

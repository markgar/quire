// @ts-check
/**
 * Parse Quire source into a deck spec.
 *
 * The format is described in SPEC.md, which is normative. Changes to parser
 * behavior must update the spec and reviewed fixture snapshots together.
 */

import { mapOutsideHtml } from './html.js';

/**
 * @typedef {Object} Card
 * @property {string} h
 * @property {string} p
 * @property {boolean} accent
 */

/**
 * @typedef {Object} Slide
 * @property {string} [eyebrow]
 * @property {boolean} [hidden]
 * @property {string} [layout]
 * @property {string} [headline]
 * @property {string} [lede]
 * @property {string[]} [meta]
 * @property {string} [title]
 * @property {string} [sub]
 * @property {Card[]} [cards]
 * @property {{label: string, cards: Card[]}[]} [groups]
 * @property {boolean} [numbered]
 * @property {string[]} [columns]
 * @property {string[][]} [rows]
 * @property {{q: string, a: string}[]} [items]
 * @property {string} [badge]
 * @property {string} [quote]
 * @property {string} [note]
 * @property {string} [kicker]
 * @property {string} [image]
 * @property {string} [imageAlt]
 * @property {string} [imagePosition]
 * @property {string} [imageFit]
 * @property {string} [caption]
 * @property {string} [credit]
 * @property {string} [chart]
 * @property {string} [diagram]
 * @property {string} [source]
 * @property {string} [tone]
 * @property {string} [align]
 */

/** @typedef {{title: string, theme?: 'light' | 'dark', slides: Slide[]}} Deck */
/** @typedef {{assetBase?: string, assetMap?: Record<string, string>}} ParseOptions */

const SEP = /^-{3,}\s*$/;
const META = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/;

/**
 * Meta keys the parser understands. Used to tell a commented-out meta line
 * ("# hidden: true") from a real Markdown heading ("# Owning versus renting"),
 * which otherwise both start with '#'.
 */
const META_KEYS = new Set([
  'eyebrow',
  'layout',
  'hidden',
  'numbered',
  'badge',
  'image',
  'image-alt',
  'image-position',
  'image-fit',
  'caption',
  'credit',
  'chart',
  'diagram',
  'source',
  'tone',
  'align',
]);
const COMMENTED_META = /^#+\s*([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/;

/** `group: Label` inside a slide body opens a labelled band of cards. */
const GROUP = /^group:\s*(.+)$/i;
const ACCENT = /\s*\{accent\}\s*$/i;
const ALERT = /^\[!([a-zA-Z]+)\]\s*/i;
const ROW_ITEM = /^(?:\d+[.)]|[-*])\s+(.*)$/;

/**
 * The question is the bold lead of a list item. An em-dash separator was tried
 * first and split on the wrong dash whenever the question itself contained one
 * ("Standard or Enterprise - and do they still need Enterprise?"), so the
 * question is marked explicitly instead of inferred from punctuation.
 */
const QA_BOLD = /^\*\*([\s\S]+?)\*\*[\s:.\u2014-]*([\s\S]*)$/;

const KICKER_ALERTS = new Set(['aside', 'kicker']);

const TRUTHY = new Set(['true', 'yes', '1']);
const THEMES = new Set(['light', 'dark']);

/** @param {string | undefined} v */
const isTrue = (v) => TRUTHY.has(String(v ?? '').toLowerCase());

/** Trim whitespace from both ends. @param {string} s */
const strip = (s) => s.replace(/^\s+|\s+$/g, '');

/** @param {string} value */
const inlineAttr = (value) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {string} value */
const linkTarget = (value) => {
  const target = strip(value);
  return /^(?:https?:\/\/|mailto:|\/(?!\/)|\.{0,2}\/|#)/i.test(target) ? target : '';
};

// ---------------------------------------------------------------------------
// inline
// ---------------------------------------------------------------------------

/**
 * Markdown emphasis -> HTML. Raw HTML in the source is left alone, which is
 * what makes the format usable when Markdown is too blunt.
 *
 * @param {string} text
 * @returns {string}
 */
export function inline(text) {
  if (!text) return '';
  return mapOutsideHtml(strip(text), (plain) => {
    const linked = plain.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, target) => {
      const href = linkTarget(target);
      return href ? `<a href="${inlineAttr(href)}">${label}</a>` : whole;
    });
    return linked
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<![\w*])\*(?!\s)([\s\S]+?)(?<!\s)\*(?![\w*])/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  });
}

// ---------------------------------------------------------------------------
// block splitting
// ---------------------------------------------------------------------------

/**
 * Split on --- separators, honouring a leading meta block and code fences.
 *
 * @param {string} text
 * @returns {{docMeta: Record<string, string>, chunks: string[][]}}
 */
export function splitSlides(text) {
  const lines = text.split('\n');
  /** @type {Record<string, string>} */
  const docMeta = {};
  let start = 0;

  // leading --- ... --- document meta
  let i = 0;
  while (i < lines.length && !strip(lines[i])) i += 1;
  if (i < lines.length && SEP.test(lines[i])) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (SEP.test(lines[j])) {
        for (const line of lines.slice(i + 1, j)) {
          const m = META.exec(strip(line));
          if (m) docMeta[m[1]] = strip(m[2]);
        }
        start = j + 1;
        break;
      }
    }
  }

  /** @type {string[][]} */
  const chunks = [];
  /** @type {string[]} */
  let cur = [];
  let fenced = false;
  for (const line of lines.slice(start)) {
    if (strip(line).startsWith('```')) fenced = !fenced;
    if (!fenced && SEP.test(line)) {
      chunks.push(cur);
      cur = [];
    } else {
      cur.push(line);
    }
  }
  chunks.push(cur);

  return { docMeta, chunks: chunks.filter((c) => c.some((x) => strip(x))) };
}

/**
 * Pull leading `key: value` lines off a slide.
 *
 * A line like `# hidden: true` is treated as a commented-out meta line and
 * skipped, so a setting can be toggled without being deleted. Disambiguated
 * from a real heading by requiring a recognised meta key.
 *
 * Only recognised keys are absorbed. Anything else is body content, because
 * absorbing unknown keys silently deletes it: a slide opening with
 * `group: FIRST BAND` lost the whole band, and one opening with a line like
 * "Bottom line: they own it" would lose the line, with no error either way.
 *
 * @param {string[]} lines
 * @returns {[Record<string, string>, string[]]}
 */
export function takeMeta(lines) {
  /** @type {Record<string, string>} */
  const meta = {};
  let i = 0;
  while (i < lines.length) {
    const s = strip(lines[i]);
    if (!s) {
      i += 1;
      continue;
    }
    const c = COMMENTED_META.exec(s);
    if (c && META_KEYS.has(c[1].toLowerCase())) {
      i += 1;
      continue;
    }
    if (/^[#>|\-*]/.test(s)) break;
    const m = META.exec(s);
    if (!m || !META_KEYS.has(m[1].toLowerCase())) break;
    meta[m[1].toLowerCase()] = strip(m[2]);
    i += 1;
  }
  return [meta, lines.slice(i)];
}

/**
 * Group lines into [kind, payload] blocks.
 *
 * @param {string[]} lines
 * @returns {[string, any][]}
 */
export function blocks(lines) {
  /** @type {[string, any][]} */
  const out = [];
  /** @type {string[]} */
  let buf = [];

  const flush = () => {
    if (buf.length) {
      const joined = buf.map(strip).filter(Boolean).join(' ');
      if (joined) out.push(['p', joined]);
      buf = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const s = strip(line);
    if (!s) {
      flush();
      i += 1;
      continue;
    }
    if (s.startsWith('### ')) {
      flush();
      const head = strip(s.slice(4));
      /** @type {string[]} */
      const body = [];
      i += 1;
      while (i < lines.length) {
        const nxt = strip(lines[i]);
        if (nxt.startsWith('#') || nxt.startsWith('>') || GROUP.test(nxt) || SEP.test(lines[i])) break;
        if (nxt) body.push(nxt);
        i += 1;
      }
      out.push(['card', [head, body.join(' ')]]);
      continue;
    }
    const g = GROUP.exec(s);
    if (g) {
      flush();
      out.push(['group', strip(g[1])]);
      i += 1;
      continue;
    }
    if (s.startsWith('## ')) {
      flush();
      out.push(['h2', strip(s.slice(3))]);
    } else if (s.startsWith('# ')) {
      flush();
      out.push(['h1', strip(s.slice(2))]);
    } else if (s.startsWith('>')) {
      flush();
      const quote = [strip(s.replace(/^>+/, ''))];
      i += 1;
      while (i < lines.length && strip(lines[i]).startsWith('>')) {
        quote.push(strip(strip(lines[i]).replace(/^>+/, '')));
        i += 1;
      }
      out.push(['quote', quote.filter(Boolean).join(' ')]);
      continue;
    } else if (s.startsWith('|')) {
      flush();
      /** @type {string[]} */
      const rows = [];
      while (i < lines.length && strip(lines[i]).startsWith('|')) {
        rows.push(strip(lines[i]));
        i += 1;
      }
      out.push(['table', rows]);
      continue;
    } else if (ROW_ITEM.test(s)) {
      flush();
      /** @type {string[]} */
      const items = [];
      while (i < lines.length) {
        const m = ROW_ITEM.exec(strip(lines[i]));
        if (!m) {
          if (strip(lines[i])) break;
          i += 1;
          continue;
        }
        items.push(strip(m[1]));
        i += 1;
      }
      out.push(['list', items]);
      continue;
    } else {
      buf.push(line);
    }
    i += 1;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// slide assembly
// ---------------------------------------------------------------------------

/**
 * @param {string[]} rows
 * @returns {[string[], string[][]]}
 */
export function parseTable(rows) {
  /** @param {string} r */
  const cells = (r) =>
    strip(r)
      .replace(/^\|+/, '')
      .replace(/\|+$/, '')
      .split('|')
      .map(strip);

  const header = cells(rows[0]);
  const body = rows.slice(1).filter((r) => !/^\|[\s:|-]+\|?$/.test(strip(r))).map(cells);
  return [header, body];
}

/**
 * @param {string[]} chunk
 * @param {boolean} first
 * @param {ParseOptions} [opts]
 * @returns {Slide}
 */
export function buildSlide(chunk, first, opts = {}) {
  const [meta, rest] = takeMeta(chunk);
  const bl = blocks(rest);

  /** @type {Slide} */
  const slide = {};
  if (meta.eyebrow) slide.eyebrow = meta.eyebrow;
  if (isTrue(meta.hidden)) slide.hidden = true;
  if (meta.image) {
    slide.image = meta.image;
    if (opts.assetMap?.[meta.image]) {
      slide.image = opts.assetMap[meta.image];
    } else if (opts.assetBase && !/^data:/i.test(meta.image)) {
      try {
        const base = new URL(opts.assetBase);
        const resolved = new URL(meta.image, base);
        if (resolved.origin === base.origin) {
          slide.image = `${resolved.pathname}${resolved.search}${resolved.hash}`;
        }
      } catch {
        // The renderer will show the unavailable-image state.
      }
    }
  }
  if (meta['image-alt']) slide.imageAlt = meta['image-alt'];
  if (meta['image-position']) slide.imagePosition = meta['image-position'].toLowerCase();
  if (meta['image-fit']) slide.imageFit = meta['image-fit'].toLowerCase();
  if (meta.caption) slide.caption = inline(meta.caption);
  if (meta.credit) slide.credit = inline(meta.credit);
  if (meta.chart) slide.chart = meta.chart.toLowerCase();
  if (meta.diagram) slide.diagram = meta.diagram.toLowerCase();
  if (meta.source) slide.source = inline(meta.source);
  if (meta.tone) slide.tone = meta.tone.toLowerCase();
  if (meta.align) slide.align = meta.align.toLowerCase();

  const heads = bl.filter((b) => b[0] === 'h1' || b[0] === 'h2');
  const cards = bl.filter((b) => b[0] === 'card').map((b) => b[1]);
  const tables = bl.filter((b) => b[0] === 'table').map((b) => b[1]);
  const lists = bl.filter((b) => b[0] === 'list').map((b) => b[1]);
  const quotes = bl.filter((b) => b[0] === 'quote').map((b) => b[1]);
  const paras = bl.filter((b) => b[0] === 'p').map((b) => b[1]);
  const hasGroups = bl.some((b) => b[0] === 'group');
  const firstGroup = bl.findIndex((b) => b[0] === 'group');
  const hasUngroupedCards = firstGroup >= 0 && bl.slice(0, firstGroup).some((b) => b[0] === 'card');

  const isTitle =
    meta.layout === 'title' ||
    (!meta.layout && (first || (heads.length > 0 && heads[0][0] === 'h1')));

  // Trailing quotes become closers (note and/or kicker); a leading one is a
  // pull quote. A slide can carry both a note and a kicker, in that order.
  /** @type {[string, string][]} */
  const closers = [];
  /** @type {string | null} */
  let leadQuote = null;
  if (quotes.length) {
    const idx = bl.map((b, n) => (b[0] === 'quote' ? n : -1)).filter((n) => n >= 0);
    /** @type {string[]} */
    const trailing = [];
    for (const pos of [...idx].reverse()) {
      const after = bl.slice(pos + 1).filter((b) => b[0] !== 'p' || strip(b[1]));
      if (after.every((x) => x[0] === 'quote')) trailing.unshift(bl[pos][1]);
      else break;
    }
    for (const q of trailing) {
      const m = ALERT.exec(q);
      if (m) {
        const kind = m[1].toLowerCase();
        closers.push([KICKER_ALERTS.has(kind) ? 'kicker' : 'note', q.replace(ALERT, '')]);
      } else {
        closers.push(['note', q]);
      }
    }
    const remaining = quotes.slice(0, quotes.length - trailing.length);
    if (remaining.length) leadQuote = remaining[0];
  }

  if (tables.length > 1 || lists.length > 1) {
    throw new Error('a slide can contain only one table or list block');
  }

  if (isTitle) {
    const unsupported = [
      hasGroups || cards.length ? 'card' : '',
      tables.length ? 'table' : '',
      quotes.length ? 'quote' : '',
      meta.chart ? 'chart' : '',
      meta.diagram ? 'diagram' : '',
    ].filter(Boolean);
    if (unsupported.length) {
      throw new Error(`title layout cannot render ${unsupported.join(', ')} content; move it to another slide`);
    }
    slide.layout = 'title';
    if (heads.length) slide.headline = inline(heads[0][1]);
    if (paras.length) slide.lede = inline(paras[0]);
    if (lists.length) slide.meta = lists[0].map(inline);
    return slide;
  }

  if (heads.length) slide.title = inline(heads[0][1]);
  if (paras.length) slide.sub = inline(paras[0]);

  let layout = meta.layout;
  if (!layout) {
    if (hasGroups) layout = 'groups';
    else if (leadQuote) layout = 'pull';
    else if (meta.chart) layout = 'chart';
    else if (meta.diagram) layout = 'diagram';
    else if (tables.length) layout = 'table';
    else if (cards.length) layout = cards.length >= 3 ? 'cards3' : 'cards2';
    else if (lists.length) layout = 'rows';
    else if (meta.image) layout = 'media';
    else layout = 'blank';
  }
  slide.layout = layout;

  const contentKinds = [
    hasGroups ? 'groups' : '',
    !hasGroups && cards.length ? 'cards' : '',
    hasUngroupedCards ? 'cards' : '',
    tables.length ? 'table' : '',
    lists.length ? 'list' : '',
    leadQuote ? 'pull-quote' : '',
  ].filter(Boolean);
  /** @type {Record<string, string[]>} */
  const accepted = {
    cards2: ['cards'],
    cards3: ['cards'],
    groups: ['groups'],
    table: ['table'],
    chart: ['table'],
    rows: ['list'],
    diagram: ['list'],
    pull: ['pull-quote', 'cards', 'list'],
    metrics: ['cards'],
    media: ['cards'],
    blank: [],
  };
  if (layout in accepted) {
    const unsupported = contentKinds.filter((kind) => !accepted[layout].includes(kind));
    if (unsupported.length) {
      throw new Error(
        `${layout} layout cannot render ${unsupported.join(', ')} content; ` +
          'remove the conflicting setting or move that content to another slide',
      );
    }
  }
  if (meta.chart && layout !== 'chart') {
    throw new Error(`chart: ${meta.chart} requires the chart layout`);
  }
  if (meta.diagram && layout !== 'diagram') {
    throw new Error(`diagram: ${meta.diagram} requires the diagram layout`);
  }
  /**
   * @param {string} head
   * @param {string} body
   * @returns {Card}
   */
  const mkcard = (head, body) => ({
    h: inline(head.replace(ACCENT, '')),
    p: inline(body),
    accent: ACCENT.test(head),
  });

  if (hasGroups) {
    /** @type {{label: string, cards: Card[]}[]} */
    const groups = [];
    /** @type {{label: string, cards: Card[]} | null} */
    let cur = null;
    for (const [kind, payload] of bl) {
      if (kind === 'group') {
        cur = { label: payload, cards: [] };
        groups.push(cur);
      } else if (kind === 'card' && cur !== null) {
        cur.cards.push(mkcard(payload[0], payload[1]));
      }
    }
    slide.groups = groups.filter((g) => g.cards.length);
    if (isTrue(meta.numbered)) slide.numbered = true;
  } else if (cards.length) {
    slide.cards = cards.map(([head, body]) => mkcard(head, body));
    if (isTrue(meta.numbered)) slide.numbered = true;
  }

  if (tables.length) {
    const [header, body] = parseTable(tables[0]);
    slide.columns = header.map(inline);
    slide.rows = body.map((r) => r.map(inline));
  }

  if (lists.length && (layout === 'rows' || layout === 'diagram' || layout === 'pull')) {
    /** @type {{q: string, a: string}[]} */
    const items = [];
    for (const raw of lists[0]) {
      const m = QA_BOLD.exec(strip(raw));
      if (m) items.push({ q: inline(m[1]), a: inline(m[2]) });
      else items.push({ q: inline(raw), a: '' });
    }
    slide.items = items;
    if (layout === 'rows' && meta.badge) slide.badge = meta.badge;
  }

  if (layout === 'pull' && leadQuote) {
    // Pass the rendered quote through whole: `.pull em` styles the accent span
    // wherever it falls, so splitting into quote/emphasis would only drop any
    // text trailing the emphasis (a closing quotation mark).
    slide.quote = inline(leadQuote);
  }

  for (const [kind, text] of closers) {
    // @ts-expect-error - kind is narrowed to 'note' | 'kicker' by construction
    slide[kind] = inline(text);
  }
  return slide;
}

/**
 * @param {string} text
 * @param {ParseOptions} [opts]
 * @returns {Deck}
 */
export function parseQuire(text, opts = {}) {
  const { docMeta, chunks } = splitSlides(text);
  const slides = chunks.map((c, i) => buildSlide(c, i === 0, opts));
  const theme = String(docMeta.theme || '').toLowerCase();
  return {
    title: docMeta.title || 'Presentation',
    ...(THEMES.has(theme) ? { theme: /** @type {'light' | 'dark'} */ (theme) } : {}),
    slides,
  };
}

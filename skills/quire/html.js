// @ts-check

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_ELEMENTS = new Set(['iframe', 'noembed', 'noframes', 'script', 'style', 'xmp']);
const RCDATA_ELEMENTS = new Set(['textarea', 'title']);

/**
 * @typedef {Object} HtmlTag
 * @property {number} end
 * @property {string} name
 * @property {boolean} closing
 * @property {boolean} selfClosing
 * @property {boolean} special
 */

/**
 * Read one HTML tag or comment, respecting quotes in attributes.
 *
 * @param {string} text
 * @param {number} start
 * @returns {HtmlTag | null}
 */
function readTag(text, start) {
  if (text[start] !== '<') return null;
  if (text.startsWith('<!--', start)) {
    const close = text.indexOf('-->', start + 4);
    return {
      end: close < 0 ? text.length : close + 3,
      name: '',
      closing: false,
      selfClosing: true,
      special: true,
    };
  }

  const lead = text.slice(start).match(/^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)\b/);
  if (!lead) {
    if (!/^<\s*[!?]/.test(text.slice(start))) return null;
  }

  let quote = '';
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      const raw = text.slice(start, i + 1);
      return {
        end: i + 1,
        name: lead ? lead[2].toLowerCase() : '',
        closing: Boolean(lead?.[1]),
        selfClosing: /\/\s*>$/.test(raw),
        special: !lead,
      };
    }
  }
  return null;
}

/**
 * Find the end of a complete element, including nested elements with the same
 * name. Returns the opening tag's end when it has no matching close.
 *
 * @param {string} text
 * @param {HtmlTag} opening
 * @returns {number}
 */
function elementEnd(text, opening) {
  if (opening.special || opening.closing || opening.selfClosing || VOID_ELEMENTS.has(opening.name)) {
    return opening.end;
  }

  if (opening.name === 'plaintext') return text.length;
  if (RAW_TEXT_ELEMENTS.has(opening.name) || RCDATA_ELEMENTS.has(opening.name)) {
    const close = new RegExp(`<\\/\\s*${opening.name}\\s*>`, 'ig');
    close.lastIndex = opening.end;
    const match = close.exec(text);
    return match ? match.index + match[0].length : text.length;
  }

  let depth = 1;
  let cursor = opening.end;
  while (cursor < text.length) {
    const next = text.indexOf('<', cursor);
    if (next < 0) break;
    const tag = readTag(text, next);
    if (!tag) {
      cursor = next + 1;
      continue;
    }
    cursor = tag.end;
    if (
      !tag.special &&
      !tag.closing &&
      (tag.name === 'plaintext' || RAW_TEXT_ELEMENTS.has(tag.name) || RCDATA_ELEMENTS.has(tag.name))
    ) {
      cursor = elementEnd(text, tag);
      continue;
    }
    if (tag.special || tag.name !== opening.name) continue;
    if (tag.closing) {
      depth -= 1;
      if (depth === 0) return tag.end;
    } else if (!tag.selfClosing && !VOID_ELEMENTS.has(tag.name)) {
      depth += 1;
    }
  }
  // An omitted closing tag is valid for several HTML elements. Once raw HTML
  // begins, preserve the remainder rather than guessing where browser parsing
  // would implicitly close it.
  return text.length;
}

/**
 * @typedef {{type: 'plain' | 'html', value: string}} HtmlSegment
 */

/**
 * @typedef {{type: 'plain' | 'html' | 'code', value: string}} InlineSegment
 */

/**
 * Split text into plain-text and raw HTML regions, preserving every region byte
 * for byte, including attributes, comments, scripts, and nested elements.
 *
 * @param {string} text
 * @returns {HtmlSegment[]}
 */
export function splitHtml(text) {
  /** @type {HtmlSegment[]} */
  const segments = [];
  let plainStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const next = text.indexOf('<', cursor);
    if (next < 0) break;
    const tag = readTag(text, next);
    if (!tag) {
      cursor = next + 1;
      continue;
    }
    segments.push({ type: 'plain', value: text.slice(plainStart, next) });
    const end = elementEnd(text, tag);
    segments.push({ type: 'html', value: text.slice(next, end) });
    cursor = end;
    plainStart = end;
  }

  segments.push({ type: 'plain', value: text.slice(plainStart) });
  return segments;
}

/**
 * Split inline content with code spans taking precedence over raw HTML. This
 * keeps tag-shaped examples inside backticks from becoming raw HTML regions.
 *
 * @param {string} text
 * @returns {InlineSegment[]}
 */
export function splitHtmlAndCode(text) {
  /** @type {InlineSegment[]} */
  const segments = [];
  let plainStart = 0;
  let cursor = 0;

  while (cursor < text.length) {
    const nextHtml = text.indexOf('<', cursor);
    const nextCode = text.indexOf('`', cursor);
    if (nextHtml < 0 && nextCode < 0) break;
    if (nextCode >= 0 && (nextHtml < 0 || nextCode < nextHtml)) {
      const close = text.indexOf('`', nextCode + 1);
      if (close >= 0 && !text.slice(nextCode + 1, close).includes('\n')) {
        segments.push({ type: 'plain', value: text.slice(plainStart, nextCode) });
        segments.push({ type: 'code', value: text.slice(nextCode + 1, close) });
        cursor = close + 1;
        plainStart = cursor;
        continue;
      }
      cursor = nextCode + 1;
      continue;
    }

    const tag = readTag(text, nextHtml);
    if (!tag) {
      cursor = nextHtml + 1;
      continue;
    }
    segments.push({ type: 'plain', value: text.slice(plainStart, nextHtml) });
    const end = elementEnd(text, tag);
    segments.push({ type: 'html', value: text.slice(nextHtml, end) });
    cursor = end;
    plainStart = end;
  }

  segments.push({ type: 'plain', value: text.slice(plainStart) });
  return segments;
}

/**
 * Find fenced code ranges with raw HTML taking precedence outside a fence and
 * fence contents taking precedence once a fence opens.
 *
 * @param {string} text
 * @returns {{start: number, end: number}[]}
 */
export function fencedCodeRanges(text) {
  const ranges = [];
  const fence = /^([ \t]*)(`{3,})/gm;
  let cursor = 0;

  while (cursor < text.length) {
    fence.lastIndex = cursor;
    const nextFence = fence.exec(text);
    const nextHtml = text.indexOf('<', cursor);
    if (!nextFence && nextHtml < 0) break;

    if (nextHtml >= 0 && (!nextFence || nextHtml < nextFence.index)) {
      const tag = readTag(text, nextHtml);
      cursor = tag ? elementEnd(text, tag) : nextHtml + 1;
      continue;
    }
    if (!nextFence) break;

    const start = nextFence.index;
    const openingLength = nextFence[2].length;
    const openingEnd = text.indexOf('\n', start);
    if (openingEnd < 0) {
      ranges.push({ start, end: text.length });
      break;
    }
    const closing = new RegExp(`^[ \\t]*\`{${openingLength},}[ \\t]*$`, 'gm');
    closing.lastIndex = openingEnd + 1;
    const match = closing.exec(text);
    const end = match ? match.index + match[0].length : text.length;
    ranges.push({ start, end });
    cursor = end;
  }

  return ranges;
}

/**
 * Return actual opening tags while ignoring attributes, comments, and tag-like
 * text inside raw-text elements.
 *
 * @param {string} text
 * @returns {{name: string, index: number}[]}
 */
export function htmlOpeningTags(text) {
  const tags = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = text.indexOf('<', cursor);
    if (next < 0) break;
    const tag = readTag(text, next);
    if (!tag) {
      cursor = next + 1;
      continue;
    }
    cursor = tag.end;
    if (tag.special || tag.closing) continue;
    tags.push({ name: tag.name, index: next });
    if (tag.name === 'plaintext' || RAW_TEXT_ELEMENTS.has(tag.name) || RCDATA_ELEMENTS.has(tag.name)) {
      cursor = elementEnd(text, tag);
    }
  }
  return tags;
}

/**
 * Transform plain-text regions while preserving raw HTML regions byte for
 * byte, including attributes, comments, scripts, and nested elements.
 *
 * @param {string} text
 * @param {(plain: string) => string} transform
 * @returns {string}
 */
export function mapOutsideHtml(text, transform) {
  return splitHtml(text)
    .map((segment) => (segment.type === 'plain' ? transform(segment.value) : segment.value))
    .join('');
}

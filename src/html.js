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

  const lead = text.slice(start).match(/^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/);
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
 * Transform plain-text regions while preserving raw HTML regions byte for
 * byte, including attributes, comments, scripts, and nested elements.
 *
 * @param {string} text
 * @param {(plain: string) => string} transform
 * @returns {string}
 */
export function mapOutsideHtml(text, transform) {
  let out = '';
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
    out += transform(text.slice(plainStart, next));
    const end = elementEnd(text, tag);
    out += text.slice(next, end);
    cursor = end;
    plainStart = end;
  }

  return out + transform(text.slice(plainStart));
}

// @ts-check

import { parseQuire } from './deck.js';
import { fencedCodeRanges, htmlOpeningTags, splitHtmlAndCode } from './html.js';

const SEP = /^-{3,}\s*$/;
const META = /^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/;
const SETTING_HEADING = /^#+\s*(eyebrow|layout|hidden|numbered|badge|image|image-alt|image-position|image-fit|caption|credit|chart|diagram|source|tone|align):\s*(.*)$/i;
/** @type {Record<string, {replacement: string, consequence?: string}>} */
const NATIVE_EQUIV = {
  a: { replacement: '[label](URL)' },
  b: { replacement: '**bold**' },
  strong: { replacement: '**bold**' },
  i: { replacement: '*italic*' },
  em: { replacement: '*italic*' },
  code: { replacement: '`code`' },
  h1: {
    replacement: '# Title heading',
    consequence: 'raw headings do not create native title headings or affect layout selection',
  },
  h2: {
    replacement: '## Slide heading',
    consequence: 'raw headings do not create native slide headings or affect layout selection',
  },
  h3: {
    replacement: '### Card heading',
    consequence: 'raw headings do not create cards or affect layout selection',
  },
  ul: {
    replacement: '- rows',
    consequence: 'raw lists do not create rows or diagram nodes',
  },
  ol: {
    replacement: '1. rows',
    consequence: 'raw lists do not create rows or diagram nodes',
  },
  li: {
    replacement: '- or 1. row syntax',
    consequence: 'raw list items do not create rows or diagram nodes',
  },
  table: {
    replacement: 'a pipe table',
    consequence: 'raw tables do not create Quire tables or chart data',
  },
  thead: {
    replacement: 'a pipe table',
    consequence: 'raw table sections do not create Quire tables or chart data',
  },
  tbody: {
    replacement: 'a pipe table',
    consequence: 'raw table sections do not create Quire tables or chart data',
  },
  tr: {
    replacement: 'a pipe table row',
    consequence: 'raw table rows do not create Quire tables or chart data',
  },
  th: {
    replacement: 'a pipe table header',
    consequence: 'raw table headers do not create Quire tables or chart data',
  },
  td: {
    replacement: 'a pipe table cell',
    consequence: 'raw table cells do not create Quire tables or chart data',
  },
  blockquote: {
    replacement: '> quote syntax',
    consequence: 'raw blockquotes do not create pull quotes, notes, or kickers',
  },
  pre: {
    replacement: 'a ``` fenced code block',
    consequence: 'raw preformatted blocks do not create Quire code blocks',
  },
  img: {
    replacement: 'an image: setting with assets add',
    consequence: 'raw images bypass packaged assets and asset validation',
  },
};

/** @param {string} value */
const strip = (value) => value.replace(/^\s+|\s+$/g, '');

/** @param {string} text */
function maskFencedCode(text) {
  let cursor = 0;
  let masked = '';
  for (const range of fencedCodeRanges(text)) {
    masked += text.slice(cursor, range.start);
    masked += text.slice(range.start, range.end).replace(/[^\n]/g, ' ');
    cursor = range.end;
  }
  return masked + text.slice(cursor);
}

/** @param {string[]} lines */
function hasContent(lines) {
  return lines.some((line) => strip(line));
}

/** @param {string[]} lines */
function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !strip(lines[start])) start += 1;
  while (end > start && !strip(lines[end - 1])) end -= 1;
  return lines.slice(start, end);
}

/** @param {string} source */
function sourceTitle(source) {
  const match = source.match(/^\s*#{1,2}\s+(.+?)\s*$/m);
  return match ? strip(match[1]) : '(untitled)';
}

/**
 * Parse source without interpreting slide contents. This layer owns boundaries
 * and metadata while the canonical parser owns Quire semantics.
 *
 * @param {string} markdown
 */
export function parseQuireSource(markdown) {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  let first = 0;
  while (first < lines.length && !strip(lines[first])) first += 1;

  let contentStart = 0;
  /** @type {string[]} */
  let metadataLines = [];
  let hasFrontMatter = false;
  if (first < lines.length && SEP.test(lines[first])) {
    for (let index = first + 1; index < lines.length; index += 1) {
      if (!SEP.test(lines[index])) continue;
      hasFrontMatter = true;
      metadataLines = lines.slice(first + 1, index);
      contentStart = index + 1;
      break;
    }
  }

  /** @type {{source: string, line: number}[]} */
  const slides = [];
  let chunkStart = contentStart;
  const fenced = fencedCodeRanges(normalized);
  let fenceIndex = 0;
  let offset = lines.slice(0, contentStart).reduce((length, line) => length + line.length + 1, 0);
  const pushChunk = (/** @type {number} */ end) => {
    const chunk = lines.slice(chunkStart, end);
    if (!hasContent(chunk)) return;
    const leading = chunk.findIndex((line) => strip(line));
    slides.push({
      source: trimBlankLines(chunk).join('\n'),
      line: chunkStart + Math.max(leading, 0) + 1,
    });
  };

  for (let index = contentStart; index < lines.length; index += 1) {
    while (fenced[fenceIndex] && fenced[fenceIndex].end < offset) fenceIndex += 1;
    const inFence = Boolean(fenced[fenceIndex] && fenced[fenceIndex].start <= offset && offset <= fenced[fenceIndex].end);
    if (!inFence && SEP.test(lines[index])) {
      pushChunk(index);
      chunkStart = index + 1;
    }
    offset += lines[index].length + 1;
  }
  pushChunk(lines.length);

  /** @type {Record<string, string>} */
  const metadata = {};
  for (const line of metadataLines) {
    const match = META.exec(strip(line));
    if (match) metadata[match[1]] = strip(match[2]);
  }

  return { normalized, hasFrontMatter, metadataLines, metadata, slides };
}

/** @param {{metadataLines: string[], slides: {source: string}[]} } document */
export function serializeQuireSource(document) {
  const body = document.slides
    .map((slide) => trimBlankLines(slide.source.split('\n')).join('\n'))
    .filter(Boolean)
    .join('\n\n---\n\n');
  const metadata = trimBlankLines(document.metadataLines);
  const frontMatter = metadata.length ? `---\n${metadata.join('\n')}\n---\n\n` : '';
  return `${frontMatter}${body}\n`;
}

/**
 * @param {string} markdown
 * @returns {{
 *   deck: import('./deck.js').Deck,
 *   source: ReturnType<typeof parseQuireSource>,
 *   warnings: string[]
 * }}
 */
export function readQuireSource(markdown) {
  const source = parseQuireSource(markdown);
  if (source.slides.length === 0) throw new Error('a Quire deck must contain at least one slide');
  if (source.metadata.theme && !/^(?:light|dark)$/i.test(source.metadata.theme)) {
    throw new Error(`document metadata theme must be light or dark, got ${source.metadata.theme}`);
  }

  return { deck: parseQuire(markdown), source, warnings: nativeEquivalentHtmlErrors(source) };
}

/**
 * @param {string} markdown
 * @returns {ReturnType<typeof readQuireSource>}
 */
export function validateQuireSource(markdown) {
  const parsed = readQuireSource(markdown);
  if (parsed.warnings.length) {
    throw new Error(`raw HTML has native Quire equivalents:\n${parsed.warnings.join('\n')}`);
  }
  return parsed;
}

/** @param {ReturnType<typeof parseQuireSource>} source */
function nativeEquivalentHtmlErrors(source) {
  /** @type {string[]} */
  const errors = [];
  for (const [index, slide] of source.slides.entries()) {
    const text = maskFencedCode(slide.source);
    let offset = 0;
    for (const segment of splitHtmlAndCode(text)) {
      if (segment.type === 'html') {
        for (const tag of htmlOpeningTags(segment.value)) {
          const native = NATIVE_EQUIV[tag.name];
          if (!native) continue;
          const absoluteIndex = offset + tag.index;
          const lineOffset = text.slice(0, absoluteIndex).split('\n').length - 1;
          const consequence = native.consequence ? `\n  (${native.consequence})` : '';
          errors.push(
            `slide ${index + 1}, line ${slide.line + lineOffset}: raw <${tag.name}> tag — use ${native.replacement} instead${consequence}`,
          );
        }
      }
      offset += segment.type === 'code' ? segment.value.length + 2 : segment.value.length;
    }
  }
  return errors;
}

/** @param {string} markdown */
export function sourceWarnings(markdown) {
  const source = parseQuireSource(markdown);
  /** @type {string[]} */
  const warnings = [];
  for (const [index, slide] of source.slides.entries()) {
    let contentSeen = false;
    const fenced = fencedCodeRanges(slide.source);
    let fenceIndex = 0;
    let offset = 0;
    for (const [lineIndex, line] of slide.source.split('\n').entries()) {
      const text = strip(line);
      while (fenced[fenceIndex] && fenced[fenceIndex].end < offset) fenceIndex += 1;
      const inFence = Boolean(fenced[fenceIndex] && fenced[fenceIndex].start <= offset && offset <= fenced[fenceIndex].end);
      if (inFence) {
        contentSeen = true;
        offset += line.length + 1;
        continue;
      }
      if (!text) {
        offset += line.length + 1;
        continue;
      }
      const setting = SETTING_HEADING.exec(text);
      if (setting && contentSeen) {
        warnings.push(
          `slide ${index + 1}, line ${slide.line + lineIndex}: heading looks like misplaced ${setting[1]} setting`,
        );
      }
      if (!setting) contentSeen = true;
      offset += line.length + 1;
    }
  }
  return warnings;
}

/** @param {string} markdown */
export function listSlides(markdown) {
  const { deck, source } = readQuireSource(markdown);
  return source.slides.map((slide, index) => ({
    number: index + 1,
    title: sourceTitle(slide.source),
    layout: deck.slides[index]?.layout || 'blank',
    line: slide.line,
  }));
}

/**
 * Resolve a one-based number or exact source heading. Duplicate exact headings
 * are rejected so a mutation never guesses.
 *
 * @param {string} markdown
 * @param {string} selector
 */
export function resolveSlide(markdown, selector) {
  const slides = listSlides(markdown);
  if (/^[1-9]\d*$/.test(selector)) {
    const index = Number(selector) - 1;
    if (!slides[index]) throw new Error(`slide ${selector} does not exist`);
    return { index, slide: slides[index] };
  }
  const matches = slides.filter((slide) => slide.title === selector);
  if (matches.length === 0) throw new Error(`no slide has the exact title "${selector}"`);
  if (matches.length > 1) throw new Error(`multiple slides have the exact title "${selector}"; use a slide number`);
  return { index: matches[0].number - 1, slide: matches[0] };
}

/** @param {string} fragment */
export function validateSlideFragment(fragment) {
  let normalized = fragment.replace(/\r\n?/g, '\n');
  const lines = trimBlankLines(normalized.split('\n'));
  if (lines.length && SEP.test(lines[0])) lines.shift();
  normalized = trimBlankLines(lines).join('\n');
  const parsed = parseQuireSource(normalized);
  if (parsed.hasFrontMatter || parsed.slides.length !== 1) {
    throw new Error('a slide input must contain exactly one slide and no document metadata');
  }
  // A fragment may be inserted anywhere, so validate it as a non-title slide.
  // The complete deck is validated again after insertion/replacement, which
  // applies the first-slide rules if this fragment becomes slide one.
  parseQuire(`# Validation\n\n---\n\n${normalized}`);
  return parsed.slides[0].source;
}

/**
 * @param {string} markdown
 * @param {number} position one-based insertion position
 * @param {string} fragment
 */
export function insertSlide(markdown, position, fragment) {
  const document = parseQuireSource(markdown);
  if (!Number.isInteger(position) || position < 1 || position > document.slides.length + 1) {
    throw new Error(`insert position must be between 1 and ${document.slides.length + 1}`);
  }
  document.slides.splice(position - 1, 0, { source: validateSlideFragment(fragment), line: 0 });
  const result = serializeQuireSource(document);
  validateQuireSource(result);
  return result;
}

/** @param {string} markdown @param {string} selector @param {string} fragment */
export function replaceSlide(markdown, selector, fragment) {
  const { index } = resolveSlide(markdown, selector);
  const document = parseQuireSource(markdown);
  document.slides[index] = { source: validateSlideFragment(fragment), line: document.slides[index].line };
  const result = serializeQuireSource(document);
  validateQuireSource(result);
  return result;
}

/** @param {string} markdown @param {string} selector @param {number} position */
export function moveSlide(markdown, selector, position) {
  const { index } = resolveSlide(markdown, selector);
  const document = parseQuireSource(markdown);
  if (!Number.isInteger(position) || position < 1 || position > document.slides.length) {
    throw new Error(`move position must be between 1 and ${document.slides.length}`);
  }
  const [slide] = document.slides.splice(index, 1);
  document.slides.splice(position - 1, 0, slide);
  const result = serializeQuireSource(document);
  validateQuireSource(result);
  return result;
}

/** @param {string} markdown @param {string} selector */
export function removeSlide(markdown, selector) {
  const { index } = resolveSlide(markdown, selector);
  const document = parseQuireSource(markdown);
  if (document.slides.length === 1) throw new Error('cannot remove the only slide in a deck');
  document.slides.splice(index, 1);
  const result = serializeQuireSource(document);
  validateQuireSource(result);
  return result;
}

/** @param {string} markdown @param {string} selector */
export function readSlide(markdown, selector) {
  const { index } = resolveSlide(markdown, selector);
  return `${parseQuireSource(markdown).slides[index].source}\n`;
}

/**
 * @param {string} markdown
 * @param {string} key
 * @param {string | undefined} value undefined removes the key
 */
export function setDocumentMetadata(markdown, key, value) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key)) throw new Error(`invalid metadata key: ${key}`);
  if (key.toLowerCase() === 'theme' && value !== undefined && !/^(?:light|dark)$/i.test(value)) {
    throw new Error('theme must be light or dark');
  }
  const document = parseQuireSource(markdown);
  const target = key.toLowerCase();
  let replaced = false;
  document.metadataLines = document.metadataLines.filter((line) => {
    const match = META.exec(strip(line));
    if (!match || match[1].toLowerCase() !== target) return true;
    if (!replaced && value !== undefined) {
      replaced = true;
      return true;
    }
    return false;
  });
  if (value !== undefined) {
    const next = `${key}: ${value}`;
    const index = document.metadataLines.findIndex((line) => {
      const match = META.exec(strip(line));
      return match?.[1].toLowerCase() === target;
    });
    if (index >= 0) document.metadataLines[index] = next;
    else document.metadataLines.push(next);
  }
  const result = serializeQuireSource(document);
  validateQuireSource(result);
  return result;
}

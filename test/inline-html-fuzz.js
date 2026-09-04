// @ts-check

import { inline, parseQuire } from '../src/deck.js';
import { parseQuireSource, validateQuireSource } from '../skills/quire/source.js';

/** @type {Record<string, {replacement: string, consequence?: string}>} */
const forbidden = {
  a: { replacement: '[label](URL)' },
  b: { replacement: '**bold**' },
  strong: { replacement: '**bold**' },
  i: { replacement: '*italic*' },
  em: { replacement: '*italic*' },
  code: { replacement: '`code`' },
  h1: { replacement: '# Title heading', consequence: 'raw headings do not create native title headings' },
  h2: { replacement: '## Slide heading', consequence: 'raw headings do not create native slide headings' },
  h3: { replacement: '### Card heading', consequence: 'raw headings do not create cards' },
  ul: { replacement: '- rows', consequence: 'raw lists do not create rows or diagram nodes' },
  ol: { replacement: '1. rows', consequence: 'raw lists do not create rows or diagram nodes' },
  li: { replacement: '- or 1. row syntax', consequence: 'raw list items do not create rows or diagram nodes' },
  table: { replacement: 'a pipe table', consequence: 'raw tables do not create Quire tables or chart data' },
  thead: { replacement: 'a pipe table', consequence: 'raw table sections do not create Quire tables or chart data' },
  tbody: { replacement: 'a pipe table', consequence: 'raw table sections do not create Quire tables or chart data' },
  tr: { replacement: 'a pipe table row', consequence: 'raw table rows do not create Quire tables or chart data' },
  th: { replacement: 'a pipe table header', consequence: 'raw table headers do not create Quire tables or chart data' },
  td: { replacement: 'a pipe table cell', consequence: 'raw table cells do not create Quire tables or chart data' },
  blockquote: { replacement: '> quote syntax', consequence: 'raw blockquotes do not create pull quotes, notes, or kickers' },
  pre: { replacement: 'a ``` fenced code block', consequence: 'raw preformatted blocks do not create Quire code blocks' },
  img: { replacement: 'an image: setting with assets add', consequence: 'raw images bypass packaged assets and asset validation' },
};
const allowed = [
  '<br>',
  '<span>x</span>',
  '<div>x</div>',
  '<sup>2</sup>',
  '<sub>2</sub>',
  '<svg><path></path></svg>',
  '<small>x</small>',
  '<mark>x</mark>',
];
let checked = 0;

/** @param {string} source */
function validationError(source) {
  try {
    validateQuireSource(`# Fuzz\n\n${source}`);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

for (const [tag, native] of Object.entries(forbidden)) {
  const openings = [`<${tag}>`, `<${tag.toUpperCase()} class="x">`, `<${tag}\n data-x="1">`];
  for (const opening of openings) {
    for (const source of [
      `${opening}value</${tag}>`,
      `<span>${opening}value</${tag}></span>`,
      `<span title="\`"></span>${opening}value</${tag}><span title="\`"></span>`,
    ]) {
      checked += 1;
      const error = validationError(source);
      if (!error.includes(`raw <${tag}> tag — use ${native.replacement} instead`)) {
        throw new Error(`missed forbidden HTML in ${JSON.stringify(source)}: ${error || 'validation passed'}`);
      }
      if (native.consequence && !error.includes(`(${native.consequence}`)) {
        throw new Error(`missing consequence for ${JSON.stringify(source)}: ${error}`);
      }
    }
  }

  for (const source of [
    `\`<${tag}>value</${tag}>\``,
    `2 < ${tag}> 1`,
    `<!-- <${tag}>value</${tag}> -->`,
    `<span title="<${tag}>value</${tag}>">safe</span>`,
    `<script>const sample = "<${tag}>value</${tag}>";</script>`,
    `<textarea><${tag}>value</${tag}></textarea>`,
  ]) {
    checked += 1;
    const error = validationError(source);
    if (error) throw new Error(`false positive for ${JSON.stringify(source)}: ${error}`);
  }

  for (const fenceLength of [3, 4, 5]) {
    const fence = '`'.repeat(fenceLength);
    const shorter = fenceLength === 3 ? '```still-code' : '`'.repeat(fenceLength - 1);
    const source = `${fence}html\n${shorter}\n---\n<${tag}>value</${tag}>\n${fence}`;
    checked += 1;
    const error = validationError(source);
    if (error) throw new Error(`fence length ${fenceLength} leaked ${tag}: ${error}`);
  }
}

for (const raw of allowed) {
  checked += 1;
  const rendered = inline(`**bold with ${raw} inside**`);
  if (rendered !== `<strong>bold with ${raw} inside</strong>`) {
    throw new Error(`emphasis did not span ${JSON.stringify(raw)}: ${JSON.stringify(rendered)}`);
  }
  const error = validationError(raw);
  if (error) throw new Error(`allowed HTML failed validation for ${JSON.stringify(raw)}: ${error}`);
}

for (const raw of [
  '<div title="\n```">content</div>',
  '<!--\n```\n-->',
  '<script>\n```\n</script>',
]) {
  const source = `# One\n\n${raw}\n\n---\n\n## Two`;
  checked += 1;
  if (parseQuireSource(source).slides.length !== 2 || parseQuire(source).slides.length !== 2) {
    throw new Error(`fence-like raw HTML collapsed a slide boundary: ${JSON.stringify(raw)}`);
  }
}

console.log(`PASS  inline HTML fuzz  ${checked} generated boundary cases`);

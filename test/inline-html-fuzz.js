// @ts-check

import { inline, parseQuire } from '../src/deck.js';
import { parseQuireSource, validateQuireSource } from '../skills/quire/source.js';

const forbidden = {
  a: '[label](URL)',
  b: '**bold**',
  strong: '**bold**',
  i: '*italic*',
  em: '*italic*',
  code: '`code`',
};
const allowed = ['<br>', '<span>x</span>', '<sup>2</sup>', '<img src="x">', '<svg><path></path></svg>'];
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

for (const [tag, replacement] of Object.entries(forbidden)) {
  const openings = [`<${tag}>`, `<${tag.toUpperCase()} class="x">`, `<${tag}\n data-x="1">`];
  for (const opening of openings) {
    for (const source of [
      `${opening}value</${tag}>`,
      `<span>${opening}value</${tag}></span>`,
      `<span title="\`"></span>${opening}value</${tag}><span title="\`"></span>`,
    ]) {
      checked += 1;
      const error = validationError(source);
      if (!error.includes(`raw <${tag}> tag — use ${replacement} instead`)) {
        throw new Error(`missed forbidden HTML in ${JSON.stringify(source)}: ${error || 'validation passed'}`);
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

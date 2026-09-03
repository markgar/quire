// @ts-check

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseQuire } from '../src/deck.js';
import { renderSlides } from '../src/render.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const workspace = mkdtempSync(join(tmpdir(), 'quire-skill-eval-'));
const deckPath = join(workspace, 'deck.md');
const keep = process.env.QUIRE_SKILL_TEST_KEEP === '1';

const prompt = [
  'Use the /quire skill to create deck.md in the current directory.',
  'Do not inspect any repository outside this temporary project and do not explain your work.',
  '',
  'Create an eleven-slide presentation titled "Project Lantern" for an internal product strategy review:',
  '1. A centered, contrast-tone title slide with a short framing line.',
  '2. Three numbered cards describing the customer, problem, and opportunity; emphasize the opportunity.',
  '3. Two labelled groups, each containing two cards, comparing what we will do and what we will not do.',
  '4. At least three question-and-answer rows with a badge.',
  '5. A three-column comparison table with at least two data rows.',
  '6. A standard slide with two cards, a takeaway note, and an aside kicker.',
  '7. A closing pull quote with a short heading or attribution after the quote.',
  '8. A metrics slide with three values and labels, using accent tone.',
  '9. A bar chart from a two-column table, with a source link.',
  '10. A three-step process diagram.',
  '11. A right-positioned image slide with two cards. Create a nearby lantern.svg asset and reference it with a relative path and useful alt text.',
  '',
  'Use only Quire source. Do not use raw HTML.',
].join('\n');

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{timeout?: number}} [opts]
 */
function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: workspace,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: opts.timeout,
    env: { ...process.env, NO_COLOR: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} exited ${result.status}${output ? `\n${output}` : ''}`);
  }
  return result.stdout;
}

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  run('git', ['init', '--quiet']);
  run('gh', [
    'skill',
    'install',
    root,
    'quire',
    '--from-local',
    '--agent',
    'github-copilot',
    '--scope',
    'project',
    '--force',
  ]);

  const installed = join(workspace, '.agents', 'skills', 'quire', 'SKILL.md');
  assert(existsSync(installed), 'gh skill install did not create the project skill');

  const args = [
    '--prompt',
    prompt,
    '--allow-all-tools',
    '--no-ask-user',
    '--no-auto-update',
    '--no-custom-instructions',
    '--disable-builtin-mcps',
    '--silent',
  ];
  if (process.env.QUIRE_SKILL_TEST_MODEL) {
    args.push('--model', process.env.QUIRE_SKILL_TEST_MODEL);
  }

  run('copilot', args, { timeout: Number(process.env.QUIRE_SKILL_TEST_TIMEOUT_MS || 300000) });
  assert(existsSync(deckPath), 'the fresh agent did not create deck.md');

  const source = readFileSync(deckPath, 'utf8');
  const deck = parseQuire(source);
  const [title, cards, groups, rows, table, closers, pull, metrics, chart, diagram, media] = deck.slides;
  const cardList = cards?.cards || [];
  const groupList = groups?.groups || [];
  const rowItems = rows?.items || [];
  const tableRows = table?.rows || [];

  assert(deck.title === 'Project Lantern', `expected document title "Project Lantern", got "${deck.title}"`);
  assert(deck.slides.length === 11, `expected 11 slides, got ${deck.slides.length}`);
  assert(title?.layout === 'title' && title.headline && title.lede, 'slide 1 needs a headline and framing line');
  assert(title.tone === 'contrast' && title.align === 'center', 'slide 1 needs contrast tone and centered alignment');
  assert(cardList.length === 3, 'slide 2 does not contain exactly three cards');
  assert(cardList.every((card) => card.h && card.p), 'slide 2 contains an empty card');
  assert(cardList.filter((card) => card.accent).length === 1, 'slide 2 must contain one accent card');
  assert(cards?.numbered, 'slide 2 does not enable numbered cards');
  assert(
    cardList.every((card) => !/^\d+[.)]\s/.test(card.h)),
    'slide 2 manually numbers headings that Quire already numbers',
  );
  assert(groupList.length === 2, 'slide 3 does not contain two labelled groups');
  assert(groupList.every((group) => group.cards.length === 2), 'each group on slide 3 must contain two cards');
  assert(rows?.layout === 'rows', 'slide 4 is not a rows slide');
  assert(rowItems.length >= 3 && rows.badge, 'slide 4 needs a badge and at least three rows');
  assert(rowItems.every((item) => item.q && item.a), 'slide 4 contains a row without a question and answer');
  assert(table?.layout === 'table', 'slide 5 is not a table slide');
  assert(table.columns?.length === 3 && tableRows.length >= 2, 'slide 5 needs three columns and two rows');
  assert(tableRows.every((row) => row.length === 3 && row.every(Boolean)), 'slide 5 contains a ragged or empty row');
  assert(closers?.cards?.length === 2, 'slide 6 does not contain two cards');
  assert(closers.note && closers.kicker, 'slide 6 needs both a takeaway note and an aside kicker');
  assert(pull?.layout === 'pull' && pull.quote && pull.title, 'slide 7 needs a pull quote and following heading');
  assert(metrics?.layout === 'metrics' && metrics.cards?.length === 3, 'slide 8 is not a three-value metrics slide');
  assert(metrics.tone === 'accent', 'slide 8 does not use accent tone');
  assert(chart?.layout === 'chart' && chart.chart === 'bar', 'slide 9 is not a bar chart');
  assert(chart.columns?.length === 2 && chart.rows && chart.rows.length >= 2, 'slide 9 needs chart data');
  assert(chart.source?.includes('<a href='), 'slide 9 needs linked source attribution');
  assert(diagram?.layout === 'diagram' && diagram.diagram === 'process', 'slide 10 is not a process diagram');
  assert(diagram.items?.length === 3, 'slide 10 needs exactly three process steps');
  assert(media?.layout === 'media' && media.imagePosition === 'right', 'slide 11 is not a right-positioned media slide');
  assert(media.cards?.length === 2 && media.imageAlt, 'slide 11 needs two cards and image alt text');
  assert(media.image && existsSync(join(workspace, media.image)), 'slide 11 does not reference a nearby image asset');
  assert(!/<[a-z][\s\S]*>/i.test(source), 'the deck used raw HTML despite the prompt');
  renderSlides(deck);
  console.log(`PASS  quire skill  fresh agent created ${deck.slides.length} valid slides`);
} catch (error) {
  console.error(`FAIL  quire skill  ${error instanceof Error ? error.message : String(error)}`);
  console.error(`      preserved workspace: ${workspace}`);
  process.exitCode = 1;
} finally {
  if (!process.exitCode && !keep) {
    rmSync(workspace, { recursive: true, force: true });
  } else if (keep) {
    console.log(`      preserved workspace: ${workspace}`);
  }
}

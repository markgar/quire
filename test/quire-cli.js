// @ts-check

import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const workspace = mkdtempSync(join(tmpdir(), 'quire-cli-'));
const skill = join(workspace, 'quire-skill');
const cli = join(skill, 'quire-package.mjs');
const deck = join(workspace, 'deck.quire');

/** @param {unknown} condition @param {string} message */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * @param {string[]} args
 * @param {{ok?: boolean, input?: string}} [options]
 */
function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    input: options.input,
  });
  const ok = options.ok !== false;
  if ((ok && result.status !== 0) || (!ok && result.status === 0)) {
    throw new Error(
      `quire CLI ${ok ? 'failed' : 'unexpectedly succeeded'}: ${args.join(' ')}\n${result.stdout}${result.stderr}`,
    );
  }
  return result;
}

try {
  cpSync(join(root, 'skills', 'quire'), skill, { recursive: true });

  const created = JSON.parse(run(['create', deck, '--title', 'CLI deck', '--theme', 'dark']).stdout);
  assert(created.slides === 1 && created.assets === 0, 'create did not produce one empty native deck');

  const first = [
    'tone: contrast',
    'align: center',
    '',
    '# A safer deck',
    '',
    'Created without an unpacked working directory.',
  ].join('\n');
  run(['slides', 'replace', deck, '1', '--content', first]);
  run(['metadata', 'set', deck, 'title', 'A safer deck']);

  const cards = [
    'numbered: true',
    '',
    '## Three guarantees',
    '',
    '### Boundaries',
    'Code owns slide boundaries.',
    '',
    '### Validation',
    'Every write parses first.',
    '',
    '### Persistence {accent}',
    'Only the `.quire` file remains.',
  ].join('\n');
  run(['slides', 'insert', deck, '2', '--stdin'], { input: cards });
  const slides = JSON.parse(run(['slides', 'list', deck]).stdout);
  assert(slides.length === 2 && slides[1].title === 'Three guarantees', 'slide insertion or listing failed');

  run(['slides', 'insert', deck, '3', '--content', '## Movable slide\n\nThis slide changes position.']);
  run(['slides', 'move', deck, '3', '2']);
  const moved = run(['slides', 'read', deck, '2']).stdout;
  assert(moved.includes('## Movable slide'), 'slide move did not change the running order');
  run(['slides', 'remove', deck, '2']);

  const beforeInvalid = readFileSync(deck);
  const invalid = [
    'layout: title',
    '',
    '# Invalid title',
    '',
    '> A title slide cannot render this closer.',
  ].join('\n');
  const rejected = run(['slides', 'replace', deck, '2', '--content', invalid], { ok: false });
  assert(rejected.stderr.includes('title layout cannot render quote content'), 'invalid layout error was not reported');
  assert(beforeInvalid.equals(readFileSync(deck)), 'an invalid slide mutation changed the package');

  const image = join(workspace, 'pixel.png');
  writeFileSync(image, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  run(['assets', 'add', deck, image, 'images/pixel.png']);
  const withWarning = JSON.parse(run(['validate', deck]).stdout);
  assert(withWarning.warnings.length === 1, 'an unreferenced asset should be reported as a warning');

  const media = [
    'image: ./images/pixel.png',
    'image-alt: A test pixel',
    '',
    '## Packaged media',
    '',
    'The image lives inside this file.',
  ].join('\n');
  run(['slides', 'insert', deck, '3', '--content', media]);
  const clean = JSON.parse(run(['validate', deck]).stdout);
  assert(clean.valid && clean.slides === 3 && clean.assets === 1 && clean.warnings.length === 0, 'valid package failed');

  const beforeRemove = readFileSync(deck);
  const removeReferenced = run(['assets', 'remove', deck, 'images/pixel.png'], { ok: false });
  assert(removeReferenced.stderr.includes('cannot remove referenced asset'), 'referenced asset removal was not rejected');
  assert(beforeRemove.equals(readFileSync(deck)), 'failed asset removal changed the package');

  run(['slides', 'remove', deck, '3']);
  run(['assets', 'remove', deck, 'images/pixel.png']);
  const inspected = JSON.parse(run(['inspect', deck]).stdout);
  assert(
    inspected.metadata.title === 'A safer deck' && inspected.slides.length === 2 && inspected.assets.length === 0,
    'inspect did not report the final native deck',
  );

  const markdownRejected = run(['validate', join(workspace, 'deck.md')], { ok: false });
  assert(markdownRejected.stderr.includes('expected a .quire file'), 'the authoring CLI accepted a loose Markdown deck');

  const importedSource = join(workspace, 'import.md');
  const importedDeck = join(workspace, 'imported.quire');
  writeFileSync(importedSource, [
    '---',
    'title: Imported',
    '---',
    '',
    'image: ./pixel.png',
    '',
    '# Imported',
  ].join('\n'));
  run(['import', importedSource, importedDeck]);
  const imported = JSON.parse(run(['validate', importedDeck]).stdout);
  assert(imported.slides === 1 && imported.assets === 1, 'Markdown import did not package its relative asset');

  const fit = JSON.parse(run(['fit', deck]).stdout);
  assert(fit.slides === 2 && fit.overflowing === 0, 'a compact deck failed the browser fit check');

  run(['slides', 'replace', deck, '2', '--content', '## Settings typo\n\n# hidden: true']);
  const settingWarning = JSON.parse(run(['validate', deck]).stdout);
  assert(
    settingWarning.warnings.some((/** @type {string} */ warning) => warning.includes('misplaced hidden setting')),
    'validate did not warn about a setting-like heading after slide content',
  );
  run(['slides', 'replace', deck, '2', '--content', '## Documented setting\n\n```\n# hidden: true\n```']);
  const fencedSetting = JSON.parse(run(['validate', deck]).stdout);
  assert(fencedSetting.warnings.length === 0, 'validate warned about a setting example inside a code fence');
  run(['slides', 'replace', deck, '2', '--stdin'], { input: cards });

  const contactPath = join(workspace, 'contact.png');
  const contact = JSON.parse(run(['render', deck, contactPath, '--columns', '2']).stdout);
  assert(
    contact.mode === 'contact-sheet' &&
      contact.slides === 2 &&
      contact.width === 706 &&
      contact.height === 262 &&
      readFileSync(contactPath).subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    'contact-sheet rendering did not create the expected PNG',
  );
  const slidePath = join(workspace, 'slide.png');
  const slideImage = JSON.parse(run(['render', deck, slidePath, '--slide', 'Three guarantees']).stdout);
  assert(
    slideImage.mode === 'slide' &&
      slideImage.slides === 1 &&
      slideImage.width === 1280 &&
      slideImage.height === 720 &&
      readFileSync(slidePath).subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    'single-slide rendering did not create a full-size PNG',
  );

  const metric = [
    'layout: metrics',
    '',
    '## Metric fitting',
    '',
    '### 953,054 extraordinarily long',
    'Rows processed',
  ].join('\n');
  run(['slides', 'replace', deck, '2', '--content', metric]);
  const metricPath = join(workspace, 'metric.png');
  run(['render', deck, metricPath, '--slide', '2']);
  assert(readFileSync(metricPath).length > 1000, 'metric slide rendering did not create a populated PNG');

  const processSlide = [
    'diagram: process',
    '',
    '## Five phases',
    '',
    '1. **Launch** Leave Earth.',
    '2. **Coast** Cross space.',
    '3. **Orbit** Circle the Moon.',
    '4. **Land** Reach the surface.',
    '5. **Return** Splash down.',
  ].join('\n');
  run(['slides', 'replace', deck, '2', '--content', processSlide]);
  const processFit = JSON.parse(run(['fit', deck]).stdout);
  assert(
    processFit.report[1].wide === 0,
    'process connector pseudo-elements were incorrectly reported as horizontal overflow',
  );

  const wide = '## Deliberately wide\n\n<div style="width: 2000px">Wide content</div>';
  run(['slides', 'replace', deck, '2', '--content', wide]);
  const wideResult = run(['fit', deck], { ok: false });
  const wideReport = JSON.parse(wideResult.stdout);
  assert(
    wideReport.overflowing === 1 && wideReport.report[1].wide > 0,
    'browser fit did not report deliberate horizontal overflow',
  );

  const overflowing = [
    'layout: rows',
    '',
    '## Deliberate overflow',
    '',
    ...Array.from({ length: 30 }, (_, index) => `${index + 1}. **Row ${index + 1}** Deliberately too many rows.`),
  ].join('\n');
  run(['slides', 'replace', deck, '2', '--content', overflowing]);
  const over = run(['fit', deck], { ok: false });
  const overReport = JSON.parse(over.stdout);
  assert(overReport.overflowing === 1, 'browser fit did not report deliberate overflow');

  const large = `## Pipe test\n\n${'content '.repeat(50000)}`;
  run(['slides', 'replace', deck, '2', '--stdin'], { input: large });
  const epipe = spawn(process.execPath, [cli, 'slides', 'read', deck, '2'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  epipe.stdout.once('data', () => epipe.stdout.destroy());
  const epipeStatus = await new Promise((resolve) => epipe.once('close', resolve));
  assert(epipeStatus === 0, 'the CLI did not treat EPIPE as normal output termination');

  console.log('PASS  quire CLI  native mutation, import, fit, PNG rendering, EPIPE, and rollback');
} catch (error) {
  console.error(`FAIL  quire CLI  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

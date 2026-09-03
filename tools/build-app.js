// @ts-check
/**
 * Assemble quire.html: the hosted app.
 *
 * The app reuses the shell's CSS and chrome rather than keeping a second copy,
 * so a style fix lands in both the app and exported decks. Only the parts that
 * differ — an empty stage, a toolbar, and the loader — are defined here.
 *
 * Modules are inlined rather than left as separate files so the app is one
 * artefact to host and one file to cache.
 *
 * Usage: node tools/build-app.js [out.html]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');

const read = (/** @type {string} */ name) => readFileSync(join(src, name), 'utf8');

const shell = read('shell.html');

/**
 * Pull one delimited region out of the shell.
 *
 * @param {string} open
 * @param {string} close
 * @returns {string}
 */
function between(open, close) {
  const a = shell.indexOf(open);
  const b = shell.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error(`could not find ${open} … ${close} in shell.html`);
  return shell.slice(a + open.length, b);
}

const css = between('<style>\n', '</style>');
const themeScript = between('<script>\n', '</script>');
const chrome = between('<body>\n', '<div class="stage"');

/**
 * Strip the module's import lines; everything is inlined into one scope.
 *
 * Also neutralises any closing script tag in the source. The HTML parser scans
 * raw script text for that sequence without caring that it sits inside a
 * string or a comment, so a single occurrence anywhere in these modules would
 * truncate the app. Splitting it across a string concatenation is invisible to
 * the parser and inert to JavaScript.
 */
/**
 * @param {string} name
 * @returns {string}
 */
function inline(name) {
  return read(name)
    .replace(/^import[^;]*;\s*$/gm, '')
    .replace(/^export (function|const|class)/gm, '$1')
    .replace(/^export \{[^}]*\};\s*$/gm, '')
    .replace(/<\/script/gi, "<\\/script");
}

const appCss = `
/* --- app chrome: only present in the hosted app, not in an exported deck --- */
.toolbar {
  position: fixed; top: 12px; right: 14px; z-index: 30;
  display: flex; align-items: center; gap: 10px;
  font-size: 0.78rem;
}
.toolbar button {
  font: inherit; font-weight: 600;
  padding: 6px 12px; border-radius: 0.5rem;
  background: var(--q-panel-strong); color: var(--q-text);
  border: 1px solid var(--q-border); cursor: pointer;
}
.toolbar button:hover { background: var(--q-accent); border-color: var(--q-accent); color: var(--q-accent-fg); }
.toolbar button:focus-visible,
.intro button:focus-visible,
.intro a:focus-visible {
  outline: 3px solid var(--q-accent);
  outline-offset: 3px;
}
#status { color: var(--q-text-muted); max-width: 46ch; text-align: right; }
#status[data-kind="live"]  { color: var(--q-accent); }
#status[data-kind="warn"]  { color: var(--q-text); }
#status[data-kind="error"] { color: var(--q-accent); font-weight: 600; }

/* Overflow badge. Hidden unless something is actually over, so a deck that
   fits shows no editing chrome at all. */
#fitBtn[hidden] { display: none; }
#fitBtn {
  background: var(--q-accent); color: var(--q-accent-fg); border-color: var(--q-accent);
}
#fitBtn:hover { filter: brightness(1.08); }

/* Presenting is not authoring: a projected deck must not show the open button
   or an overflow warning. app-spec.md 7.6. */
:fullscreen .toolbar { display: none; }

/* Panel marks for overflowing slides, so "which ones" is answered without
   stepping through the deck. */
.thumb-over {
  font-size: 0.7rem; font-weight: 700;
  color: var(--q-accent-fg); background: var(--q-accent);
  border-radius: 0.35rem; padding: 1px 6px;
}
.thumb-over[hidden] { display: none; }
.thumb.is-over .thumb-frame { outline: 2px solid var(--q-accent); outline-offset: 1px; }

.drop-hint {
  position: absolute; inset: 0; z-index: 5;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 32px; text-align: center; pointer-events: none;
  color: var(--q-text-muted);
}
/* [hidden] is display:none in the UA sheet, but a later display rule wins.
   Without this the hint bleeds through every rendered slide. */
.drop-hint[hidden] { display: none; }
.drop-hint h1 {
  margin: 0 0 4px;
  color: var(--q-text);
  font-size: 2rem;
  letter-spacing: -0.035em;
}
.drop-hint p { margin: 0; max-width: 52ch; line-height: 1.55; }
.drop-hint .drop-lede {
  color: var(--q-text);
  font-size: 1.05rem;
  font-weight: 650;
  text-wrap: balance;
}
.drop-hint .drop-detail { font-size: 0.92rem; }
.drop-hint .drop-proof {
  margin-top: 6px;
  color: var(--q-text-soft);
  font-size: 0.78rem;
  letter-spacing: 0.035em;
}
body.dragging .stage { outline: 2px dashed var(--q-accent); outline-offset: -10px; }

.intro {
  width: min(1040px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  margin: auto;
  padding: 0;
  overflow: auto;
  color: var(--q-text);
  background: var(--q-bg-elevated);
  border: 1px solid var(--q-border);
  border-radius: 18px;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.3);
}
.intro::backdrop {
  background: rgba(15, 15, 15, 0.7);
}
.intro[open] {
  animation: intro-in 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.intro-inner {
  position: relative;
  padding: clamp(28px, 6vw, 52px);
}
.intro-close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 36px;
  height: 36px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  font-size: 24px;
  line-height: 1;
}
.intro h1 {
  max-width: 14ch;
  margin: 0 44px 14px 0;
  font-size: clamp(2rem, 6vw, 3.25rem);
  line-height: 0.98;
  letter-spacing: -0.035em;
  text-wrap: balance;
}
.intro-lede {
  max-width: 68ch;
  color: var(--q-text-muted);
  font-size: 1.05rem;
  line-height: 1.6;
}
.intro-demo {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) 40px minmax(0, 1.1fr);
  align-items: stretch;
  margin: 30px 0 26px;
}
.intro-pane {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--q-border);
  background: var(--q-surface);
}
.intro-code-pane {
  border-radius: 14px 0 0 14px;
}
.intro-slide-pane {
  display: flex;
  flex-direction: column;
  border-radius: 0 14px 14px 0;
}
.intro-pane-label {
  display: block;
  padding: 9px 13px;
  color: var(--q-text-muted);
  background: var(--q-surface-soft);
  border-bottom: 1px solid var(--q-border);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.intro-code {
  margin: 0;
  padding: 18px;
  overflow: auto;
  color: var(--q-text);
  font: 0.78rem/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
}
.intro-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--q-accent);
  font-size: 1.5rem;
  font-weight: 800;
}
.intro-slide {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 250px;
  padding: 24px;
  background: var(--q-bg-elevated);
}
.intro-slide-label {
  margin-bottom: 14px;
  color: var(--q-accent);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}
.intro-slide h2 {
  margin: 0 0 6px;
  font-size: 1.55rem;
  letter-spacing: -0.025em;
}
.intro-slide-sub {
  margin: 0 0 18px;
  color: var(--q-text-muted);
  font-size: 0.82rem;
}
.intro-slide-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.intro-slide-card {
  padding: 13px;
  background: var(--q-surface-soft);
  border: 1px solid var(--q-border);
  border-radius: 10px;
}
.intro-slide-card.accent {
  background: var(--q-accent-soft);
  border-color: var(--q-accent);
}
.intro-slide-card strong {
  display: block;
  margin-bottom: 5px;
  font-size: 0.75rem;
}
.intro-slide-card span {
  color: var(--q-text-muted);
  font-size: 0.68rem;
  line-height: 1.4;
}
.intro-slide-note {
  margin-top: auto;
  padding-top: 16px;
  color: var(--q-accent);
  font-size: 0.7rem;
  font-weight: 700;
}
.intro-start {
  margin: 0 0 26px;
  padding: 20px;
  border: 1px solid var(--q-border);
  border-radius: 14px;
  background: var(--q-surface-soft);
}
.intro-start-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.intro-start-header h2 {
  margin: 0;
  font-size: 1rem;
}
.intro-start-header span {
  color: var(--q-text-muted);
  font-size: 0.78rem;
}
.intro-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.intro-step {
  position: relative;
  min-width: 0;
  padding: 14px 14px 14px 42px;
  border: 1px solid var(--q-border);
  border-radius: 10px;
  background: var(--q-surface);
}
.intro-step-number {
  position: absolute;
  top: 13px;
  left: 13px;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  color: var(--q-accent);
  background: var(--q-accent-soft);
  border-radius: 50%;
  font-size: 0.68rem;
  font-weight: 800;
}
.intro-step strong {
  display: block;
  margin-bottom: 5px;
  font-size: 0.82rem;
}
.intro-step p {
  margin: 0;
  color: var(--q-text-muted);
  font-size: 0.76rem;
  line-height: 1.45;
}
.intro-agent-prompt {
  display: block;
  margin-top: 8px;
  padding: 9px 10px;
  color: var(--q-text);
  background: var(--q-bg-elevated);
  border: 1px solid var(--q-border);
  border-radius: 7px;
  font: 0.68rem/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: normal;
}
.intro-points {
  margin: 0 0 30px;
  border-top: 1px solid var(--q-border);
}
.intro-point {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) 2fr;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 1px solid var(--q-border);
}
.intro-point dt {
  font-weight: 750;
}
.intro-point dd {
  margin: 0;
  color: var(--q-text-muted);
  line-height: 1.5;
}
.intro-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.intro-primary {
  background: var(--q-accent);
  border-color: var(--q-accent);
  color: var(--q-accent-fg);
}
.intro-source {
  margin-left: auto;
  color: var(--q-link);
  font-size: 0.9rem;
  font-weight: 650;
  text-underline-offset: 3px;
}
@keyframes intro-in {
  from { opacity: 0; transform: translateY(14px) scale(0.985); }
}
@media (max-width: 560px) {
  .intro-demo { grid-template-columns: 1fr; }
  .intro-code-pane { border-radius: 14px 14px 0 0; }
  .intro-slide-pane { border-radius: 0 0 14px 14px; }
  .intro-arrow { min-height: 34px; transform: rotate(90deg); }
  .intro-start-header { display: block; }
  .intro-start-header span { display: block; margin-top: 5px; }
  .intro-steps { grid-template-columns: 1fr; }
  .intro-point { grid-template-columns: 1fr; gap: 4px; }
  .intro-source { width: 100%; margin: 6px 0 0; }
}
@media (prefers-reduced-motion: reduce) {
  .intro[open] { animation: none; }
}
`;

/**
 * Embed the shell as a JavaScript string, so the app can build a
 * single-file runtime and source export without fetching anything.
 *
 * This is the same template the CLI uses, which is the point: an export is
 * then byte-identical to a CLI build of the same Quire source, and goes through
 * `page()` and `readSource()` rather than a second assembly path that would
 * need its own tests.
 *
 * The duplication with the extracted CSS above is real and deliberate. The
 * alternative — deriving the app's own styles from this string at startup —
 * trades a few KB of a cached, well-compressing artefact for a flash of
 * unstyled content and more moving parts at boot.
 */
function embedShell() {
  // JSON.stringify does not escape a forward slash, so a `</script` inside the
  // shell would still close this element. `\/` is a valid JSON string escape
  // and parses back to `/`, leaving the string identical at runtime.
  return JSON.stringify(shell).replace(/<\/script/gi, '<\\/script');
}

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!--
  A deck may contain raw HTML by design, and the app puts it in the DOM, so a
  deck is executable content. script-src therefore cannot be tightened without
  changing the format.

  What *can* be shut are the quiet network channels. connect-src 'self' blocks
  cross-origin fetch and XHR, img-src 'self' data: blocks remote image beacons,
  and form-action 'none' blocks form submission. Top-level navigation remains
  possible: CSP has no widely supported directive that can disable it.

  frame-ancestors is deliberately absent: browsers ignore it in a meta element,
  so it would be console noise pretending to be a control. A host that can set
  response headers should send frame-ancestors 'none' there.
-->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'">
<title>quire</title>
<script>
${themeScript}
</script>
<style>
${css}${appCss}
</style>
</head>
<body>
${chrome}
<div class="toolbar">
  <span id="status">Starting…</span>
  <button id="fitBtn" type="button" hidden>—</button>
  <button id="exportBtn" type="button" hidden>Export</button>
  <button id="aboutBtn" type="button">About</button>
  <button id="openBtn" type="button">Open deck…</button>
</div>

<dialog class="intro" id="introDialog" aria-labelledby="introTitle">
  <div class="intro-inner">
    <button class="intro-close" id="introClose" type="button" aria-label="Close">&times;</button>
    <h1 id="introTitle">100% local.</h1>
    <p class="intro-lede">
      Quire is an agent-native presentation builder that works entirely on your
      machine. Your agent writes Quire source—a focused, Markdown-shaped
      presentation dialect—and your browser opens it directly and presents it
      with plain, inspectable JavaScript.
    </p>
    <div class="intro-demo" aria-label="Quire source becomes a rendered slide">
      <section class="intro-pane intro-code-pane">
        <span class="intro-pane-label">Quire source</span>
        <pre class="intro-code"><code>eyebrow: THE IDEA

## Present from the source
One local text file becomes the deck.

### Your agent
Writes clear, reviewable Quire source.

### Your browser {accent}
Renders and presents it locally.

&gt; **Takeaway:** No upload required.</code></pre>
      </section>
      <div class="intro-arrow" aria-hidden="true">&rarr;</div>
      <section class="intro-pane intro-slide-pane">
        <span class="intro-pane-label">Rendered presentation</span>
        <div class="intro-slide">
          <div class="intro-slide-label">THE IDEA</div>
          <h2>Present from the source</h2>
          <p class="intro-slide-sub">One local text file becomes the deck.</p>
          <div class="intro-slide-cards">
            <div class="intro-slide-card">
              <strong>Your agent</strong>
              <span>Writes clear, reviewable Quire source.</span>
            </div>
            <div class="intro-slide-card accent">
              <strong>Your browser</strong>
              <span>Renders and presents it locally.</span>
            </div>
          </div>
          <div class="intro-slide-note">Takeaway: No upload required.</div>
        </div>
      </section>
    </div>
    <section class="intro-start" aria-labelledby="introStartTitle">
      <div class="intro-start-header">
        <h2 id="introStartTitle">How you’ll get going</h2>
        <span>No marketplace required.</span>
      </div>
      <div class="intro-steps">
        <div class="intro-step">
          <span class="intro-step-number">1</span>
          <strong>Teach your agent</strong>
          <p>Tell your agent:</p>
          <code class="intro-agent-prompt">Run gh skill install markgar/quire quire --scope user, reload your skills, then use /quire to create my presentation.</code>
        </div>
        <div class="intro-step">
          <span class="intro-step-number">2</span>
          <strong>Ask for a deck</strong>
          <p>Your agent creates a local <code>.md</code> file using Quire source.</p>
        </div>
        <div class="intro-step">
          <span class="intro-step-number">3</span>
          <strong>Open and present</strong>
          <p>Choose that file here. Quire watches it and refreshes as your agent edits.</p>
        </div>
      </div>
    </section>
    <dl class="intro-points">
      <div class="intro-point">
        <dt>Local by design</dt>
        <dd>Your deck stays on your machine. No upload, account, analytics, or server-side processing.</dd>
      </div>
      <div class="intro-point">
        <dt>Source native</dt>
        <dd>Write, diff, review, and revise the presentation as a small, purpose-built text format.</dd>
      </div>
      <div class="intro-point">
        <dt>Open source</dt>
        <dd>The app is one HTML file. Read the code and verify exactly what runs in your browser.</dd>
      </div>
    </dl>
    <div class="intro-actions">
      <button class="intro-primary" id="introOpenBtn" type="button">Choose a Quire deck</button>
      <button id="introDismiss" type="button">Explore first</button>
      <a class="intro-source" href="https://github.com/markgar/quire" target="_blank" rel="noopener noreferrer">
        View source on GitHub
      </a>
    </div>
  </div>
</dialog>

<div class="stage" id="stage">
<div class="scaler" id="scaler"></div>
<div class="drop-hint" id="dropHint">
  <h1>100% local.</h1>
  <p class="drop-lede">Quire turns agent-written source into presentations in your browser.</p>
  <p class="drop-detail">Open a deck, or drop a <code>.md</code> file here. Your deck never leaves this machine.</p>
  <p class="drop-proof">No upload. No account. No analytics. Open-source HTML and JavaScript.</p>
</div>
</div>

<nav class="nav">
  <button id="prev" type="button">&larr; Prev</button>
  <span class="counter" id="counter">&mdash;</span>
  <button id="next" type="button">Next &rarr;</button>
  <span class="dots" id="dots"></span>
  <span class="hint">&larr; &rarr; or space &middot; F full screen &middot; T theme &middot; S slides</span>
</nav>

<script>
${read('nav.js')}
</script>

<script>
window.quireShell = ${embedShell()};
</script>

<script type="module">
${inline('html.js')}
${inline('deck.js')}
${inline('render.js')}
${inline('fit.js')}
${inline('export.js')}
${inline('app.js')}
</script>
</body>
</html>
`;

const out = resolve(process.argv[2] || join(here, '..', 'quire.html'));
writeFileSync(out, page);
console.log(`wrote ${out}  (${(page.length / 1024).toFixed(1)} KB)`);

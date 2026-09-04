// @ts-check
/**
 * The quire app: open local Quire source, watch it, render it.
 *
 * Loaded as a module inside quire.html with deck.js and render.js. It owns
 * loading and watching; presenting is handled by nav.js, which this calls
 * back into after every render.
 *
 * A hosted page cannot fetch a local file, so reaching one requires a handle
 * the user grants explicitly.
 */

/* global quireNav */

import { parseQuire } from './deck.js';
import { renderSlides } from './render.js';
import { measureDeck, annotate, formatReport } from './fit.js';
import { exportHtml, exportName, download } from './export.js';
import { readDeckFile } from './deck-file.js';
import { rememberHandle, recallHandle } from './handle-store.js';
import { safeDeckUrl } from './deck-url.js';

const scaler = /** @type {HTMLElement} */ (document.getElementById('scaler'));
const status = /** @type {HTMLElement} */ (document.getElementById('status'));
const openBtn = /** @type {HTMLButtonElement} */ (document.getElementById('openBtn'));
const dropHint = /** @type {HTMLElement} */ (document.getElementById('dropHint'));
const fitBtn = /** @type {HTMLButtonElement} */ (document.getElementById('fitBtn'));
const exportBtn = /** @type {HTMLButtonElement} */ (document.getElementById('exportBtn'));
const installBtn = /** @type {HTMLButtonElement} */ (document.getElementById('installBtn'));
const aboutBtn = /** @type {HTMLButtonElement} */ (document.getElementById('aboutBtn'));
const introDialog = /** @type {HTMLDialogElement} */ (document.getElementById('introDialog'));
const introClose = /** @type {HTMLButtonElement} */ (document.getElementById('introClose'));
const introOpenBtn = /** @type {HTMLButtonElement} */ (document.getElementById('introOpenBtn'));
const introDismiss = /** @type {HTMLButtonElement} */ (document.getElementById('introDismiss'));
const checkUpdateBtn = /** @type {HTMLButtonElement} */ (document.getElementById('checkUpdateBtn'));
const updateNotice = /** @type {HTMLElement} */ (document.getElementById('updateNotice'));
const applyUpdateBtn = /** @type {HTMLButtonElement} */ (document.getElementById('applyUpdateBtn'));

/** @type {string} name of the open deck, for naming an export */
let deckName = '';
/** @type {string | undefined} base URL for relative assets in a deck loaded through ?deck= */
let assetBase;
/** Embedded local assets keyed by the path written in Quire source. */
/** @type {Record<string, string>} */
let assetMap = {};

const hasFSA = typeof window.showOpenFilePicker === 'function';
const INTRO_KEY = 'quire:intro:v1';
const UPDATE_STATE_KEY = 'quire:update-state:v1';

/** @type {any} current file handle, when we have one */
let handle = null;
/** @type {string} last source we rendered, to skip no-op re-renders */
let lastText = '';
/** Incremented on each render so late image events cannot remeasure a newer deck. */
let renderGeneration = 0;
/** @type {number} */
let lastModified = 0;
/** @type {any} */
let observer = null;
/** @type {number | undefined} */
let pollTimer;
/** @type {boolean} guards reread against the observer and the poll overlapping */
let rereading = false;
/** Whether a user-driven picker is currently open. */
let pickingFile = false;
/** Invalidates asynchronous automatic restores when the user starts opening a file. */
let openIntent = 0;
/** Whether the stage currently shows a generated failure slide. */
let showingFailure = false;
/** Whether the active watcher most recently failed to read its source. */
let watchFailed = false;
/** @type {BeforeInstallPromptEvent | null} */
let installPrompt = null;
/** @type {ServiceWorkerRegistration | null} */
let workerRegistration = null;
let reloadingForUpdate = false;

// ---------------------------------------------------------------------------
// status line
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @param {'idle' | 'live' | 'warn' | 'error'} [kind]
 */
function setStatus(text, kind = 'idle') {
  status.textContent = text;
  status.dataset.kind = kind;
}

function rememberIntro() {
  try {
    localStorage.setItem(INTRO_KEY, 'seen');
  } catch {
    /* private storage may be unavailable; dismissal still works */
  }
}

function closeIntro() {
  rememberIntro();
  introDialog.close();
}

function showIntro() {
  if (!introDialog.open) introDialog.showModal();
}

function showIntroOnce() {
  try {
    if (localStorage.getItem(INTRO_KEY) === 'seen') return;
  } catch {
    /* show it when storage cannot answer */
  }
  rememberIntro();
  showIntro();
}

function showUpdateReady() {
  applyUpdateBtn.disabled = false;
  applyUpdateBtn.textContent = 'Restart to update';
  updateNotice.removeAttribute('aria-busy');
  updateNotice.hidden = false;
}

function rememberUpdateState() {
  if (!deckName || !lastText) return;
  try {
    sessionStorage.setItem(
      UPDATE_STATE_KEY,
      JSON.stringify({ deckName, slide: window.quireNav.current() }),
    );
  } catch {
    /* reload still works when session storage is unavailable */
  }
}

function restoreUpdateState() {
  try {
    const stored = sessionStorage.getItem(UPDATE_STATE_KEY);
    if (!stored) return;
    sessionStorage.removeItem(UPDATE_STATE_KEY);
    const state = JSON.parse(stored);
    if (state?.deckName === deckName && Number.isInteger(state.slide)) {
      window.quireNav.go(state.slide);
    }
  } catch {
    try {
      sessionStorage.removeItem(UPDATE_STATE_KEY);
    } catch {
      /* storage is unavailable */
    }
  }
}

async function checkForUpdates() {
  if (!workerRegistration) {
    setStatus('Update checks are available in the installed or hosted app', 'warn');
    return;
  }
  setStatus('Checking for a Quire update…');
  try {
    await workerRegistration.update();
    if (workerRegistration.waiting) {
      showUpdateReady();
      setStatus('A new Quire version is ready', 'live');
    } else {
      setStatus('Quire is up to date', 'live');
    }
  } catch (err) {
    setStatus(err instanceof Error ? `Could not check for updates — ${err.message}` : 'Could not check for updates', 'error');
  }
}

async function setupPwa() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    checkUpdateBtn.hidden = true;
    return;
  }

  try {
    workerRegistration = await navigator.serviceWorker.register('/service-worker.js');
    if (workerRegistration.waiting && navigator.serviceWorker.controller) showUpdateReady();
    workerRegistration.addEventListener('updatefound', () => {
      const installing = workerRegistration?.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) showUpdateReady();
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });
  } catch (err) {
    setStatus(err instanceof Error ? `Offline app setup failed — ${err.message}` : 'Offline app setup failed', 'warn');
  }
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

/**
 * Render Quire source into the stage, preserving the reader's position.
 *
 * Landing back on slide 1 after every edit would make the authoring loop
 * useless: the author is nearly always looking at the slide being edited.
 *
 * @param {string} markdown
 * @param {{keepPosition?: boolean}} [opts]
 * @returns {boolean} whether a deck was rendered; false means a failure slide
 *   is on screen and its explanation must not be overwritten by a caller
 *   reporting success.
 */
function render(markdown, opts = {}) {
  const keep = opts.keepPosition && window.quireNav ? window.quireNav.current() : undefined;
  let spec;
  let slidesHtml;
  try {
    spec = parseQuire(markdown, { assetBase, assetMap });
    if (!spec.slides.length) {
      showFailure('That file has no slides', new Error('A deck needs at least one slide.'));
      return false;
    }
    // Rendering has to be inside the try as well as parsing. A one-character
    // typo in a layout name — `card3` for `cards3` — parses cleanly and throws
    // here, and an escaping throw meant a dropped deck silently did nothing, a
    // watched deck stopped updating, and a re-read blamed the disk.
    slidesHtml = renderSlides(spec);
  } catch (err) {
    showFailure('Could not render this file', err);
    return false;
  }

  const paramTheme = new URLSearchParams(location.search).get('theme');
  const theme =
    paramTheme === 'light' || paramTheme === 'dark'
      ? paramTheme
      : spec.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.deckTheme = spec.theme || '';
  document.documentElement.setAttribute('data-theme', theme);
  scaler.innerHTML = slidesHtml;
  showingFailure = false;
  document.title = spec.title || 'quire';
  lastText = markdown;
  const generation = ++renderGeneration;
  window.quireNav.refresh(keep);
  reportFit();
  window.quireNav.sync();
  remeasureAfterAssets(generation);
  // Only a deck that rendered can be exported; the button is the affordance
  // for that, so it follows the deck rather than the file.
  exportBtn.hidden = !window.quireShell;
  return true;
}

/**
 * Images can decode after the first layout pass. Remeasure when they settle so
 * the badge, data-over annotations, and slide panel describe the rendered deck
 * rather than its pre-image geometry.
 *
 * @param {number} generation
 */
function remeasureAfterAssets(generation) {
  /** @type {number | undefined} */
  let timer;
  const settle = () => {
    if (generation !== renderGeneration) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (generation !== renderGeneration) return;
      reportFit();
      window.quireNav.sync();
    }, 0);
  };

  scaler.querySelectorAll('img').forEach((image) => {
    image.addEventListener('load', settle);
    image.addEventListener('error', settle);
    if (image.complete) {
      if (typeof image.decode === 'function') image.decode().then(settle, settle);
      else settle();
    }
  });
  document.fonts?.ready.then(settle);
}

// ---------------------------------------------------------------------------
// overflow reporting
// ---------------------------------------------------------------------------

/** @type {import('./fit.js').SlideFit[]} */
let fitReport = [];

/**
 * Measure the deck and surface anything that overflows.
 *
 * `quireNav.sync` reflects the resulting annotations in the existing panel
 * without rebuilding or measuring the deck a second time.
 *
 * Deliberately reports rather than scales. Silent shrinking would let a deck
 * drift dense and small one slide at a time; being told a slide is 97px over
 * is the honest version, and leaves the judgement with the author.
 */
function reportFit() {
  try {
    fitReport = measureDeck(scaler);
  } catch {
    fitReport = []; // measurement must never take the deck down with it
    return;
  }
  annotate(scaler, fitReport);

  const over = fitReport.filter((r) => r.over > 0 || r.wide > 0);
  fitBtn.hidden = over.length === 0;
  if (over.length) {
    const worst = over.reduce((a, b) => (Math.max(b.over, b.wide) > Math.max(a.over, a.wide) ? b : a));
    fitBtn.textContent =
      over.length === 1
        ? `1 slide ${worst.over > 0 ? `${worst.over}px tall` : `${worst.wide}px wide`}`
        : `${over.length} slides over`;
    fitBtn.title = formatReport(fitReport);
    console.warn('[quire] ' + formatReport(fitReport));
  }
}

/**
 * Queryable from the console and from a driving script:
 *
 *   quireFit.report()    every slide, with natural height and overflow
 *   quireFit.overflowing() just the ones over
 *
 * This is the interface an agent uses. It turns "does this deck fit" from a
 * screenshot someone has to look at into a number that can be asserted on.
 */
window.quireFit = {
  report: () => fitReport,
  overflowing: () => fitReport.filter((r) => r.over > 0 || r.wide > 0),
  format: () => formatReport(fitReport),
  remeasure: () => {
    reportFit();
    return fitReport;
  },
};

/**
 * Export, from the console or a driving script:
 *
 *   quireExport.html()   the single-file runtime and source, as a string
 *   quireExport.save()   the same thing, downloaded
 *
 * Exposed for the same reason as quireFit: it turns "does the export work"
 * into something assertable, instead of a file someone has to open and look
 * at.
 */
window.quireExport = {
  html: () => exportHtml(lastText, assetBase, assetMap),
  name: () => exportName(deckName),
  save: () => download(exportName(deckName), exportHtml(lastText, assetBase, assetMap)),
};

/**
 * Replace the deck with a single readable failure slide.
 *
 * Under a build step a bad file failed loudly at the command line. At runtime
 * that feedback has to be built, or a malformed deck just goes blank.
 *
 * @param {string} headline
 * @param {unknown} err
 */
function showFailure(headline, err) {
  const detail = err instanceof Error ? err.message : String(err);
  scaler.innerHTML =
    '<section class="slide active">\n' +
    '  <div class="eyebrow">COULD NOT RENDER</div>\n' +
    `  <h2>${escapeHtml(headline)}</h2>\n` +
    '  <div class="body">\n' +
    `    <div class="note">${escapeHtml(detail)}</div>\n` +
    '  </div>\n' +
    '</section>';
  showingFailure = true;
  // A failure slide is generated, not authored: reporting its fit would be
  // reporting on this code rather than on the deck.
  fitReport = [];
  fitBtn.hidden = true;
  exportBtn.hidden = true;
  window.quireNav.refresh(0);
  setStatus(headline, 'error');
}

/** @param {string} s */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// watching
// ---------------------------------------------------------------------------

function stopWatching() {
  watchFailed = false;
  if (observer) {
    try {
      observer.disconnect();
    } catch {
      /* already gone */
    }
    observer = null;
  }
  if (pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

/**
 * Re-read the handle and render if the bytes changed.
 *
 * A failed read keeps the last good render on screen. A deck must not blank
 * because a disk went away.
 *
 * Guarded against re-entry: the observer and the backstop poll can both fire
 * for one save, and the `lastModified` check below is not a critical section —
 * two concurrent calls would both pass it before either had assigned.
 */
async function reread() {
  if (!handle || rereading) return;
  rereading = true;
  try {
    const file = await handle.getFile();
    if (watchFailed) {
      watchFailed = false;
      setStatus(`${handle.name} · watching for changes`, 'live');
    }
    if (file.lastModified === lastModified) return;
    const deck = await readDeckFile(file);
    // Commit the timestamp only once the read has actually succeeded.
    // Advancing it first means a single failed read — a mid-save file, a
    // volume that blinked — permanently suppresses that save: every later poll
    // sees the timestamp it already recorded and returns above. The deck then
    // never updates again and looks exactly like a file nobody edited, which
    // is the failure the backstop poll exists to prevent.
    lastModified = file.lastModified;
    assetMap = deck.assets;
    if (!/\.quire$/i.test(file.name) && deck.markdown === lastText && !showingFailure) return;
    if (render(deck.markdown, { keepPosition: true })) {
      setStatus(`${handle.name} · updated ${timeNow()}`, 'live');
    }
  } catch (err) {
    watchFailed = true;
    setStatus(`${handle.name} · cannot read (showing last good version)`, 'warn');
  } finally {
    rereading = false;
  }
}

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/**
 * Watch the current handle, by both mechanisms at once.
 *
 * `FileSystemObserver` gives sub-250ms notification where polling costs up to
 * a second, which is worth having in a loop whose whole point is that an edit
 * appears immediately.
 *
 * But the poll runs alongside it rather than only as a fallback. Observing was
 * verified against an origin-private file, which is a *different storage
 * backend* from a file picked off the local disk; whether it delivers there
 * could not be verified without a real picker gesture. Treating an unverified
 * component as authoritative is how an authoring loop silently stops updating
 * — the worst failure this app has, because it looks exactly like a deck that
 * did not change. A local `getFile()` once a second costs no network and no
 * permission prompt, and `reread` returns immediately when nothing moved, so
 * the backstop is invisible whenever the observer is doing its job.
 */
function startWatching() {
  stopWatching();
  if (!handle) return;

  const FSObserver = /** @type {any} */ (window).FileSystemObserver;
  if (typeof FSObserver === 'function') {
    try {
      observer = new FSObserver(() => {
        void reread();
      });
      void observer.observe(handle);
    } catch {
      observer = null; // the poll below is then the only watcher
    }
  }
  pollTimer = window.setInterval(() => void reread(), 1000);
}

// ---------------------------------------------------------------------------
// opening
// ---------------------------------------------------------------------------

/** @param {any} h */
async function openHandle(h) {
  handle = h;
  deckName = h.name;
  assetBase = undefined;
  const file = await h.getFile();
  const deck = await readDeckFile(file);
  assetMap = deck.assets;
  lastModified = file.lastModified;
  const ok = render(deck.markdown);
  // Watch either way: a deck that failed to parse is one the author is most
  // likely about to fix, and it should recover without being reopened.
  startWatching();
  if (ok) {
    restoreUpdateState();
    setStatus(`${h.name} · watching for changes`, 'live');
  }
  dropHint.hidden = true;
  void rememberHandle(h);
}

async function pickDeck() {
  const picker = window.showOpenFilePicker;
  if (!picker) {
    setStatus('This browser cannot open files directly — drop a .quire or .md file onto the window', 'warn');
    return;
  }
  if (pickingFile) return;
  pickingFile = true;
  openIntent += 1;
  try {
    const [h] = await picker({
      types: [
        { description: 'Quire deck', accept: { 'application/vnd.quire+zip': ['.quire'] } },
        { description: 'Quire source', accept: { 'text/markdown': ['.md', '.markdown'] } },
      ],
      multiple: false,
    });
    await openHandle(h);
  } catch (err) {
    // AbortError is the user closing the picker; not a failure.
    if (err instanceof DOMException && err.name === 'AbortError') {
      setStatus(lastText ? `${deckName} · still open` : 'No deck selected');
    } else {
      setStatus('Could not open that file', 'error');
    }
  } finally {
    pickingFile = false;
  }
}

/**
 * A dropped file has no handle, so it cannot be watched. Say so rather than
 * appear to be watching.
 *
 * @param {File} file
 */
async function openDroppedFile(file) {
  stopWatching();
  handle = null;
  deckName = file.name;
  assetBase = undefined;
  const deck = await readDeckFile(file);
  assetMap = deck.assets;
  if (render(deck.markdown)) setStatus(`${file.name} · drag it again to refresh`, 'warn');
  dropHint.hidden = true;
}

// ---------------------------------------------------------------------------
// startup
// ---------------------------------------------------------------------------

/**
 * Same-origin deck by URL: ?deck=name.md. Only works when the app and the
 * deck are served from the same place, which in practice means a dev server.
 */
async function tryUrlDeck() {
  const name = new URLSearchParams(location.search).get('deck');
  if (!name) return false;
  const url = safeDeckUrl(name);
  if (!url) {
    showFailure(
      'That deck link is not allowed',
      new Error(
        `?deck= only opens a file served alongside the app. "${name}" points somewhere else, ` +
          'and a deck can contain executable markup, so it is refused rather than rendered.',
      ),
    );
    return true;
  }
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    deckName = name;
    assetBase = new URL('.', url).href;
    const ok = render(await res.text());
    if (ok) {
      restoreUpdateState();
      setStatus(`${name} · polling for changes`, 'live');
    }
    dropHint.hidden = true;
    watchUrl(url);
    return true;
  } catch (err) {
    showFailure(`Could not load ${name}`, err);
    return true; // handled, even though it failed
  }
}

/**
 * Poll a same-origin deck by URL.
 *
 * Guarded against overlapping ticks and against rendering a failure body.
 * Fetching the content rather than relying on Last-Modified also catches
 * equal-length edits and saves within one timestamp-resolution window.
 *
 * @param {string} name a URL already checked as same-origin
 */
function watchUrl(name) {
  stopWatching();
  let polling = false;
  pollTimer = window.setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const res = await fetch(name, { cache: 'no-store' });
      // A deck must never be replaced by an error page.
      if (!res.ok) {
        watchFailed = true;
        setStatus(`${deckName} · cannot read (showing last good version)`, 'warn');
        return;
      }
      const text = await res.text();
      if (watchFailed) {
        watchFailed = false;
        setStatus(`${deckName} · polling for changes`, 'live');
      }
      if ((text !== lastText || showingFailure) && render(text, { keepPosition: true })) {
        setStatus(`${deckName} · updated ${timeNow()}`, 'live');
      }
    } catch {
      watchFailed = true;
      setStatus(`${deckName} · cannot read (showing last good version)`, 'warn');
    } finally {
      polling = false;
    }
  }, 1000);
}

/**
 * A stored handle may still be granted from a previous visit. Browsers require
 * a user gesture to *request* permission, so when it is merely 'prompt' we
 * offer a button rather than firing a dialog at someone who just opened a tab.
 */
async function tryStoredHandle() {
  if (!hasFSA || pickingFile) return false;
  const intent = openIntent;
  const h = await recallHandle();
  if (!h || h.kind !== 'file' || pickingFile || intent !== openIntent) return false;
  try {
    const state = await h.queryPermission({ mode: 'read' });
    if (pickingFile || intent !== openIntent) return false;
    if (state === 'granted') {
      await openHandle(h);
      return true;
    }
    openBtn.textContent = `Reopen ${h.name}`;
    openBtn.onclick = async () => {
      try {
        if ((await h.requestPermission({ mode: 'read' })) === 'granted') {
          openBtn.textContent = 'Open deck…';
          openBtn.onclick = () => void pickDeck();
          await openHandle(h);
        }
      } catch {
        setStatus(`Could not reopen ${h.name}`, 'error');
      }
    };
    setStatus(`${h.name} — click to reopen`, 'idle');
    return true;
  } catch {
    return false;
  }
}

function wireDragDrop() {
  const stop = (/** @type {Event} */ e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('dragover', (e) => {
    stop(e);
    document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', (e) => {
    stop(e);
    if (e.relatedTarget === null) document.body.classList.remove('dragging');
  });
  window.addEventListener('drop', async (e) => {
    stop(e);
    document.body.classList.remove('dragging');
    const dt = e.dataTransfer;
    if (!dt) return;

    try {
      // Chromium can give a real handle from a drop, which means the dropped
      // file can be watched like a picked one. Try that first.
      //
      // The catch covers acquiring the handle only. Wrapping openHandle too
      // meant a deck that failed to open fell through to the File path and
      // threw a second time, out of an async listener nothing was awaiting —
      // so a drop did nothing at all, with no error and no status change.
      const item = dt.items && dt.items[0];
      let handleFromDrop = null;
      if (hasFSA && item && typeof item.getAsFileSystemHandle === 'function') {
        try {
          const h = await item.getAsFileSystemHandle();
          if (h && h.kind === 'file') handleFromDrop = h;
        } catch {
          /* no handle available; the File below still works */
        }
      }
      if (handleFromDrop) {
        await openHandle(handleFromDrop);
        return;
      }
      const file = dt.files && dt.files[0];
      if (file) await openDroppedFile(file);
    } catch (err) {
      setStatus(
        err instanceof Error ? `Could not open that deck — ${err.message}` : 'Could not open that deck',
        'error',
      );
    }
  });
}

async function main() {
  openBtn.onclick = () => void pickDeck();
  aboutBtn.onclick = showIntro;
  introClose.onclick = closeIntro;
  introDismiss.onclick = closeIntro;
  introDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeIntro();
  });
  introOpenBtn.onclick = () => {
    closeIntro();
    if (hasFSA) void pickDeck();
  };
  checkUpdateBtn.onclick = () => void checkForUpdates();
  applyUpdateBtn.onclick = async () => {
    const waiting = workerRegistration?.waiting;
    if (!waiting) return;
    applyUpdateBtn.disabled = true;
    applyUpdateBtn.textContent = 'Updating…';
    updateNotice.setAttribute('aria-busy', 'true');
    setStatus('Updating Quire…', 'live');
    rememberUpdateState();
    if (handle) await rememberHandle(handle);
    waiting.postMessage('SKIP_WAITING');
  };
  installBtn.onclick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installBtn.hidden = true;
  };
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = /** @type {BeforeInstallPromptEvent} */ (event);
    installBtn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installBtn.hidden = true;
    setStatus('Quire installed', 'live');
  });
  if (!hasFSA) introOpenBtn.textContent = 'Start exploring';
  showIntroOnce();
  await setupPwa();

  // Jumping to the worst offender is the action an author wants next; the
  // full per-slide table is on the tooltip and in the console.
  fitBtn.onclick = () => {
    const over = fitReport.filter((r) => r.over > 0 || r.wide > 0);
    if (!over.length) return;
    const worst = over.reduce((a, b) => (Math.max(b.over, b.wide) > Math.max(a.over, a.wide) ? b : a));
    window.quireNav.go(worst.index);
    console.warn('[quire] ' + formatReport(fitReport));
  };
  wireDragDrop();

  // Export builds from the last source that rendered, not from the DOM, so
  // what a recipient opens is what the author's file says.
  exportBtn.onclick = () => {
    if (!lastText) return;
    try {
      const html = exportHtml(lastText, assetBase, assetMap);
      download(exportName(deckName), html);
      setStatus(`${exportName(deckName)} · saved, runtime and source embedded`, 'live');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not export this deck', 'error');
    }
  };

  if (!hasFSA) {
    openBtn.hidden = true;
    setStatus('Drop a .quire or .md file to open it — this browser cannot watch files', 'warn');
  }

  if (await tryUrlDeck()) return;
  if (await tryStoredHandle()) return;

  if (hasFSA) setStatus('Open a deck, or drop a .quire or .md file onto the window');
}

void main();

// @ts-check
/**
 * Defects that the app harness must catch.
 *
 * A green test that cannot go red is worse than no test, and the harness is
 * unusually prone to that: it drives a real browser through several layers of
 * substitution, so a test can pass without ever reaching the behaviour it
 * claims to check. Two of these were written after a test passed against an
 * app that was genuinely broken.
 *
 * Each entry rewrites the built app to reintroduce one defect, and names the
 * tests that must fail as a result. `find` is matched against the built
 * `quire.html`; if it stops matching, the mutation is stale and checking
 * nothing, which the harness reports as an error rather than a pass.
 *
 * Every defect here was real at some point, or is a plausible regression of
 * something that was.
 */

/**
 * @typedef {object} Mutation
 * @property {string} name
 * @property {string[]} catchers tests that must fail once this is applied
 * @property {string} why what would be broken for a user
 * @property {string} find text in the built app
 * @property {string} replace what to put in its place
 */

/** @type {Mutation[]} */
export const MUTATIONS = [
  {
    name: 'status-stomps-error',
    catchers: ['a broken deck says so in the status, and recovers'],
    why: 'the real bug: an unparseable deck drew an error slide, then the status line overwrote the explanation with "watching for changes"',
    find: "if (ok) setStatus(`${h.name} · watching for changes`, 'live');",
    replace: "setStatus(`${h.name} · watching for changes`, 'live');",
  },
  {
    name: 'no-backstop-poll',
    catchers: ['watching survives an observer that never delivers'],
    why: 'if FileSystemObserver attaches to a disk file but never fires, the deck silently stops updating and looks like a file nobody edited',
    find: '      void observer.observe(handle);\n    } catch {',
    replace: '      void observer.observe(handle);\n      return;\n    } catch {',
  },
  {
    name: 'position-not-preserved',
    catchers: ['an edit re-renders and keeps the reader in place'],
    why: 'every edit throws the author back to slide 1, which makes the authoring loop useless. Note this targets refresh\'s chosen target, not the `keep` value: position is preserved by two independent mechanisms, since nav.js also mirrors the current slide into location.hash and falls back to it. Nulling `keep` alone changes nothing a user could see, so mutating it proved nothing.',
    find: 'const target = keepIndex === undefined ? fromHash() : Math.min(keepIndex, slides.length - 1);',
    replace: 'const target = 0;',
  },
  {
    name: 'permission-asked-on-load',
    catchers: ['permission is never requested unasked, and works on click'],
    why: 'an unprompted permission dialog on page load, which browsers require a gesture for and users read as hostile',
    find: "    if (state === 'granted') {",
    replace: "    await h.requestPermission({ mode: 'read' });\n    if (state === 'granted') {",
  },
  {
    name: 'drop-ignores-handle',
    catchers: ['a drop carrying a handle is watched'],
    why: 'a dropped deck renders but is never watched, so Chromium silently loses live reload on the drag-and-drop path',
    find: "if (hasFSA && item && typeof item.getAsFileSystemHandle === 'function') {",
    replace: 'if (false) {',
  },
  {
    name: 'overflow-never-reported',
    catchers: ['overflow is reported, and clears when fixed'],
    why: 'clipped slides go unreported, which is the whole reason the app measures',
    find: '    fitReport = measureDeck(scaler);',
    replace: '    fitReport = measureDeck(scaler).map((r) => ({ ...r, over: -1 }));',
  },
  {
    name: 'overflow-never-clears',
    catchers: ['a remeasure clears a slide that no longer overflows'],
    why: 'a slide that stops overflowing keeps its warning. Only reachable through quireFit.remeasure(): a normal re-render replaces every slide element, so stale annotations die with the old DOM and a test that edits the file cannot see this at all.',
    find: '    if (fit.over > 0) slide.dataset.over = String(fit.over);\n    else delete slide.dataset.over;',
    replace: '    if (fit.over > 0) slide.dataset.over = String(fit.over);',
  },
  {
    name: 'dropped-file-claims-watching',
    catchers: ['a dropped file renders and admits it cannot be watched'],
    why: 'a dropped File has no handle and cannot be watched; saying otherwise means the author waits for a reload that never comes',
    find: "if (ok) setStatus(`${file.name} · drag it again to refresh`, 'warn');",
    replace: "if (ok) setStatus(`${file.name} · watching for changes`, 'live');",
  },
  {
    name: 'handle-not-persisted',
    catchers: ['the handle is persisted and reopens with no interaction'],
    why: 'reopening the app forgets the deck, so every visit starts with a file dialog',
    find: '  void rememberHandle(h);',
    replace: '  void 0;',
  },
  {
    name: 'blank-on-failed-read',
    catchers: ['a failed re-read keeps the last good render'],
    why: 'a transient read failure blanks a deck mid-presentation instead of holding the last good render',
    find: "    setStatus(`${handle.name} · cannot read (showing last good version)`, 'warn');",
    replace: "    scaler.innerHTML = '';\n    setStatus(`${handle.name} · cannot read`, 'warn');",
  },
  {
    name: 'export-ships-corrupt-source',
    catchers: ['an export opens on its own and gives its source back'],
    why: 'the embedded source is corrupted and the round-trip guard is gone, so the file claims to be self-describing while handing back something the author never wrote. Corrupting *and* disabling the guard together is deliberate: removing the guard alone breaks nothing observable, because the export is still correct — a check that never fires cannot be detected by a test on correct output.',
    find:
      '  const html = page(parseQuire(markdown, { assetBase }), shell, markdown);\n' +
      '  const recovered = readSource(html);\n' +
      '  if (recovered !== markdown) {',
    replace:
      "  const html = page(parseQuire(markdown, { assetBase }), shell, markdown + '\\n');\n" +
      '  const recovered = markdown;\n' +
      '  if (false) {',
  },
  {
    name: 'export-carries-app-chrome',
    catchers: ['an export opens on its own and gives its source back'],
    why: 'building an export from the live document instead of the shell hands the recipient the toolbar, the open button and whatever runtime state was on the slides',
    find: '  const html = page(parseQuire(markdown, { assetBase }), shell, markdown);',
    replace: '  const html = page(parseQuire(markdown, { assetBase }), shell, markdown).replace(\'</body>\', \'<div class="drop-hint"></div></body>\');',
  },
  {
    name: 'deck-url-not-origin-checked',
    catchers: ['a cross-origin ?deck= link is refused'],
    why: 'the critical one, demonstrated end to end before it was fixed: fetch resolves absolute URLs, so a link alone fetched attacker markdown, ran its raw HTML in the app origin, read the granted handle from IndexedDB, and posted a local file away while the screen showed a plausible deck',
    find: '  const url = safeDeckUrl(name);\n  if (!url) {',
    replace: '  const url = name;\n  if (false) {',
  },
];

/**
 * Known gap, recorded rather than faked.
 *
 * The `res.ok` check in `watchUrl` — which stops a 404 body being rendered
 * over a good deck when a watched file is deleted or renamed — has no mutation
 * here, because catching it needs a file that exists at load and stops
 * existing mid-poll. The harness serves from a static dev server and cannot
 * arrange that. A mutation that appeared to cover it would be worse than this
 * comment.
 */

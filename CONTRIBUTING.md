# Contributing

## Getting it running

    npm install          # Node 22 (see .node-version)
    npm run check      # type gate, app build, conformance suite
    npm run serve      # http://localhost:8931/quire.html

There is no build step for the source. Runtime modules are plain JavaScript with
`// @ts-check` and JSDoc, checked by `tsc --noEmit`. The canonical parser,
renderer, shell, fit measurement, native package lifecycle, and CLI live in
`skills/quire/` so an installed skill carries the same implementation as the
app. `native.js` owns validated package reads, imports, and verified atomic
writes; `quire-package.mjs` owns command dispatch plus isolated browser fit and
render operations.

`quire.html` **is** generated, by `tools/build-app.js`, and is committed
because it is the deployable. `npm run check` rebuilds it, so commit the result
when you change runtime files in `src/` or `skills/quire/`. CI fails if it has
drifted.

## Tests

The test suite combines process-level conformance checks with a Chromium app
harness.

`npm run check` runs the headless gates: parse and render conformance against
golden files, page assembly, source round-trip, app-build integrity, CLI/browser
visual parity, and the app harness against real origin-private file handles.

When the format or renderer changes intentionally, update the snapshots with
`npm run update:goldens` and review every generated diff.

`npm run test:harness` drives `test/app-harness.html` in headless Chromium. It
uses real origin-private file handles to cover handle persistence, the
permission branch, watching, drag-and-drop, native `.quire` package assets,
overflow, and export. It does not replace a manual check of the OS picker,
permission decay across a browser restart, or local-disk observer delivery:

    npm run serve
    # open http://localhost:8931/test/app-harness.html

`test/quire-cli.js` copies the installed-skill files into an isolated temporary
directory and exercises direct `.quire` creation and mutation, Markdown import,
semantic validation, browser fit checks, contact-sheet and single-slide PNG
rendering, assets, inspection, `EPIPE` handling, and byte-for-byte rollback
after rejected edits. `test/native-package.js` directly pins the package
lifecycle boundary, including exact source and asset round trips, import,
validation, temporary-file cleanup, and rollback. Both run as part of
`npm test`.

## The bar for a test

**A green test that cannot go red is worse than no test.** This is not a slogan
here; it has caught real problems more than once, including two harness tests
that passed against an app that was genuinely broken.

So: when you add a test, break the thing it covers and watch it fail. For the
browser harness there is a mechanism for this — add your defect to
`test/mutations.js` naming the tests that must catch it, then run:

    http://localhost:8931/test/app-harness.html?mutate=all

Every defect must be caught. A mutation whose target text no longer appears in
the built app is reported as stale rather than passing, so an app change cannot
quietly retire a check.

## Things worth knowing before you change them

**Measure before trimming.** Overflow can come from grid rows, margins, or
wrapping rather than word count. Use `quireFit.report()` to identify the
constraining element before cutting content.

**Silent data loss is the bug this project cares most about.** A parser that
drops content without an error has failed worse than one that refuses to parse.
The fields consumed by each layout are defined in `SPEC.md`; changes to that
contract require fixtures and reviewed golden updates.

**The app must never transmit deck content.** No telemetry, no analytics, no
server-side anything. This is a design constraint, not a preference.

## Commits

Explain why, not what — the diff already says what. If a change came from
something breaking, say what broke.

## Reporting a vulnerability

See `SECURITY.md`. Note that decks are executable content by design, so read
the stated trust boundary before filing.

# quire

*A quire is a gathering of folded leaves — the unit a book is bound from.*

Quire is an agent-native presentation builder: your agent creates one `.quire`
deck, your browser reads it directly, and browser JavaScript presents it.

Quire source is a focused presentation dialect stored in a `.md` file. It uses
familiar Markdown-shaped syntax, but its headings, lists, quotes, and metadata
map to specific slide layouts rather than to a general-purpose document.

Your deck content and rendering stay local. There is no upload, account,
backend, or server-side processing. The viewer opens the `.quire` package from
your own disk, watches it, and re-renders when it changes.

A `.quire` deck is a ZIP package containing `deck.md`, image files, and a small
manifest. It remains one file to create, open, and share, while keeping images
as normal files internally instead of inflating them into base64 text. Single
`.md` files and embedded data URLs remain supported.

The app is plain HTML and JavaScript. Read the source if you want to verify
exactly what it does.

## Install Quire

### Create your first deck

1. **Teach your agent**

   > Run `gh skill install markgar/quire quire --scope user`, then reload your
   > skills.

2. **Ask for a deck**

   > Create a 10-slide Quire deck explaining how Apollo 11 reached the Moon.
   > Research accurate facts, cite sources, and use a timeline, process diagram,
   > metrics, and a chart. Save it as one `apollo-11.quire` file with its images
   > packaged inside.

3. **Open the deck**

   Go to [quiredeck.com](https://quiredeck.com), choose a deck, and open the
   generated `.quire` file.

### Install the app

On Chromium browsers, Quire can be installed as a standalone app from the
**Install Quire** button when the browser makes installation available. The
installed app caches its viewer shell and opens without a network connection;
deck files still stay on your machine and are opened only with your permission.

Quire checks its service worker when the browser is online. A new version waits
until you choose **Restart to update**, so an update never interrupts a
presentation. **Check for updates** in About requests a check immediately.

## Why not PowerPoint

PowerPoint is built for direct manipulation. You drag a box, you nudge it, you
see it move. That loop is excellent for a human at a mouse and useless to an
agent, which does not have hands.

An agent writes text. So in quire the *format is the interface*: the deck is
prose with a small amount of structure, and layout is inferred rather than
placed. An agent can author, review, and revise a deck the same way it edits
any other document.

## Why not a static site generator

A generator puts a build step between editing and seeing, and produces an
artefact that has drifted from its source the moment either changes.

Quire renders at runtime from the file on disk. The document you edit is the
document that presents.

## Why the deck stays local

Decks contain material that should not be uploaded: customer names, commercial
terms, internal policy. Quire's own code never transmits deck content; it reads
the file through a permission you grant and has no telemetry or server-side
processing. Deck-authored JavaScript is a separate trust boundary described
below.

## A deck is executable content

The format allows raw HTML on purpose, because the built-in Quire constructs are too blunt for
the typography a real slide needs. The viewer puts that HTML in the DOM, and
one consequence follows directly:

**Opening someone else's `.quire` or `.md` deck runs its JavaScript.** Open
decks the way you would open a script — only from someone you trust.

The app limits quiet network channels rather than pretending deck script cannot
run: a Content-Security-Policy blocks cross-origin requests, image beacons, and
form submissions, and `?deck=` only opens files served beside the app.
`SECURITY.md` states the boundary in full, including navigation that CSP cannot
block.

## Status

Working, and used for real decks. The format, parser, and renderer are covered
by golden-file tests; the app opens a local `.quire` deck, watches it,
re-renders on change, reports which slides overflow the canvas vertically or horizontally, and can produce
a self-contained HTML file with the runtime, exact Quire source, and packaged
images embedded. It is ready for static hosting.

### Try it

    npm install
    npm run serve
    # then open http://localhost:8931/quire.html?deck=test/fixtures/trusting-the-suite.md

Or open `http://localhost:8931/quire.html` and pick a `.quire` deck of your own.
Replacing that file re-renders it in about a second, with your position kept.

To see the complete native visual vocabulary—images, metrics, charts, diagrams,
attribution, tone, and alignment—open:

    http://localhost:8931/quire.html?deck=test/fixtures/visual-language.md

The bundled CLI creates and edits the native deck directly. The `.quire` file
is the only persistent authoring artifact:

    node src/cli.js create deck.quire --title "Quarterly review" --theme dark
    node src/cli.js slides list deck.quire
    node src/cli.js slides replace deck.quire 1 --content "# Quarterly review"
    node src/cli.js validate deck.quire
    node src/cli.js fit deck.quire
    node src/cli.js render deck.quire deck-contact-sheet.png
    node src/cli.js render deck.quire slide-3.png --slide 3

Longer slide source can be supplied through standard input. Images are added as
ordinary package entries and then referenced by the same path:

    node src/cli.js slides insert deck.quire 2 --stdin
    node src/cli.js assets add deck.quire chart.png images/chart.png

Every mutation validates the complete source and its asset references, writes a
temporary package, reopens and verifies it, and atomically replaces the deck.
Failed edits leave the original `.quire` bytes unchanged.

Existing Markdown decks can be migrated without adopting an unpacked authoring
workflow:

    node src/cli.js import old-deck.md deck.quire

`validate` checks structure and assets without browser dependencies. `fit`
launches an installed Chrome, Edge, or Chromium with the exact Quire renderer
and exits unsuccessfully when any slide exceeds the 720px canvas.

`render` creates local PNGs for visual review without Playwright or opening
quiredeck.com. Its default output is a labelled contact sheet of the complete
deck; `--slide` renders one selected slide at the native 1280×720 resolution.

Teach GitHub Copilot how to author the Quire dialect by installing the skill
directly from this repository—no marketplace is required:

    gh skill install markgar/quire quire --scope user

Reload skills in an active Copilot CLI session with `/skills reload`, then ask
it to use `/quire` to create or revise a presentation.

The skill has an opt-in end-to-end test that installs it into a temporary
project, starts a fresh Copilot context, and checks the native `.quire` deck the
agent creates:

    npm run test:skill

This test makes a live agent call, so it is intentionally separate from
`npm test`. Set `QUIRE_SKILL_TEST_KEEP=1` to preserve the temporary project for
inspection, or `QUIRE_SKILL_TEST_MODEL=<model>` to pin the evaluation model.

Decks can also be built as standalone HTML for someone who does not have the
app:

    node src/cli.js out.html deck.quire

### Deploy

The public viewer runs on Azure Static Web Apps. Every push to `main` runs the
checks in `.github/workflows/check.yml`; production deploys only after they pass.

The workflow stages only the deployable app as `index.html` and authenticates
with the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`. The deployment
credential is not stored in the repository.

### Types, without a build step

The source is plain JavaScript, but it is **fully type-checked in strict mode**
by the TypeScript compiler, using `// @ts-check` and JSDoc annotations rather
than `.ts` syntax:

```js
/**
 * @param {HTMLElement} scaler
 * @returns {SlideFit[]}
 */
function measureDeck(scaler) {
```

`npm run typecheck` runs `tsc --noEmit` over every JavaScript file in `src/`,
`test/` and `tools/`, with `strict` and `checkJs` on. It is the same checker and the same guarantees a
`.ts` file would get; what it avoids is a compile step between the code you
write and the code that runs, which matters because `quire.html` is meant to be
readable and debuggable as shipped.

The plain-JavaScript source is deliberate: the files that run are the files
contributors review, while TypeScript still provides a strict type gate.

### The repository

| Path | What it is |
|---|---|
| `SPEC.md` | The Quire source format, normative |
| `SECURITY.md` | The trust boundary, which is unusual here |
| `src/` | Parser, renderers, app. Plain JS, `// @ts-check`, no build step |
| `quire.html` | The built app. Generated by `tools/build-app.js`, committed because it is the deployable |
| `test/fixtures/` | Whole decks used as regression tests |
| `test/app-harness.html` | Browser behavior exercised headlessly by `npm run test:harness`, plus interactive mutation checks |

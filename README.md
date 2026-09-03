# quire

*A quire is a gathering of folded leaves — the unit a book is bound from.*

Quire is an agent-native presentation builder: your agent writes Quire source,
your browser reads that file directly, and browser JavaScript presents it.

Quire source is a focused presentation dialect stored in a `.md` file. It uses
familiar Markdown-shaped syntax, but its headings, lists, quotes, and metadata
map to specific slide layouts rather than to a general-purpose document.

Your deck content and rendering stay local. There is no upload, account,
backend, or server-side processing. The viewer opens the Quire source from your own
disk, watches it, and re-renders when it changes.

The app is plain HTML and JavaScript. Read the source if you want to verify
exactly what it does.

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

**Opening someone else's `.md` runs their JavaScript.** Open decks the way you
would open a script — only from someone you trust.

The app limits quiet network channels rather than pretending deck script cannot
run: a Content-Security-Policy blocks cross-origin requests, image beacons, and
form submissions, and `?deck=` only opens files served beside the app.
`SECURITY.md` states the boundary in full, including navigation that CSP cannot
block.

## Status

Working, and used for real decks. The format, parser, and renderer are covered
by golden-file tests; the app opens a local deck, watches it, re-renders on
change, reports which slides overflow the canvas, and exports one HTML file
with the runtime and exact Quire source embedded. Referenced assets remain external
unless they are embedded as data URLs. It is ready for static hosting.

### Try it

    npm install
    npm run serve
    # then open http://localhost:8931/quire.html?deck=test/fixtures/trusting-the-suite.md

Or open `http://localhost:8931/quire.html` and pick a `.md` of your own. Editing
that file re-renders it in about a second, with your position on the deck kept.

To see the complete native visual vocabulary—images, metrics, charts, diagrams,
attribution, tone, and alignment—open:

    http://localhost:8931/quire.html?deck=test/fixtures/visual-language.md

Keep each deck in its own directory with its images and source material.
Relative image paths work when that directory is served with Quire. For a deck
opened directly from disk, or an HTML export that must remain self-contained,
embed images as raster data URLs.

Teach GitHub Copilot how to author the Quire dialect by installing the skill
directly from this repository—no marketplace is required:

    gh skill install markgar/quire quire --scope user

Reload skills in an active Copilot CLI session with `/skills reload`, then ask
it to use `/quire` to create or revise a presentation.

The skill has an opt-in end-to-end test that installs it into a temporary
project, starts a fresh Copilot context, and checks the deck the agent creates:

    npm run test:skill

This test makes a live agent call, so it is intentionally separate from
`npm test`. Set `QUIRE_SKILL_TEST_KEEP=1` to preserve the temporary project for
inspection, or `QUIRE_SKILL_TEST_MODEL=<model>` to pin the evaluation model.

Decks can also be built headlessly, which produces one HTML file containing
the runtime and exact source for someone who does not have the app:

    node src/cli.js out.html deck.md

### Deploy

The public viewer runs on Azure Static Web Apps. After signing in with the Azure
CLI and selecting the subscription that contains `rg-quire/quire-markgar`:

    az login
    az account set --subscription <subscription>
    npm run deploy:azure

The command runs all checks, stages only the deployable app as `index.html`,
retrieves the deployment credential through `az`, and passes it to the deployer
through the process environment. No Azure credential is stored in the
repository or exposed as a command-line argument.

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

`npm run typecheck` runs `tsc --noEmit` over `src/`, `test/` and `tools/`, with
`strict` and `checkJs` on. One file is excluded — `src/nav.js`, a standalone
browser IIFE — and `tsconfig.json` says so rather than leaving it implicit. It is the same checker and the same guarantees a
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
| `test/app-harness.html` | The browser paths `npm run check` cannot reach |

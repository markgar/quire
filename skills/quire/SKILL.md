---
name: quire
description: Author, revise, and review presentations written in Quire source. Use when creating a Quire deck, editing a .md presentation for Quire, or translating presentation content into Quire's slide patterns.
license: MIT
---

# Quire presentation authoring

Quire source is a focused presentation dialect stored in `.md` files. It
borrows familiar Markdown-shaped syntax, but its constructs map to specific
slide layouts. Do not assume unsupported general Markdown behavior.

When creating or revising a deck:

1. Write clear, concise presentation content before adding layout hints.
2. Use the smallest Quire construct that expresses the intended slide.
3. Keep one idea per slide and prefer readable cards, rows, or tables over dense prose.
4. Keep a deck in its own directory with its related images and source material.
5. Preserve existing metadata and intentional raw HTML when editing a deck.
6. Treat raw HTML as executable content and use it only in trusted decks.

Deliver one native `.quire` deck. It is a ZIP package containing `deck.md`,
normal image files, and `manifest.json`; the user opens and shares that one
file. Do not create a duplicate “standalone” Markdown file with base64 images.

During authoring, keep `deck.md` and its relative assets together. Use the
`quire-package.mjs` helper beside this skill file, substituting the installed
skill directory for `<skill-dir>`:

```text
node <skill-dir>/quire-package.mjs pack deck.md deck.quire
```

To revise an existing package, unpack it, edit its ordinary files, and repack:

```text
node <skill-dir>/quire-package.mjs unpack deck.quire work-directory
node <skill-dir>/quire-package.mjs pack work-directory/deck.md deck.quire
```

Use data URLs in Markdown only when the raw source itself must be independently
portable. Quire embeds packaged images automatically when standalone HTML is
requested.

## Editing native `.quire` decks

Never edit ZIP bytes or base64 representations directly. The bundled
`quire-package.mjs` helper is Quire's standard container-access tool, so using
it does not require separate user approval.

For a new deck:

1. Create a temporary working directory containing `deck.md` and its relative
   image files.
2. Author and review those ordinary files.
3. Pack them into the requested `.quire` destination.
4. Open the `.quire` file in Quire and use `quireFit` to verify every slide.

For an existing deck:

1. Unpack the `.quire` file into a dedicated working directory.
2. Edit `deck.md` and assets there; do not change `manifest.json` manually.
3. Repack to the original `.quire` path only after the edits are complete.
4. Reopen or refresh the package and verify the result.

Packing discovers relative `image:` settings, includes those files at the same
paths, records their media types, and refuses unsafe traversal paths. If a
referenced image is missing, fix the source or asset rather than replacing it
with an unrelated placeholder.

### Additional structural tooling still requires a decision

The package helper manages the container; it does not interpret or rewrite
slides. For large decks, duplicate titles, slide reordering, repeated
structures, or broad multi-slide changes, direct text editing may still be
unreliable.

Before creating or running any additional generated command, one-liner, script,
or program that interprets slide boundaries or rewrites slides, explain the
need and ask the user whether to continue carefully with direct edits or build
a general-purpose Quire deck access tool. Wait for an explicit answer before
proceeding. Test any approved structural tool against a representative Quire
fixture with known results before using it on the user's deck.

## Structural rule: settings come first

Slide settings are positional. Put every setting immediately after the
slide-opening `---` and before the slide heading or any other content. This
includes `eyebrow:`, `layout:`, `hidden:`, `numbered:`, `badge:`, and every
image, chart, diagram, source, tone, or alignment setting described below. A
setting written after the heading is ordinary visible text and will not
configure the slide.

## Document

A file may begin with document metadata:

```text
---
title: Deck title
theme: light
---
```

Use `theme: light` or `theme: dark` so the deck carries its intended appearance.
The viewer’s **T** shortcut previews the other theme temporarily; it does not
edit the source file.

## Slides

```text
---                         Start the next slide; it is not a visible rule.
# Headline                  Create a title-slide headline.
## Slide title              Create a standard slide title.
First paragraph             Add a subtitle or framing line.
```

## Cards and groups

```text
### Card heading            Create a card (a visual box).
Card body                   Continue until the next heading or block.
### Key card {accent}       Emphasize the card.
group: Label                Start a labelled group of following cards.
```

When `numbered: true` is set, Quire adds card numbers during rendering. Do not
also type numbers into the `###` card headings.

## Rows and tables

```text
1. **Question?** Answer     Create a row; unordered items work too.

| Column | Column |         Create a comparison table.
|---|---|
| Value | Value |
```

## Native visuals

Use native visual settings before reaching for raw HTML:

```text
layout: metrics             Render cards as large values and labels.
image: ./images/image.png   Add an image from the deck folder.
image-alt: Description      Describe meaningful images.
image-position: right       Place it left, right, or full-width below content.
image-fit: contain          Preserve the whole image; cover crops to fill.
caption: Caption text       Add an image caption.
credit: Credit text         Add an image credit.
chart: bar                  Render a table as bar, line, or donut.
diagram: process            Render rows as process, timeline, or hierarchy.
source: [Label](URL)         Add attribution at the bottom.
tone: accent                Use accent or contrast emphasis.
align: center               Center heading and framing text.
```

Charts use the first two columns of a pipe table as labels and values. Diagrams
use one ordered or unordered list as a single multi-node visual: row questions
become node headings, answers become descriptions, and Quire equalizes process
node heights automatically. Metric slides use each `###` heading as the value
and its body as the label; Quire automatically scales each value to fit its own
metric card.

Images can accompany title, card, metric, table, row, chart, diagram, and
pull-quote layouts; they do not replace the layout content. Use
`image-fit: contain` when faces, labels, or other edge content must not be
cropped. Prefer `image-position: left` or `right` for portraits and other
subject-focused images. Reserve `image-position: full` for genuinely wide
images that benefit from a panoramic band.

Keep relative images beside the working source and package them into the final
`.quire` file. A single `.md` still opens, but it cannot carry sibling assets.

## Verify the rendered deck

Use Quire's own browser measurements after every meaningful revision:

```text
quireFit.report()       Return every slide's measured height and overflow.
quireFit.overflowing()  Return only slides that overflow.
quireFit.remeasure()    Measure again after changing the live DOM.
```

The viewer also records overflow on affected slides as `data-over` and exposes
the same result through its overflow badge. Do not toggle `.active`, clone
slides, or calculate slide heights independently. Those actions change the
layout being measured and can return a false clean result.

## Verify the rendered deck

Use Quire's own browser measurements after every meaningful revision:

```text
quireFit.report()       Return every slide's measured height and overflow.
quireFit.overflowing()  Return only slides that overflow.
quireFit.remeasure()    Measure again after changing the live DOM.
```

The viewer also records overflow on affected slides as `data-over` and exposes
the same result through its overflow badge. Do not toggle `.active`, clone
slides, or calculate slide heights independently. Those actions change the
layout being measured and can return a false clean result.

## Quotes and closers

```text
> A leading quote           Start a pull-quote slide.

## Closing thought          Keep a block after the leading quote.

> **Takeaway:** Text        Add a bottom note.

> [!ASIDE] Text             Add a bottom kicker.
```

A quote is a pull quote only when another content block follows it. A quote at
the end of a slide is a closer instead. Leave a blank line between a note and a
kicker.

## Slide settings

Settings must be the first lines of a slide, before its heading:

```text
---
numbered: true

## Three priorities

### First priority
What matters first.

### Second priority
What follows.
```

Supported layouts are `title`, `cards2`, `cards3`, `groups`, `table`, `rows`,
`pull`, and `blank`. `eyebrow: Label` adds a section label, `layout: cards2`
forces a layout, `hidden: true` removes a slide from normal navigation,
`numbered: true` numbers cards, and `badge: Text` adds a badge to a rows slide.

## Inline content

`**bold**`, `*italic*`, `` `code` ``, and `[label](URL)` links are supported.
Raw HTML passes through unchanged and is executable content.

When working inside the Quire repository, consult `SPEC.md` for the normative
format and `test/fixtures/` for complete examples.

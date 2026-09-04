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
4. Keep the deliverable as one `.quire` file and add images through the CLI.
5. Preserve existing metadata and intentional raw HTML when editing a deck.
6. Treat raw HTML as executable content and use it only in trusted decks.

Deliver and maintain one native `.quire` deck. It is a ZIP package containing
Quire source, normal image files, and a manifest, but those internals are owned
by Quire's CLI. Do not create an unpacked deck directory or a duplicate
standalone Markdown deck.

## Editing native `.quire` decks

Use the bundled `quire-package.mjs` beside this skill file for every creation,
inspection, validation, slide mutation, metadata mutation, and asset mutation.
Substitute the installed skill directory for `<skill-dir>`.

For a new deck:

```text
node <skill-dir>/quire-package.mjs create deck.quire --title "Deck title" --theme dark
node <skill-dir>/quire-package.mjs slides replace deck.quire 1 --content "# Deck title"
node <skill-dir>/quire-package.mjs validate deck.quire
```

Pass longer slide source through standard input so shell quoting cannot alter
it:

```text
node <skill-dir>/quire-package.mjs slides insert deck.quire 2 --stdin
```

Useful commands:

```text
node <skill-dir>/quire-package.mjs inspect deck.quire
node <skill-dir>/quire-package.mjs slides list deck.quire
node <skill-dir>/quire-package.mjs slides read deck.quire 3
node <skill-dir>/quire-package.mjs slides replace deck.quire 3 --stdin
node <skill-dir>/quire-package.mjs slides insert deck.quire 4 --stdin
node <skill-dir>/quire-package.mjs slides move deck.quire 4 2
node <skill-dir>/quire-package.mjs slides remove deck.quire 4
node <skill-dir>/quire-package.mjs metadata set deck.quire theme light
node <skill-dir>/quire-package.mjs assets add deck.quire photo.jpg images/photo.jpg
node <skill-dir>/quire-package.mjs assets replace deck.quire new.jpg images/photo.jpg
node <skill-dir>/quire-package.mjs assets remove deck.quire images/photo.jpg
node <skill-dir>/quire-package.mjs validate deck.quire
```

Selectors are one-based slide numbers or exact headings. If an exact heading is
duplicated, the CLI refuses to guess and requires a number. Every mutation
parses the resulting source, verifies referenced assets, writes a temporary
package, reopens it, verifies the round trip, and only then atomically replaces
the `.quire` file. An invalid operation leaves the original bytes unchanged.

Never edit ZIP bytes, `manifest.json`, embedded `deck.md`, or slide separators
directly. Do not unpack a deck as an authoring workflow. The CLI is Quire's
approved structural tool and does not require separate user permission.

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

Add relative images directly to the `.quire` package with `assets add`, then
reference the same normalized package path from the slide. A standalone `.md`
still opens for compatibility, but it is not the authoring deliverable.

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

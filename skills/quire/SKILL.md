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

Relative image paths work when the deck and assets are served from the same
origin. When a user opens a `.md` file directly from disk, the browser cannot
read sibling files automatically, so embed the image as a data URL instead.
Embed images when the exported HTML must remain fully self-contained.

## When direct editing becomes difficult

While working with Quire source, watch for situations where ordinary text
search and direct editing may be unreliable—for example, large decks, duplicate
titles, repeated structures, slide reordering, or changes spanning several
slides.

If one of these problems actually affects the requested work, explain the
difficulty to the user and discuss possible approaches. Options might include
continuing carefully with direct edits or creating a general-purpose Quire deck
access tool that understands slides as structured units. Such a tool could help
an agent identify, list, read, replace, insert, move, remove, or validate slides
without depending on text search for each operation.

### User decision required before structural tooling

A request to edit a deck authorizes the content change, not the creation or use
of parsing or manipulation code. If you are considering any generated command,
one-liner, script, or program that interprets slide boundaries or rewrites
slides, do not run it yet.

First explain why direct editing may be unreliable, present the relevant
choices and tradeoffs, and ask the user which approach they want. One choice
may be careful direct editing. Another may be a general-purpose Quire deck
access tool. Wait for an explicit answer before proceeding with tooling.

This applies whether the proposed code would be temporary or persistent.
Moving, reordering, or changing many slides in a large deck is a structural
operation that should trigger this discussion. Do not substitute a
task-specific reorder or transformation script without asking.

A general-purpose deck access tool might expose an interface conceptually like
this:

```text
deck = openQuire(path)
deck.listSlides()                  -> number, title, layout, source range
deck.readSlide(selector)           -> structured slide and original source
deck.replaceSlide(selector, source)
deck.insertSlide(position, source)
deck.moveSlide(selector, position)
deck.removeSlide(selector)
deck.validate()
deck.write()
```

This is illustrative rather than a required implementation. The important
distinction is that the tool provides structured access to the deck for many
operations instead of encoding only the current requested transformation.

If the user chooses to build tooling, test it against a representative Quire
fixture with known results before using it on their deck.

If the requested edit is already clear and safely scoped, proceed normally
without raising tooling concerns.

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
image: ./image.png          Add a same-origin or embedded image.
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
use row questions as node headings and answers as descriptions. Metric slides
use each `###` heading as the value and its body as the label.

Images can accompany title, card, metric, table, row, chart, diagram, and
pull-quote layouts; they do not replace the layout content. Use
`image-fit: contain` when faces, labels, or other edge content must not be
cropped.

Relative image paths work only when the deck directory is served beside Quire.
If the user will choose the `.md` file directly in quiredeck.com, embed raster
images as data URLs so the browser does not try to load them from the site.

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

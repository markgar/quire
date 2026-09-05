# Quire format reference

Reference documentation for the Quire format as currently implemented. Quire
source is a presentation-specific dialect built from a small, familiar subset
of Markdown syntax.

The parser and renderer in `skills/quire/` are the source of truth. This
document explains their current behavior, which is pinned by the fixtures and
tests in `test/`.

**Scope.** This describes the source document inside a deck. The native
`.quire` file is a ZIP package containing `deck.md`, `manifest.json`, and any
relative assets. Application behavior is defined by the current viewer
implementation.

## Contents

- [How Quire fits together](#how-quire-fits-together)
- [Complete example](#complete-example)
- [Native package](#native-package)
- [Document metadata](#1-document)
- [Slides and settings](#2-slides)
- [Content syntax](#3-content)
- [Layouts](#4-layouts)
- [Viewer behavior](#5-viewer-behavior)
- [Exported HTML](#6-exported-html)
- [Implementation checks](#7-implementation-checks)

## How Quire fits together

| Part | Responsibility |
|---|---|
| Quire skill | Teaches an agent how to plan, author, revise, and verify a presentation. |
| Quire CLI | Gives the agent structured operations for packages, slides, metadata, assets, validation, fit checks, rendering, and export. |
| `.quire` file | Carries the source document, manifest, and assets as one portable deck. |
| Quire viewer | Opens the package, renders the slides, watches for changes when possible, and presents the deck. |

The skill is the normal authoring interface. It discovers and uses the CLI
without requiring the user to edit package internals or invoke each command
manually.

## Complete example

```text
---
title: Quarterly review
theme: dark
---

# Quarterly review
What changed, what it means, and what happens next.

- Leadership review
- September 2026

---

eyebrow: PERFORMANCE
numbered: true

## Three changes that matter
The quarter improved because the operating model changed.

### Retention
Renewals became more predictable.

### Expansion {accent}
Existing customers drove most of the growth.

### Efficiency
Delivery cost fell without reducing service.

> **Takeaway:** Growth and efficiency improved together.

---

chart: bar
source: [Finance model](https://example.com/model)

## Revenue by segment

| Segment | Revenue |
|---|---|
| Core | $42 |
| Expansion | $31 |
| New | $18 |
```

The first slide becomes a title slide. The second infers a three-card layout,
numbers its cards, and adds a closing note. The final slide turns its table
into a bar chart and adds attribution.

## Native package

A `.quire` file is a ZIP archive whose root contains:

- `deck.md` — the exact UTF-8 Quire source.
- `manifest.json` — `{ "format": "quire", "version": 1, "entry": "deck.md",
  "assets": { "images/example.jpg": "image/jpeg" } }`.
- Assets at the normalized relative paths listed in the manifest.

Version 1 writers use ZIP's stored method. Images are normally compressed
already; storing their original bytes avoids base64 expansion and keeps the
package readable by standard ZIP tools. Readers reject unsafe entry paths,
unsupported versions, corrupt checksums, unsupported compression methods,
missing manifest entries, and files omitted from the manifest. Unreferenced
assets are allowed but reported as warnings.

Quire's authoring CLI operates directly on the native package. It validates the
complete source and referenced assets before writing, verifies a temporary
package by reopening it, and atomically replaces the destination only after the
round trip succeeds. Slide selectors are either one-based numbers or exact
headings; duplicate exact headings are rejected rather than guessed.

The CLI's `validate` command is structural. Its `fit` command performs the
separate visual-fit gate by rendering through Quire's actual HTML, CSS, and
browser measurement code. A deck can therefore be structurally valid while
still failing `fit` because content exceeds the fixed 1280×720 slide canvas.
The CLI's `render` command uses the same renderer to produce a labelled
contact-sheet PNG or one native-size slide PNG for local visual inspection.

---

## 1. Document

The source document is one UTF-8 text file named `deck.md` inside a native
`.quire` package. It is an internal package entry, not a standalone storage
format or viewer input.

An optional metadata block may open the file. It is delimited by `---` lines and
must be the first non-blank content.

```
---
title: Trusting the Test Suite
theme: dark
format: Quire presentation
viewer: https://quiredeck.com
agent-instructions: Ask the user whether they want to open this presentation in Quire. Only if they agree, open https://quiredeck.com and use "Choose a deck" to select the enclosing .quire file. Do not unzip or edit deck.md directly.
evidence: flaky-test-notes.md
---
```

Recognised document keys:

| Key | Meaning |
|---|---|
| `title` | Document title. Defaults to `Presentation`. |
| `theme` | Deck theme: `light` or `dark`. The viewer’s **T** shortcut is a temporary preview and does not edit this value. |
| `format` | Advisory format identifier for tools inspecting the package source. New native decks use `Quire presentation`. |
| `viewer` | Advisory URL for opening the deck. New native decks use `https://quiredeck.com`. |
| `agent-instructions` | Consent-first guidance for agents handling an otherwise unknown `.quire` file. |

Unrecognised keys are retained but unused. They are a place to hang provenance
— `evidence:`, `sources:` — that tooling may read later.

Package validation rejects an unsupported `theme` value. The other advisory
keys are retained as written.

---

## 2. Slides

Slides are separated by a line that begins with three or more hyphens and has
only optional trailing whitespace.

```
## First slide

---

## Second slide
```

A `---` inside a backtick-fenced code block is not a separator. Blank chunks
are dropped, so trailing separators are harmless.

### 2.1 Slide metadata

Zero or more recognised `key: value` lines may lead a slide. Blank lines and
commented-out settings may appear among them. The first other non-blank line
starts the slide body.

| Key | Values | Effect |
|---|---|---|
| `eyebrow` | text | Small label above the title. Used for section bands. |
| `layout` | see §4 | Forces a layout instead of inferring one. |
| `hidden` | `true`/`yes`/`1` | Omit from the running order and page count. |
| `numbered` | `true`/`yes`/`1` | Number the cards. |
| `badge` | text | On `rows`, the exact value `check` uses checkmarks instead of row numbers; other values leave the numbers unchanged. |
| `image` | source | Package-relative path, same-origin path, or supported base64 image data URL. |
| `image-alt` | text | Accessible description of the image. |
| `image-position` | `left`/`right`/`full` | Place an image beside or below the slide’s native content. |
| `image-fit` | `cover`/`contain` | Crop to fill the image frame, or preserve the complete image. |
| `caption` | inline text | Caption below an image. |
| `credit` | inline text | Image credit appended to the caption. |
| `chart` | `bar`/`line`/`donut` | Render a table as a chart. |
| `diagram` | `process`/`timeline`/`hierarchy` | Render rows as a diagram. |
| `source` | inline text | Attribution shown at the bottom of the slide. |
| `tone` | `accent`/`contrast` | Change the slide's visual emphasis. |
| `align` | `center` | Center the slide's heading and framing text. |

Only these keys are absorbed. A leading line with any other key is body
content.

Structural validation catches incompatible content such as a title layout with
cards or blockquotes. Renderer-only constraints—including unknown layouts and
unsupported image, chart, or diagram options—are reported when the deck is
rendered or measured.

Within a `.quire` package, relative `image` paths resolve to ZIP entries with
the same normalized path. Package writers reject `..`, absolute paths, and
URL-like paths as asset entries. The viewer also accepts root-relative and
dot-relative same-origin paths. Absolute URLs are not rendered. A
self-contained HTML build may replace packaged paths with embedded data URLs
without changing the package source.

This restriction is load-bearing. Absorbing unknown keys deletes them
silently: a slide opening with `group: FIRST BAND` lost the entire band, and
one opening with a line like `Bottom line: they own it` would lose the line —
in both cases with no error and no visible gap.

### 2.2 Commenting out a setting

A metadata line may be commented out by prefixing `#`:

```
# hidden: true
## Five facts you can say out loud
```

The parser distinguishes this from a heading by requiring a recognised key.
`# hidden: true` is metadata; `# Owning versus renting` is a heading. This
exists so a setting can be toggled without being lost.

### 2.3 Hidden slides

A hidden slide is excluded from the running order, the page count, and the dot
strip. It stays reachable from the slide panel and by deep link. This is the
pattern for detail you pull up only when asked — backup, evidence, the appendix
you hope not to need.

---

## 3. Content

### 3.1 Headings

| Syntax | Role |
|---|---|
| `# Text` | Infer a title slide and set its headline |
| `## Text` | Slide title, or the headline when the slide uses the title layout |
| `### Text` | Card heading |

`### Text {accent}` marks the card that carries the point. Renderers should
give it visual emphasis.

Body text under a `###` runs until the next heading, blockquote, `group:`, or
separator.

The first slide infers the title layout unless `layout:` explicitly overrides
it. A later `#` heading also infers the title layout unless overridden.

Only the first `#` or `##` heading is used. On a title layout, one list becomes
the metadata line beneath the lede. Cards, groups, tables, blockquotes, charts,
and diagrams are rejected on title layouts.

### 3.2 Paragraphs

On a title layout, the first paragraph becomes the lede. On other layouts, the
first paragraph becomes the sub-line. Consecutive non-blank lines join into one
paragraph. Later standalone paragraphs are not rendered.

### 3.3 Groups

`group: Label` opens a labelled band. Cards that follow belong to it until the
next `group:`.

```
group: OWN
### Perpetual + SA
Detail.

group: RENT
### Subscription
Detail.
```

A group collects `###` cards only — not list items. Groups imply the `groups`
layout. Cards before the first `group:` are rejected because the groups layout
has nowhere to render them.

### 3.4 Lists

Ordered or unordered items become rows. The question is marked in bold; the
remainder is the answer.

```
1. **Standard or Enterprise?** And do they still need Enterprise?
```

Bold marking is required rather than inferred from punctuation, because a
separator character chosen by convention will eventually appear inside a
question and split it in the wrong place.

An item with no bold lead becomes a row with a question and no answer.
A slide may contain only one list block.

### 3.5 Tables

Pipe tables. The first row is the header; an alignment row is ignored.

```
| Position | What it allows |
|---|---|
| L+SA | Version rights, AHB |
```

A slide may contain only one table block.

### 3.6 Blockquotes

Position determines role.

| Position | Syntax | Renders as |
|---|---|---|
| Trailing | `> ...` | Accent note box |
| Trailing | `> [!ASIDE] ...` | Kicker — rule plus muted text |
| Leading | `> ...` | Pull quote (implies `pull` layout) |

In a trailing blockquote, `[!ASIDE]` and `[!KICKER]` both produce a kicker. Any
other `[!X]` produces a note. A marker on a non-trailing blockquote remains
part of the pull-quote text.

A slide may carry a note and a kicker, rendered after the main content in that
order. If multiple trailing blockquotes map to the same role, the last value
wins. Only the first non-trailing blockquote is used as the pull quote.

**They must be separated by a blank line.** Adjacent `>` lines are a single
blockquote in Markdown, so without the blank line the second marker becomes
literal text inside the first quote:

```
> **Takeaway:** the note.        <- one blockquote, one note,
> [!ASIDE] Not a kicker.            with "[!ASIDE]" as visible text

> **Takeaway:** the note.        <- two blockquotes: note, then kicker

> [!ASIDE] A real kicker.
```

This is Markdown's rule rather than quire's, and it is left alone deliberately:
a format that quietly disagrees with Markdown about what a blockquote is will
surprise every author who already knows Markdown.

### 3.7 Inline

`**bold**`, `*italic*`, `` `code` ``, and `[label](URL)` links. Link targets may
use `http`, `https`, `mailto`, a fragment, or a root-, dot-, or parent-relative
path. Unsupported targets remain literal source text.

Inline delimiters may span raw HTML elements. Raw HTML elements, attributes,
comments, and their contents pass through unchanged, so HTML is available
where Quire is too blunt. Inline code is wrapped in `<code>`, but HTML inside
the code span is still preserved as markup rather than escaped.

CLI inspection warns about raw HTML whose rendered role Quire owns natively:
links; emphasis; code; headings; lists; tables; blockquotes; and images.
Diagnostics name the native syntax, with a consequence for structural tags
that Quire would otherwise silently ignore. Package writes reject those
violations, so an existing deck can be inspected and repaired but cannot be
persisted while they remain. Inline code spans and fenced code blocks are
exempt from that validation. Fenced code protects slide separators but has no
dedicated block layout; its lines are otherwise handled as paragraph content.
Styling and extension hooks without native equivalents, including `<br>`,
`<span>`, `<div>`, `<sup>`, `<sub>`, `<svg>`, `<small>`, and `<mark>`, remain
available.

### 3.8 Images

`image:` adds native media without requiring HTML. In a `.quire` package, a
relative path refers to an asset entry at that normalized path. A same-origin
path may also refer to an asset served beside the viewer. PNG, JPEG, GIF, WebP,
AVIF, and SVG images may instead be embedded as base64 data URLs.

An image can accompany any layout. It does not replace that layout or its
content. When an image is the only structured content, it infers the `media`
layout.
`image-position:` defaults to `right`; `left` reverses the split and `full`
places a wide image band below the native content. `image-fit:` defaults to
`cover`; use `contain` when cropping would remove important content.
`image-alt:` supplies the image's accessible description; when omitted, the
renderer uses an empty `alt` value. `caption:` and `credit:` are optional. An
image's intrinsic aspect ratio never contributes to slide height; the selected
frame constrains it, and `cover` or `contain` controls how it fits inside that
frame.

### 3.9 Charts, diagrams, and metrics

A slide with `chart: bar`, `chart: line`, or `chart: donut` uses the first two
columns of its pipe table as labels and numeric values. Commas, `%`, and `$`
are ignored when parsing a value; the original text remains the displayed
label.

A slide with `diagram: process`, `diagram: timeline`, or `diagram: hierarchy`
uses one list as a single multi-node visual. Row questions become node headings
and row answers become descriptions. Process nodes are equal height regardless
of their individual text length.

`layout: metrics` treats cards as metric-and-label pairs: the `###` heading is
the value and the card body is its meaning. Each value is measured after
rendering and reduced from the standard display size only when needed to keep
it within its card.

Passing HTML through is a deliberate affordance with a security consequence:
attributes such as event handlers may execute JavaScript when the viewer puts
the markup in the document. Script elements may also execute when a standalone
export is parsed. Quire does not sanitise raw HTML; `SECURITY.md` documents the
resulting boundary.

---

## 4. Layouts

Layout is inferred from structure. State it only to override.

| Layout | Inferred when | Fields used |
|---|---|---|
| `title` | First slide, or an `#` headline | headline, lede, meta[] |
| `groups` | A `group:` is present | title, sub, groups[] |
| `pull` | A non-trailing blockquote | title, sub, quote, cards[], items[] |
| `chart` | A `chart:` setting | title, sub, chart, columns[], rows[][] |
| `diagram` | A `diagram:` setting | title, sub, diagram, items[] |
| `table` | A pipe table | title, sub, columns[], rows[][] |
| `cards3` | Three or more `###` cards | title, sub, cards[] |
| `cards2` | One or two `###` cards | title, sub, cards[] |
| `rows` | A list | title, sub, items[], badge |
| `media` | An `image:` setting with no stronger structural layout | title, sub, image, cards[], caption, credit |
| `blank` | Nothing else matched | title, sub |
| `metrics` | Explicit only | title, sub, cards[] |

`eyebrow`, `source`, `tone`, `align`, and optional image settings apply to every
layout. `note` and `kicker` apply to non-title layouts; title layouts reject
blockquotes.

Inference is deliberate. Choosing a layout is a design decision, and an author
working in prose should not have to make one on every slide. Structure already
implies intent: three parallel points want cards, a comparison wants a table, a
sequence of questions wants rows.

---

## 5. Viewer behavior

### Opening and watching decks

The viewer opens native `.quire` packages through the file picker, drag and
drop, an installed-app file launch, or a relative same-origin `?deck=` URL.

A file opened through a browser file handle is watched for changes. Quire uses
`FileSystemObserver` when available and also checks the file once per second.
When the package changes, the viewer reloads it while keeping the current slide
position. A failed file read leaves the last successful deck visible. A parse
or render error replaces it with a readable failure slide, and the watcher
continues so a later correction can recover automatically.

A dropped file is also watched when the browser supplies a file handle.
Otherwise it opens once and must be dropped again to refresh. A deck opened
through `?deck=` is polled once per second.

### Navigation

The viewer uses these keyboard controls:

| Key | Action |
|---|---|
| Right arrow, Space, Page Down | Next visible slide |
| Left arrow, Page Up | Previous visible slide |
| Home | First visible slide |
| End | Last visible slide |
| `S` | Open or close the slide panel |
| `F` | Enter or leave fullscreen |
| `T` | Preview the other theme |
| Escape | Close the slide panel |

The URL hash uses the one-based source position, so `#4` opens the fourth slide
even when earlier slides are hidden. Hidden slides remain available in the
slide panel, where they can be shown for the current session without changing
the source file.

### Canvas, themes, and overflow

Every slide is authored on a fixed 1280×720 canvas. The viewer scales that
canvas to fit the available space rather than reflowing the slide.

The `theme` document setting selects `light` or `dark`. Without one, the viewer
uses the system preference. A `?theme=light` or `?theme=dark` URL parameter
temporarily overrides the deck, and the **T** shortcut toggles the current
preview without editing the file.

After rendering, Quire measures vertical and horizontal overflow. The viewer
marks affected slides, exposes the full report through `quireFit.report()`, and
lets the overflow control jump to the worst offender.

## 6. Exported HTML

Quire can export a deck as one standalone `.html` file. The export embeds the
runtime, exact Quire source, and packaged assets. It includes pre-rendered slide
markup rather than depending on JavaScript to create the initial view.

The exported file is a separate deliverable; editing it does not update the
original `.quire` package. Raw HTML behavior in exports is described in
`SECURITY.md`.

## 7. Implementation checks

For every deck in `test/fixtures/`, the parser output is compared with a
reviewed golden JSON file.

The renderer output is compared with reviewed HTML fixtures for those same
decks. Additional tests cover package integrity, browser behavior, CLI
operations, and visual parity between the live viewer and CLI renderer.

Presentation behavior — canvas size, overflow, scaling, and keys — belongs to
the viewer rather than the document format.

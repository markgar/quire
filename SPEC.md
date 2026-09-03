# The quire format

Normative description of Quire source—a presentation-specific dialect built
from a small, familiar subset of Markdown syntax. A conforming parser reads
this and produces the same deck.

Everything here is implemented in `src/deck.js` and pinned by the fixtures in
`test/`.

**Scope.** This describes the document format. Application behavior is defined
by the current viewer implementation.

---

## 1. Document

A deck is one UTF-8 text file, conventionally using the `.md` extension.

An optional metadata block may open the file. It is delimited by `---` lines and
must be the first non-blank content.

```
---
title: Trusting the Test Suite
theme: dark
evidence: flaky-test-notes.md
---
```

Recognised document keys:

| Key | Meaning |
|---|---|
| `title` | Document title. Defaults to `Presentation`. |
| `theme` | Deck theme: `light` or `dark`. The viewer’s **T** shortcut is a temporary preview and does not edit this value. |

Unrecognised keys are retained but unused. They are a place to hang provenance
— `evidence:`, `sources:` — that tooling may read later.

---

## 2. Slides

Slides are separated by a line of three or more hyphens.

```
## First slide

---

## Second slide
```

A `---` inside a fenced code block is not a separator. Blank chunks are dropped,
so trailing separators are harmless.

### 2.1 Slide metadata

Zero or more `key: value` lines may lead a slide. They must come before any
content. The block ends at the first line that is blank-then-content, or that
begins with `#`, `>`, `|`, `-`, or `*`.

| Key | Values | Effect |
|---|---|---|
| `eyebrow` | text | Small label above the title. Used for section bands. |
| `layout` | see §4 | Forces a layout instead of inferring one. |
| `hidden` | `true`/`yes`/`1` | Omit from the running order and page count. |
| `numbered` | `true`/`yes`/`1` | Number the cards. |
| `badge` | text | Corner label on `rows` layouts. |
| `image` | URL | Same-origin path or embedded raster data URL. |
| `image-alt` | text | Accessible description of the image. |
| `image-position` | `left`/`right`/`full` | Placement in a `media` layout. |
| `caption` | inline text | Caption below an image. |
| `credit` | inline text | Image credit appended to the caption. |
| `chart` | `bar`/`line`/`donut` | Render a table as a chart. |
| `diagram` | `process`/`timeline`/`hierarchy` | Render rows as a diagram. |
| `source` | inline text | Attribution shown at the bottom of the slide. |
| `tone` | `accent`/`contrast` | Change the slide's visual emphasis. |
| `align` | `center` | Center the slide's heading and framing text. |

Only these keys are absorbed. A leading line with any other key is body
content.

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
| `# Text` | Title-slide headline |
| `## Text` | Slide title |
| `### Text` | Card heading |

`### Text {accent}` marks the card that carries the point. Renderers should
give it visual emphasis.

Body text under a `###` runs until the next heading, blockquote, `group:`, or
separator.

### 3.2 Paragraphs

The first paragraph after a `##` becomes the slide's sub-line. Consecutive
non-blank lines join into one paragraph.

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
layout.

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

### 3.5 Tables

Pipe tables. The first row is the header; an alignment row is ignored.

```
| Position | What it allows |
|---|---|
| L+SA | Version rights, AHB |
```

### 3.6 Blockquotes

Position determines role.

| Position | Syntax | Renders as |
|---|---|---|
| Trailing | `> **Takeaway:** ...` | Accent note box |
| Trailing | `> [!ASIDE] ...` | Kicker — rule plus muted text |
| Leading | `> ...` | Pull quote (implies `pull` layout) |

`[!ASIDE]` and `[!KICKER]` both produce a kicker. Any other `[!X]` produces a
note.

A slide may carry a note and a kicker, in that order. Both are bottom-anchored.

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

`**bold**`, `*italic*`, `` `code` ``, and `[label](URL)` links. Raw HTML elements, attributes, comments,
and their contents pass through unchanged, so HTML is available where Quire
is too blunt.

### 3.8 Images

`image:` adds native media without requiring HTML. A same-origin path may refer
to an asset served beside the deck. A raster image may instead be embedded as a
`data:image/...;base64,...` URL, which also works when the deck source is opened
directly from disk. Browsers do not grant a picked `.md` file access to sibling
files. Relative paths are resolved from the deck's directory when it is loaded
through a same-origin `?deck=` URL. Embed images when an exported HTML file must
remain self-contained.

`image-position:` defaults to `right`. `left` reverses the split and `full`
gives the image the body of the slide. `image-alt:` is required for meaningful
images; `caption:` and `credit:` are optional.

### 3.9 Charts, diagrams, and metrics

A slide with `chart: bar`, `chart: line`, or `chart: donut` uses the first two
columns of its pipe table as labels and numeric values.

A slide with `diagram: process`, `diagram: timeline`, or `diagram: hierarchy`
uses row questions as node headings and row answers as descriptions.

`layout: metrics` treats cards as metric-and-label pairs: the `###` heading is
the value and the card body is its meaning.

Passing HTML through is a deliberate affordance and it has a security
consequence that belongs in the format's definition rather than only in the
viewer's: **a deck is executable content.** A renderer that puts deck output in
a live document is running the deck author's markup, including event handlers.
A conforming implementation should either sanitise deliberately or state, as
this one does in `SECURITY.md`, that decks are to be treated like scripts.

---

## 4. Layouts

Layout is inferred from structure. State it only to override.

| Layout | Inferred when | Fields used |
|---|---|---|
| `title` | First slide, or an `#` headline | headline, lede, meta[] |
| `groups` | A `group:` is present | title, sub, groups[] |
| `pull` | A leading blockquote | title, sub, quote |
| `table` | A pipe table | title, sub, columns[], rows[][] |
| `cards3` | Three or more `###` cards | title, sub, cards[] |
| `cards2` | One or two `###` cards | title, sub, cards[] |
| `rows` | A list | title, sub, items[], badge |
| `metrics` | Explicit | title, sub, cards[] |
| `media` | An `image:` setting | title, sub, image, cards[], caption, credit |
| `chart` | A `chart:` setting | title, sub, chart, columns[], rows[][] |
| `diagram` | A `diagram:` setting | title, sub, diagram, items[] |
| `blank` | Nothing else matched | title, sub |

`eyebrow`, `note`, `kicker`, `source`, `tone`, and `align` apply to every layout.

Inference is deliberate. Choosing a layout is a design decision, and an author
working in prose should not have to make one on every slide. Structure already
implies intent: three parallel points want cards, a comparison wants a table, a
sequence of questions wants rows.

---

## 5. Conformance

A parser conforms if, for every deck in `test/fixtures/`, it produces slides
whose titles, order, hidden flags, and layouts match the golden parse.

A renderer conforms if it produces the same HTML fragment as the reference for
those same fixtures.

Presentation behavior — canvas size, overflow, scaling, and keys — belongs to
the viewer rather than the document format.

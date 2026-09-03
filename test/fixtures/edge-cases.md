---
title: Edge cases
provenance: hand-written to cover paths a written-to-be-read deck never touches
---

# Title slide with meta

The lede paragraph.

- Audience: parser
- Format: fixture

---

layout: title
eyebrow: FORCED

# Forced title, not first

A title slide reached by layout, not by position.

---

## Blank layout

Nothing but a title and this sub-line, so no structure to infer from.

---

title: This metadata-like line is body content.

## Unknown keys survive

Only documented slide metadata keys are absorbed.

---

eyebrow: THE BAND
# hidden: true
# layout: cards2

## Commented meta is ignored

Both settings above are commented out, so this stays visible and infers its
own layout.

### One card
Body.

### Two card
Body.

---

hidden: true

## A genuinely hidden slide

Excluded from the running order, still reachable by deep link.

> **Note:** hidden slides keep their closers.

---

## Accent and card counts

Two cards, the second carrying the point.

### Plain card
Ordinary body text.

### The one that matters {accent}
This card is marked.

---

numbered: true

## Numbered cards

Three cards, numbered.

### First
Body.

### Second
Body.

### Third
Body.

---

badge: EVIDENCE

## Rows with a badge

Questions marked in bold.

1. **A question containing - a hyphen?** The answer survives the dash.
2. **Another question** With an answer.
3. A row with no bold lead at all.

---

## Unordered rows

Dashes and asterisks both open a row list.

- **Dash item** Answer.
* **Star item** Answer.

---

> The pull quote *carries the emphasis* itself."

## Pull layout

The quote leads, so this is a pull.

---

## Both closers, in order

A slide may carry a note and a kicker, separated by a blank line.

### Only card
Body.

> **Takeaway:** the note comes first.

> [!ASIDE] And the kicker follows it.

---

## Adjacent blockquotes join

Without a blank line these are one blockquote, so the second marker is literal
text rather than a kicker. This is Markdown's rule, not quire's.

> **Takeaway:** the note comes first.
> [!ASIDE] This marker does not survive.

---

## Alert kinds

An unrecognised alert falls back to a note.

| Alert | Renders as |
|---|---|
| `[!ASIDE]` | kicker |
| `[!KICKER]` | kicker |
| `[!WARNING]` | note |

> [!WARNING] This should be a note, not a kicker.

---

## Fenced code containing a separator

The fence protects the separator from splitting the slide.

```
---
title: not a new slide
---
```

> [!KICKER] If you are reading this, the fence held.

---

group: FIRST BAND

### Card in first band
Body.

### Second card in first band
Body.

group: SECOND BAND

### Card in second band
Body.

---

## Groups with a heading

Bands can follow a title and sub-line.

group: LEFT

### Left card
Body.

group: RIGHT

### Right card
Body.

> **Takeaway:** groups infer their own layout.

---

## Table with alignment row

The alignment row is dropped, not treated as data.

| Position | Meaning | So what |
|:---|:---:|---:|
| L+SA | Owned, with rights | Version rights and AHB |
| Subscription | Rented | Reducible at anniversary |

---

## Inline formatting

Emphasis, **strong**, *italic*, `code`, and <em>raw HTML</em> all pass through.

### Card with **strong** in the heading
Body with `code`, *italic*, and raw <span data-note="**not bold**" title="`not code`">HTML</span>.

<div><div>**inner stays raw**</div>**outer stays raw**</div>

<script>**before stays raw**; window.example = left && right; const tag = "<script>";</script>

<p>**raw text in an implicitly closed paragraph stays raw**

<div><script>const close = "</div>";</script>**parent content stays raw**</div>

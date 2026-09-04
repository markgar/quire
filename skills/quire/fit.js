// @ts-check
/**
 * Overflow measurement.
 *
 * A slide is a fixed 1280×720 box with `overflow: hidden`, so content taller
 * than the canvas is clipped in silence. Finding that by eye costs an
 * edit-look cycle per slide, and the cycle lies: cutting prose can change the
 * height by exactly zero when the real constraint is a grid row sizing to its
 * tallest card, or a margin rule that fires when an element is removed.
 *
 * Only the browser knows those numbers. This asks it.
 *
 * ## Two metrics that returned confident wrong answers
 *
 * Both were tried against a real 26-slide deck before this one was written.
 *
 * `scrollHeight - clientHeight` reports **0 on every slide**, overflowing or
 * not. A flex column with `overflow: hidden` exposes no scrollable overflow,
 * so the obvious metric is not merely imprecise — it never fires at all.
 *
 * The deepest descendant's `getBoundingClientRect().bottom` reports **the same
 * value for 25 of 26 slides**, because `.body` is `flex: 1` and stretches to
 * fill the box: it measures the container, not the content. It also mixes
 * coordinate spaces, since the stage carries a CSS scale transform and rects
 * come back in scaled pixels while padding is in layout pixels.
 *
 * ## What actually works
 *
 * Measure the height the slide *would* take if nothing constrained it: clone
 * it into an untransformed, `height: auto` host. Flex children then size to
 * their content instead of stretching, a trailing `margin-top: auto` kicker
 * collapses to nothing, and `offsetHeight` comes back in the same layout
 * pixels as the 720 it is compared against.
 *
 * Verified to go red as well as green: injecting a 300px block into a slide
 * that fit moved the measurement by 322px — the extra 22 being a gap that
 * fired when the child was added, which is precisely the structural effect
 * this exists to catch.
 */

/** Authoring canvas, in layout pixels. Matches `.scaler` in shell.html. */
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

/**
 * Overrides applied to a clone so it reports its natural height.
 *
 * `height:auto` is the load-bearing one; the rest undo the positioning and
 * clipping that make a real slide a fixed box.
 */
const CLONE_STYLE = [
  'position:static',
  'display:flex',
  'height:auto',
  'min-height:0',
  'max-height:none',
  'inset:auto',
  'margin:0',
  `width:${SLIDE_W}px`,
  'overflow:visible',
  'transform:none',
].join(';');

/**
 * @typedef {object} SlideFit
 * @property {number} index    zero-based position in the deck
 * @property {number} number   one-based, as the panel and deep links count
 * @property {string} title    first heading, for identifying the slide
 * @property {boolean} hidden  excluded from the running order
 * @property {number} natural  height the content needs, in px
 * @property {number} over     natural − 720; negative means headroom
 * @property {number} wide     horizontal overflow in px
 * @property {string} [wideElement] first overflowing element
 */

/**
 * Measure every slide in a rendered deck.
 *
 * Clones are appended before any height is read. Interleaving append and read
 * forces a layout per slide — 37 ms against 5 ms batched, for 26 slides — and
 * the two agree exactly, so there is no reason to pay for the slow one.
 *
 * @param {HTMLElement} scaler the element holding the rendered slides
 * @returns {SlideFit[]}
 */
export function measureDeck(scaler) {
  const slides = /** @type {HTMLElement[]} */ (Array.from(scaler.querySelectorAll('.slide')));
  if (!slides.length) return [];

  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  // Absolutely positioned, so it is out of flow and does not become a flex
  // item of `body`. Body is `overflow: hidden`, so the offset adds no scroll.
  host.style.cssText =
    `position:absolute;left:-20000px;top:0;width:${SLIDE_W}px;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(host);

  try {
    const clones = slides.map((slide) => {
      const clone = /** @type {HTMLElement} */ (slide.cloneNode(true));
      // `.active` is what makes a slide display; the clone sets display itself
      // and must not answer to `.slide.active` queries elsewhere.
      clone.classList.remove('active');
      clone.removeAttribute('id');
      clone.style.cssText = CLONE_STYLE;
      host.appendChild(clone);
      return clone;
    });

    return clones.map((clone, index) => {
      const slide = slides[index];
      const natural = clone.offsetHeight;
      const cloneRect = clone.getBoundingClientRect();
      let wide = Math.max(0, clone.scrollWidth - clone.clientWidth);
      let wideElement = '';
      for (const element of Array.from(clone.querySelectorAll('*'))) {
        const node = /** @type {HTMLElement} */ (element);
        const rect = node.getBoundingClientRect();
        const elementWide = Math.max(
          0,
          node.scrollWidth - node.clientWidth,
          rect.right - cloneRect.right,
          cloneRect.left - rect.left,
        );
        if (elementWide > wide) {
          wide = Math.ceil(elementWide);
          wideElement = node.className ? `.${String(node.className).trim().replace(/\s+/g, '.')}` : node.tagName.toLowerCase();
        }
      }
      return {
        index,
        number: index + 1,
        title: titleOf(slide),
        hidden: slide.dataset.hidden === 'true',
        natural,
        over: natural - SLIDE_H,
        wide,
        ...(wideElement ? { wideElement } : {}),
      };
    });
  } finally {
    // A measuring host left in the document would be cloned by the next pass.
    host.remove();
  }
}

/**
 * A human-readable name for a slide, for a report that has to be scanned.
 *
 * @param {HTMLElement} slide
 * @returns {string}
 */
function titleOf(slide) {
  const heading = slide.querySelector('h1, h2');
  const text = (heading?.textContent || slide.querySelector('.eyebrow')?.textContent || '').trim();
  return text || '(untitled)';
}

/**
 * Record each slide's overflow on the slide itself, so the panel can mark
 * thumbnails without measuring a second time.
 *
 * Only overflowing slides are marked. A `data-over` on every slide would make
 * "which ones are over" a numeric comparison in CSS, which CSS cannot do.
 *
 * @param {HTMLElement} scaler
 * @param {SlideFit[]} report
 */
export function annotate(scaler, report) {
  const slides = /** @type {HTMLElement[]} */ (Array.from(scaler.querySelectorAll('.slide')));
  for (const fit of report) {
    const slide = slides[fit.index];
    if (!slide) continue;
    if (fit.over > 0) slide.dataset.over = String(fit.over);
    else delete slide.dataset.over;
    if (fit.wide > 0) slide.dataset.wide = String(fit.wide);
    else delete slide.dataset.wide;
  }
}

/**
 * Format a report for a console table an author or an agent can read.
 *
 * @param {SlideFit[]} report
 * @returns {string}
 */
export function formatReport(report) {
  const over = report.filter((r) => r.over > 0 || r.wide > 0);
  if (!over.length) {
    const tightest = [...report].sort((a, b) => b.natural - a.natural)[0];
    if (!tightest) return 'No slides.';
    return (
      `All ${report.length} slides fit. Tightest: ${tightest.number}. ` +
      `${tightest.title} — ${-tightest.over}px of headroom.`
    );
  }
  const lines = over.map((r) => {
    const problems = [];
    if (r.over > 0) problems.push(`${r.over}px tall`);
    if (r.wide > 0) problems.push(`${r.wide}px wide${r.wideElement ? ` at ${r.wideElement}` : ''}`);
    return `  ${String(r.number).padStart(3)}. ${r.title} — ${problems.join(', ')}` + (r.hidden ? ' (hidden)' : '');
  });
  return `${over.length} of ${report.length} slides overflow the canvas:\n${lines.join('\n')}`;
}

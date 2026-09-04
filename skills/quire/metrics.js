// @ts-check

/**
 * Fit metric values to their individual cards using rendered glyph widths.
 * Works for normal slides and transformed contact-sheet slides.
 *
 * @param {Iterable<Element>} slides
 */
export function fitMetricValues(slides) {
  for (const slideElement of slides) {
    const slide = /** @type {HTMLElement} */ (slideElement);
    const wasVisible = getComputedStyle(slide).display !== 'none';
    if (!wasVisible) {
      slide.style.display = 'flex';
      slide.style.visibility = 'hidden';
    }
    for (const valueElement of Array.from(slide.querySelectorAll('.metric-value'))) {
      const value = /** @type {HTMLElement} */ (valueElement);
      value.style.fontSize = '76px';
      const available = value.clientWidth * 0.8;
      const range = document.createRange();
      range.selectNodeContents(value);
      const scale = slide.getBoundingClientRect().width / slide.offsetWidth || 1;
      const textWidth = () => range.getBoundingClientRect().width / scale;
      if (available > 0 && textWidth() > available) {
        let low = 24;
        let high = 76;
        while (high - low > 0.5) {
          const size = (low + high) / 2;
          value.style.fontSize = `${size}px`;
          if (textWidth() <= available) low = size;
          else high = size;
        }
        value.style.fontSize = `${low.toFixed(1)}px`;
      }
    }
    if (!wasVisible) {
      slide.style.removeProperty('display');
      slide.style.removeProperty('visibility');
    }
  }
}

/** @param {Iterable<Element>} slides */
export function fitMetricValuesAfterFonts(slides) {
  fitMetricValues(slides);
  document.fonts?.ready.then(() => fitMetricValues(slides));
}

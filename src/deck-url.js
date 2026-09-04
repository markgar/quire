// @ts-check
/**
 * Resolve a `?deck=` value, refusing anything that is not same-origin.
 *
 * This is a security boundary, not a tidiness check. A deck may contain raw
 * executable HTML, so the app must not fetch attacker-controlled source into
 * its origin. Only relative paths served alongside the app are accepted;
 * absolute, protocol-relative, and root-relative values are refused.
 *
 * @param {string} value the raw parameter
 * @param {string} [baseHref] URL the relative value is resolved against
 * @param {string} [expectedOrigin] origin the result must remain within
 * @returns {string | null} a safe same-origin URL, or null if it must be refused
 */
export function safeDeckUrl(
  value,
  baseHref = location.href,
  expectedOrigin = location.origin,
) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//') || value.startsWith('/')) {
    return null;
  }
  let url;
  try {
    url = new URL(value, baseHref);
  } catch {
    return null;
  }
  return url.origin === expectedOrigin ? url.href : null;
}

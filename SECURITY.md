# Security

## Deck content and raw HTML

Ordinary Quire syntax is presentation data. Opening a deck does not
automatically execute JavaScript supplied by its author.

Quire also supports raw HTML for styling and elements that have no native Quire
equivalent. The renderer preserves that markup, including attributes. Active
attributes such as event handlers can therefore execute JavaScript in the
viewer.

Script elements inserted during a live viewer update are not executed by the
browser. Standalone HTML exports are different: their markup is parsed when the
page loads, so script elements and event handlers may execute. Avoid active raw
HTML unless you authored or reviewed it.

## What the app does about it

**A Content-Security-Policy on the app shell.** `connect-src 'self'` blocks
cross-origin `fetch`, XHR, and similar connections; `img-src 'self' data:`
blocks remote image beacons; `form-action 'none'` blocks form submission; and
`base-uri 'none'` prevents base-URL rewriting. The current single-file app uses
inline scripts, so its policy also permits inline script and event handlers.
The policy limits common network channels; it does not make active raw HTML
safe.

**`?deck=` is same-origin only.** The parameter takes a relative path beside
the app and rejects absolute URLs, protocol-relative URLs, and paths beginning
with `/`. A link cannot make Quire fetch and render a deck from another origin.

**No deck content is transmitted.** The app has no telemetry, no analytics, no
server, and no code path that sends deck text anywhere. This is a design
constraint, not a setting.

**CLI browser checks isolate network access.** Fit and render operations use a
temporary headless browser because accurate layout and screenshots require it.
The browser runs behind an unreachable proxy with host resolution disabled,
and the temporary page restricts network-capable resource types. Active raw
HTML may still execute locally during these checks.

## What it does not do

**Exported decks carry no CSP.** An export is a standalone file built for
recipients without the app. It includes the deck's raw HTML, and the browser
parses that markup when the file opens. Treat an exported deck containing
active raw HTML like any other HTML attachment.

**File access belongs to the app origin.** The app stores a handle for the last
`.quire` file opened. JavaScript executing in the app's origin may be able to
request that handle through the same browser storage.

**Top-level navigation is not blocked by CSP.** Active raw HTML can navigate
the page or open another page. The network restrictions above are not a
complete sandbox.

**A host should send headers the meta policy cannot.** `frame-ancestors` is
ignored in a `<meta>` element; a deployment that can set response headers
should send `frame-ancestors 'none'` there.

## Reporting a vulnerability

Open a GitHub issue for anything already public or low risk. For something
exploitable that is not yet public, use GitHub's **Report a vulnerability**
button under the repository's Security tab, which is private, rather than a
public issue.

Useful reports say what an attacker controls, what they get, and what a user
had to do. A minimal proof of concept is welcome.

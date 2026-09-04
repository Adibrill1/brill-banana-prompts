# brill-banana-prompts

Hebrew-language prompt gallery. Single-page app on Vercel; `state.json` in this
repo is the source of truth for cards and is written by the site's own admin UI.

## Critical: never edit index.html in GitHub's web editor

`index.html` is ~3.4MB. GitHub cannot load a file that size in its web editor —
it opens **blank**, showing `Enter file contents here`. Committing from that
blank editor replaces the entire file with an empty one. This came within one
click of happening.

Edit it locally, or patch it server-side (see below).

The same size puts it out of reach of the GitHub MCP write tools:
`create_or_update_file` and `push_files` take the full file content as a
tool-call argument, and 3.4MB does not fit. Small files — this one, workflow
YAML, `api/*.js` — go through those tools without trouble.

## When `git push` fails

Claude Code Remote containers for this repo have had no GitHub credentials:
`git fetch` works (public repo, anonymous read), `git push` fails with
`Invalid username or token`. Confirm once, then stop hunting for a token —
there isn't one in the environment, the MCP server holds it server-side.

Route that works for a large file: commit a temporary `workflow_dispatch`
workflow, run it, delete it. The runner edits the file and pushes with the
built-in Actions token, so the file never has to travel through a tool call.

Three things learned doing this:

- **Use sparse checkout.** A full `actions/checkout` here takes 5+ minutes
  because of `images/`. `sparse-checkout: index.html` with
  `sparse-checkout-cone-mode: false` takes 2 seconds.
- **Guard the edit.** Require the old value to appear exactly once before
  replacing it (`test "$(grep -c "$OLD" index.html)" = "1"`), so a re-run
  fails safely instead of doing something unintended.
- **Don't trust a single status reading.** The Actions API reported a step as
  still running for minutes after it had finished and pushed. A run was
  cancelled on that stale reading; the work had already landed.

## The empty-categories failure, and how to diagnose it

Symptom: every category filter shows nothing, while "הכל" shows all the cards
and their images. **This is almost never a bug in `filterCards`.** "All"
short-circuits on `!activeCat` before the `cats` check; every other filter
reads `cats`. So an empty filter means the page is running on state that has
no `cats[]` — which means `/api/state` did not deliver.

The inline `var state` in `index.html` (line ~4948) is an old snapshot with
**no `cats[]` and no `customCats`**. When `/api/state` returns nothing usable,
the client keeps it and the page still renders and looks healthy.

Both client paths fail silently, which is what makes this hard to see:

```js
fetch('/api/state').then(r => r.json()).then(function (serverState) {
  if (!isEmptyState(serverState)) { /* only applied if non-empty */ }
}).catch(function () { /* swallowed */ });
```

**Diagnose by opening `/api/state` in a browser tab before reading any client
code.** `{"deleted":[],"customImgs":{},"added":[],"order":[]}` is the handler's
`empty` constant — the function ran and gave up. A wall of JSON means the read
path is healthy and the problem is elsewhere.

## Publishing / Vercel

- **⏰ The current `GITHUB_TOKEN` expires 2027-09-03 (3 September 2027).**
  Rotated 2026-09-04. Rotate it again before that date — the failure mode
  described in the next bullet is completely silent.
- **`GITHUB_TOKEN` (Vercel env var) is what publishing runs on.** It expired
  once — set Apr 24, last successful publish May 13 — and `/api/state` then
  returned `empty`, which was the empty-categories outage above, not a size
  problem. **Seeing the variable listed in Vercel proves nothing: an expired
  token fails exactly like a missing one**, so check the expiry date on GitHub
  rather than the variable's presence. Reads no longer depend on it — the repo
  is public, so `api/state.js` falls back to an anonymous
  `raw.githubusercontent.com` fetch (verified 200, 5.3MB, 0.63s). **`api/save.js`
  still needs a valid token; without one publishing is dead while the site looks
  perfectly healthy.** Fine-grained tokens need `Contents: Read and write` on
  this repo.
- Vercel serverless has a ~4.5MB limit on **both** request and response bodies.
  `api/save.js` accepts gzip (`X-Body-Encoding: gzip+json`) and deliberately
  returns only `{ok, _publishedAt}` — do not make it echo the state back, that
  reintroduces a 413.
- `state.json` passed that limit on the **read** side too (5.06MB), so
  `api/state.js` gzips its response (~5MB → ~0.87MB); browsers decompress
  transparently. That headroom is finite — when it runs out, split the payload
  rather than reaching for a stronger gzip.
- Images are uploaded in a separate phase before the state save, one per
  request, and compressed on import. Raw camera-resolution base64 will 413.
- Commits titled `Update state` come from the live site's publish flow, not
  from a session. A long gap in them means publishing has been broken.

## State model

- The page carries an inline `var state = {...}` for first paint; `/api/state`
  is authoritative and is applied on load.
- Cards carry `cats[]` (category ids). `cat` (a Hebrew label string) is legacy.
  `migrateStateCats()` maps `cat` to `cats[]` on every `applyState()` — that is
  what stops a backfill from being wiped by the next publish from a browser
  whose in-memory state predates it.
- Read category labels from `state.customCats` when present, never from the
  hardcoded `CUSTOM_CATS`; the user renames categories.
- `localStorage.nb_state` is a cache. When a shipped change doesn't show up in
  the browser, clear it before concluding the deploy failed.

## Admin

`ADMIN_HASH` in `index.html` is a SHA-256 of the admin password. It cannot be
reversed — to change the password, hash the new one
(`echo -n 'pw' | sha256sum`) and replace the constant.

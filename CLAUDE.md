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

## Publishing / Vercel

- Vercel serverless has a ~4.5MB limit on **both** request and response bodies.
  `api/save.js` accepts gzip (`X-Body-Encoding: gzip+json`) and deliberately
  returns only `{ok, _publishedAt}` — do not make it echo the state back, that
  reintroduces a 413.
- Images are uploaded in a separate phase before the state save, one per
  request, and compressed on import. Raw camera-resolution base64 will 413.
- Commits titled `Update state` come from the live site's publish flow, not
  from a session.

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

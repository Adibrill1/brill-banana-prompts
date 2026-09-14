# Brill Studio gallery — maintainer guide

Read `README.md` for setup, routes, deployment settings and the access-control boundary.

## Current architecture

- `src/`: React/TypeScript visitor gallery, built with Vite. Keep the initial HTML small. Request bounded metadata from `/api/catalog`; load full prompt text through `/api/prompt` only when needed.
- `admin.html`: separate authenticated editor retaining import, export, category and ordering workflows. `editor/uploads.mjs` uploads pending images before publishing state. Do not put the catalog, password hash or license keys back into frontend HTML.
- `services.html`: services page; published configuration comes from the catalog API. Saved desktop size settings must not override mobile layout.
- `api/` and `lib/`: Vercel Node functions, catalog normalization, repository storage, authenticated sessions and image transformation.
- `content/originals.json`: 241 original records extracted from commit `7e300e1`; server-only migration input. `state.json` remains authoritative for published changes.

## Data invariants

Preserve existing card keys, favorites, order, category membership and prompt text. `lib/catalog.cjs` is the shared visitor read model. Unlisted cards precede the explicitly ordered cards, matching the original DOM append order. Custom image overrides take precedence over image arrays. Legacy category labels map to current IDs; labels come from `state.customCats`.

Never call `getCardData()` or a document-wide card selector in a loop in the legacy editor. Build a key-to-record or key-to-element Map first. The editor still displays the full catalog, so retain its `content-visibility` optimization. The visitor page renders at most 100 cards under normal navigation, with lazy image loading and 1–7 responsive columns.

Use `minmax(0,1fr)` in grids and `min-width:0` on flexible content. Keep separate column preferences for desktop, tablets and phones. All offer 1–7 columns, while phones default to 2. Verify horizontal overflow at 320px and 390px, with long titles and category labels.

## Publishing and images

`/api/save` requires a server-authenticated administrator and the editor's `baseRevision`. A stale or racing write returns 409. Never retry with the newer SHA while retaining a stale payload. Offer a backup of unsaved work instead.

Upload images separately before the state save. Preserve every image in multi-image cards and services; do not silently strip base64 entries. New files are content-hashed WebP assets; replacing an image must not overwrite an older URL. `/api/img` allows only known source hosts/paths, bounded dimensions and bounded input sizes.

Large state responses and publishing requests use gzip to stay below Vercel's body limits. Keep save responses small. If the compressed catalog eventually outgrows those limits, migrate storage or split data; do not embed it in HTML again.

`GITHUB_TOKEN` in Vercel needs Contents read/write permission for this repository. Its last recorded expiry was 2027-09-03; check the actual token when diagnosing publishing. Token presence alone does not prove validity. `SESSION_SECRET` is preferred for signed cookies, with existing server tokens as fallback. Never expose these as `VITE_` variables.

The repository and its history already publicly contain prompt data and license keys. Authenticated application endpoints do not remove that exposure. A private paid catalog needs private storage and replacement of historically exposed keys.

## Verification and safe local work

Run `npm test` and `npm run build`. The tests exercise migration, search and paging, authentication, license expiry/revocation, bounded gzip handling, upload retries and concurrent publishing. Validate important user flows in a browser, including a phone-sized viewport. `npm run preview` serves the production build with local read-only APIs.

Both local server modes force `LOCAL_DATA=1` and cannot publish to GitHub. Vercel preview deployments also reject publishing, image uploads and license-key mutations. `LOCAL_ADMIN_PASSWORD` is an optional local test override, not a production password. Never commit real secrets. Keep state, originals and license files out of `dist/`.

The image archive is large; use sparse checkout excluding `/images/` for source-code work. Test `git push --dry-run` rather than assuming credentials are present. If authentication is unavailable, stop looking for tokens and deliver the local change or use the configured GitHub connector.

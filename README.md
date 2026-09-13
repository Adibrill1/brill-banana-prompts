# Brill Studio gallery

Public address: https://brill-studio.vercel.app. Vercel project: `brill-studio`.

Hebrew/RTL prompt gallery, upgraded from the original single-file application.

The visitor application uses React and TypeScript, built with Vite. It requests 100 lightweight card records per page, searches the complete catalog on the server, and fetches full prompt text only when opened or copied. Favorite IDs and the existing theme preference are preserved. Responsive image variants are generated with Sharp and cached by the browser and Vercel CDN; offscreen images load lazily.

Visitors can select 1–7 images per row on desktop, up to 3 on tablets and 2 on phones. The saved desktop preference survives resizing. Copy buttons show progress immediately and a green confirmation only after clipboard success, in both the gallery and prompt viewer.

## Local development

Use Node.js 22 and run `npm ci`, then `npm run dev`. The preview listens on `http://127.0.0.1:5173`. Local preview reads the checked-out data and **never writes to GitHub**, even if the parent environment contains a GitHub token. Image requests read public source images from the internet.

The existing administrator password works locally. For isolated UI testing, start the preview with `LOCAL_ADMIN_PASSWORD` set to a temporary development-only password. This setting is used only by the local preview script and is never a production credential. No local secret needs to be committed.

`npm test` checks data migration, ordering, category membership, search, pagination, metadata size, authentication, paid-content filtering, image source restrictions, and concurrent-save protection. `npm run build` checks TypeScript and creates `dist/`. `npm run preview` serves that production build with the same read-only local APIs.

## Routes

| Route | Purpose |
|---|---|
| `/` | Visitor gallery; query, category, favorites and page survive browser navigation |
| `/?prompt=<existing-id>` | Direct link to a prompt viewer |
| `/admin` | Existing editing/import/export workflows, loaded separately after server authentication |
| `/services` | Existing studio services page, loading current published configuration |
| `/api/catalog` | Paginated metadata and full-text search; POST supports arbitrary favorite IDs across pages |
| `/api/prompt?key=…` | Details with server-checked access rules |
| `/api/img` | Allowlisted image transformation: 320/640/960/1600px, WebP by default, optional AVIF |
| `/api/session` | Signed HttpOnly sessions for administrator login and account logout |
| `/api/state`, `/api/save`, `/api/keys` | Authorized administrator APIs |

## Data and compatibility

- `state.json` remains the publishing source of truth in this incremental release. No database migration or third-party account is required.
- `content/originals.json` losslessly extracts the 241 original records from commit `7e300e1`. It is server data, excluded from static output.
- `lib/catalog.cjs` combines originals, added cards, edits, deletions, image overrides and ordering into one read model. Unlisted cards stay before explicitly ordered cards, matching the old page. Existing IDs are never reassigned.
- `bb_favs` and `brill_license` remain compatible. `bb_gallery_columns` stores the 1–7-column preference, clamped for smaller screens without overwriting the desktop choice. The previous large/compact setting supplies the initial default.
- The editor still loads the full catalog, but only authenticated administrators request it. Visitor browsing is always bounded to a page of cards.
- New image uploads use content-hashed WebP filenames. Existing sources remain intact. The image proxy uses versioned request URLs; no destructive batch conversion of the archive is performed.
- Repository reads use a short in-memory cache plus CDN caching for public metadata. Admin reads are fresh and uncacheable. A failed public read may use an explicitly marked last-good/bundled snapshot; admin editing never silently loads an empty fallback.
- Every state save requires the revision originally loaded by the editor. Conflicts return HTTP 409 instead of retrying a stale whole-file overwrite. The editor offers a JSON backup of pending changes.

## Vercel deployment

The checked-in configuration sets Node.js 22, the Vite build, and `dist/` as static output. Existing `api/` functions remain Vercel Node functions. The image archive, state, license keys and original prompts are not copied to public output. Function bundles include the state snapshot and original records; they exclude the large source image archive.

Keep the existing `GITHUB_TOKEN` with repository Contents read/write permission. `SESSION_SECRET` is the preferred session-signing secret; when absent, the server uses existing `ADMIN_TOKEN`, then `GITHUB_TOKEN`. `ADMIN_PASSWORD_SHA256` can override the existing administrator password hash. The default hash preserves the existing password. Never prefix these secrets with `VITE_` or expose them in frontend code.

The existing GitHub token expiry recorded before this rewrite was **2027-09-03**; this release does not rotate it. Validate current permissions/expiry when deploying. Login and publishing require an available signing secret and GitHub token in the target environment.

Local and Vercel preview environments cannot publish state, upload images or change license keys in the live repository. Before replacing the live site, verify the preview's login, license activation/expiry, services settings, and real-device performance. After an approved production release, verify one controlled publish. Local tests mock remote writes; no real publish or license-key mutation is performed by the test suite. Image transformation adds server/CDN work; monitor its usage with actual traffic.

## Access-control boundary

The new site withholds protected prompt text and administrative state from anonymous API responses, and signs sessions on the server. However, the GitHub repository and its history already contain `state.json`, original prompts and `keys.json` publicly. Application changes cannot make that history private. A truly private paid catalog requires a separately planned migration of protected data and license keys to private storage, including appropriate replacement of previously public keys. Do not represent this release as removing that historical exposure.

## Measured local result

At the initial rewrite, on the reviewed dataset (3,649 cards), before increasing pagination from 36 to 100 cards:

- Gallery HTML: approximately 3.1KB raw, down from 3.6MB.
- Initial main JavaScript: approximately 75KB gzip, plus approximately 4KB CSS.
- First catalog response: 36 cards, approximately 3KB gzip, with no full prompt bodies.
- Mobile viewport at 390px: no horizontal page overflow; 36 cards and approximately 526 DOM elements instead of 3,649 cards and approximately 80,531 elements.
- A sampled 1024px JPEG of 185,202 bytes was delivered as a 320px WebP of 24,250 bytes. This is one image example, not a catalog-wide savings estimate.

These are local payload/layout checks, not measured production Core Web Vitals or a cellular-network speed guarantee.

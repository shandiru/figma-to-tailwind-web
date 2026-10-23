# Frame to Code

Export complete JSON with the included Figma plugin, upload desktop and mobile files, select matching sections on the design canvas and build editable HTML. JSON file upload is the only design import method. Text stays text; containers become HTML; artwork becomes WebP assets. The workspace includes a selectable design canvas, preview, code, conversion history and ZIP downloads.

## Project structure

```text
backend/       Express API, database models, services, and backend tests
frontend/      React/Vite app, UI components, and frontend tests
figma-plugin/  Source plugin files for importing into Figma
artifacts/     Saved conversion examples and generated visual checks
```

`backend/figma-plugin/` is a deployment copy of the plugin so the backend can serve it when deployed on its own. Update both plugin folders when changing the plugin. Keep generated examples that are useful for comparison in `artifacts/`; temporary browser-check metadata is ignored by Git.

## Setup

Requirements: Node.js 22.12+ and MongoDB (local or Atlas).

```powershell
cd backend
Copy-Item .env.example .env
# Set MONGO_URI in .env
npm.cmd install
npm.cmd run dev

# In another terminal
cd frontend
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Open http://localhost:5173. Try a sample design to check the complete flow.

Plugin v1.10 exports artwork in local coordinates, retains structural frames, and renders every image fill through Figma to preserve off-centre crops and transparent padding. Re-export with this version to update older JSON; an existing export cannot recover discarded crop information.

CTA sections containing controls remain layout containers. The converter avoids nested HTML buttons, which otherwise cause browsers to move later images out of their section. Existing JSON benefits from this converter fix without a plugin re-export.

Plugin v1.12 fixes double application of bound color alpha, retaining visible translucent form and secondary-button backgrounds.

Plugin v1.13 normalizes group transforms to immediate-parent coordinates. Figma relativeTransform skips groups and boolean operations; using it directly in HTML had duplicated offsets. Existing v1.10?v1.12 JSON files are corrected automatically during import, and coordinateSpace prevents repeat correction.

## Upload complete JSON and select sections

Plugin v1.15 keeps vector icons as SVG and recovers empty/failed exports via PNG. Outlined font icons now render as artwork in the backend. Comparison screenshots are optional (off by default), duplicate styles are omitted, and gzip packing starts at 32 KB. For smaller photo-heavy files, enable the optional WebP compression checkbox (94% quality, slight quality loss). Deploy the updated backend and re-import the plugin; existing exports cannot recover missing artwork. This reduces payload sizes but does not guarantee every frame fits Vercel's request limit.

1. Import the updated `figma-plugin/manifest.json` in Figma. Run **Frame to Code v1.13** on your frame, click **Export complete JSON**, then **Download JSON**.
2. Open **Upload JSON** in the app and upload your desktop file. The rendered design and layer list open immediately. Repeat for the mobile file if needed. Ordinary and gzip-packed exports are supported, up to 128 MB each.
3. Toggle **Figma original / Generated HTML** to compare the source with the actual HTML rendering. Choose the corresponding sections on each canvas. The original upload stays available while changing sections; replacing one version preserves the other version.
4. Build and download the HTML ZIP. Invalid replacement files leave your last valid design intact. Assets are encoded as lossless WebP. Missing assets cannot be reconstructed from a JSON file that does not include them; custom fonts must be available in the browser.

## Output and limits

The renderer preserves measured layer positions using Tailwind utilities only, with arbitrary values for exact geometry and visual styling. It generates no inline styles, style blocks, custom CSS files, or resizing scripts. Native CSS container units scale geometry, font sizes, borders and spacing together. Text supports styled runs. Containers named Button or CTA become buttons; their actions and navigation must be implemented separately. It does not infer semantic sections, interactive behavior or flexbox reflow from a screenshot.

With both frames, base and sm (640px) use the mobile geometry; md (768px), lg (1024px), xl (1280px) and 2xl (1536px) use the desktop geometry. All five breakpoint variants appear explicitly in generated HTML. Layouts scale fluidly between these widths and preserve source measurements at each original frame width. Supplying both exports is necessary to reproduce both designs. Frame dimensions come directly from the export. Complex masks, blends, image crops and custom font metrics may need manual adjustment. Available fonts load via Google Fonts; custom fonts must be installed or supplied separately. Tailwind and Google Fonts require internet in the exported page. Conversion itself makes no external API calls. The preview includes all breakpoint widths plus the original desktop/mobile widths; the Code tab supports wrapping on small screens.

Plugin v1.3 deduplicates artwork and compresses large exports with gzip. It supports 3,000 layers, nesting depth 50, 256 MB before packing, and 128 MB after packing per frame. The backend accepts files up to MAX_FILE_MB (128 MB default), and decompresses at most 256 MB. Both regular and packed JSON work with file upload. Use Download JSON if the browser cannot copy a large payload. ZIPs contain index.html, README.md, conversion.json (counts and warnings), and artwork assets.

## Backend environment

### Accounts and deployment

Email is the account's primary sign-in identity: it is trimmed, lowercased, immutable, and protected by a MongoDB unique index. An existing email cannot register another account, even with different capitalization or surrounding spaces; registration returns an already-registered message without sending another OTP. Internal user IDs continue to link sessions and private exports. The application workspace uses sidebar navigation, compact JSON upload cards, a three-step build guide, and an email-first account header; the login/register layouts are unchanged.

The exported Express app awaits a shared MongoDB connection before handling API requests, including when Vercel imports `src/app.js` without running `src/server.js`. Concurrent requests share the connection attempt and pool; failed attempts can retry. Query buffering is disabled. Account uniqueness and expiry indexes are created before auth queries run. `/api/health` returns `200 {"ok":true}` only after database readiness; unavailable connections return a sanitized `503` instead of an auth-throttle buffering timeout. In the backend Vercel project, configure `MONGO_URI` for Production/Preview as required, redeploy after changes, and ensure Atlas network access and database credentials permit that deployment to connect.

The workspace now requires an account. Registration sends a six-digit email code, valid for 10 minutes with a maximum of five verification attempts. A code can only be used once. Resending invalidates the previous code and is limited to one email per minute and five per hour. Sign-in uses the verified email and password (15–128 characters). Passwords use salted scrypt; OTPs use keyed hashes; session tokens are stored as hashes. MongoDB stores session expiry and throttles so they survive serverless instance changes. Design history and ZIP downloads are scoped to the signed-in user. Legacy conversions without a user are not exposed to any account.

To create a Super Admin account, set `SUPER_ADMIN_CREATE_KEYWORD` in the **backend** `.env` (or backend hosting environment) to a long, private phrase. Enter that phrase in the optional Super Admin creation keyword field during registration, then complete email verification. Keep the value out of the frontend environment and source control. Super Admins get an Active users view listing verified accounts, their email, role, and signup date; the server checks the Super Admin role before returning that data.

Set these **backend** hosting environment variables:

```dotenv
MONGO_URI=your-mongodb-connection-string
CLIENT_URL=https://your-frontend-domain
EMAIL_USER=your-gmail-address
EMAIL_PASS=your-gmail-app-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
AUTH_SECRET=your-random-secret-at-least-32-characters
COOKIE_SAME_SITE=lax
MAX_FILE_MB=128
```

Generate `AUTH_SECRET` once using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and keep it stable across backend instances. It must be configured in production; it has no insecure fallback. Use a Gmail App Password. SMTP uses TLS; credentials and OTPs are never returned to the browser. Local credentials belong only in the ignored `backend/.env` file; examples contain placeholders. No email is sent by the automated tests.

For the **frontend**, production builds always use `/api`, including when an old Vercel `VITE_API_URL` still contains an absolute backend URL. `VITE_API_URL` configures local development only. `frontend/vercel.json` proxies `/api/*` to the existing backend domain; update its destination if that domain changes. Redeploy the frontend after updating the code. The same-origin proxy keeps HttpOnly, Secure, SameSite=Lax cookies first-party. Sign-in confirms `/api/auth/me` succeeds with the new cookie before opening the workspace. A protected request returning 401 triggers a session check; a valid current session is retained. No session token is kept in browser storage. Mutations also require the session's CSRF header and an allowed origin. CORS accepts the exact frontend origins in `CLIENT_URL` (comma-separated if needed). For local Vite development, include `http://localhost:5173`; Vite already proxies `/api` locally. Use Node.js 22.12+ for both deployments.

Gmail connection/authentication can be checked without sending a message; delivery to a real inbox still requires a real registration. If email delivery fails, registration shows a retryable error and does not create a verified account. Browser integration tests use an isolated in-memory database adapter and fake mail sender, not your live MongoDB or Gmail account.

Run `npm test` in both projects and `npm run build` in the frontend. Run `node frontend/test/browser-smoke.mjs` from the repository root after building to exercise registration, OTP, login/logout, session restore, and design conversion in headless Chrome. Screenshots are written under ignored `artifacts/*.png`. The Node backend production dependency audit is clean; Tailwind 3's development dependency tree still has upstream audit findings requiring a separate Tailwind 4 migration. These development tools are not shipped in the static browser bundle.

All application UI and generated HTML use square corners. Exported corner-radius styles are intentionally excluded from generated HTML. Corners already baked into raster artwork remain part of those images.

ZIP history still needs persistent file storage on a conventional Node host (`STORAGE_DIR`). Vercel uses temporary local storage, so ZIP files may disappear between instances; durable object storage is required for reliable long-term downloads on Vercel. The Vercel 4.5 MB request limit also remains; authentication and UI changes do not implement chunked upload.

### Separate deployments

The `backend` and `frontend` directories can each be deployed independently. Their runtime helpers are inside each project; neither requires the root `shared` directory. The backend includes a copy of the Figma plugin in `backend/figma-plugin` so `/api/plugin` also works when only the backend folder is deployed. After changing the root plugin, copy its four files into `backend/figma-plugin` before deploying.

Plugin v1.14 raises the packed export/import limit to 128 MB and the unpacked limit to 256 MB without changing artwork quality. Re-import the updated plugin manifest in Figma, or download the plugin from the redeployed backend. Set `MAX_FILE_MB=128` in the backend hosting environment; existing environment overrides still take precedence.

Vercel Functions limit request and response bodies to 4.5 MB: https://vercel.com/docs/functions/limitations#request-body-size. Increasing these application limits cannot raise that platform limit. Large uploads and previews require a backend host that supports larger HTTP bodies, or a separate object-storage upload/download flow. A frontend hosted on Vercel can call such a backend via `VITE_API_URL`, with the frontend origin in the backend's `CLIENT_URL`.

| Variable | Purpose |
|---|---|
| PORT | API port (default 5000) |
| MONGO_URI | MongoDB connection string |
| CLIENT_URL | Allowed CORS origin (default http://localhost:5173) |
| MAX_FILE_MB | Per-file upload limit (default 128) |
| FIGMA_ACCESS_TOKEN | Optional server token for Figma link import; requires file_content:read |

Frontend VITE_API_URL defaults to /api, proxied to the backend by Vite.

## API

- POST /api/convert: multipart desktop, mobile, options JSON to ZIP
- POST /api/layers/preview: uploaded plugin JSON to editable layers and a design canvas preview
- POST /api/figma/frames: Figma link and token to available frame metadata
- POST /api/figma/import: Figma link, token and desktopId/mobileId to editable layer exports
- GET /api/plugin: downloadable development plugin ZIP
- GET /api/history: recent conversions
- GET /api/history/:id/download: download saved output

## Validation

Run npm.cmd test in backend and frontend. Run npm.cmd run build in frontend. The app accepts JSON files only; clipboard import and the old /api/clipboard endpoint have been removed. Browser checks exercise ordinary and packed desktop/mobile JSON uploads, section selection, invalid replacement recovery, and responsive HTML generation. Live plugin document access and visual fidelity must still be checked in Figma.

# Frame to Code

Export complete JSON with the included Figma plugin, upload desktop and mobile files, select matching sections on the design canvas and build editable HTML. Native clipboard paste remains available as an alternative. Text stays text; containers become HTML; artwork becomes WebP assets. The workspace includes a selectable design canvas, preview, code, conversion history and ZIP downloads.

## Setup

Requirements: Node.js 18+ and MongoDB (local or Atlas).

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

1. Import the updated `figma-plugin/manifest.json` in Figma. Run **Frame to Code v1.13** on your frame, click **Export complete JSON**, then **Download JSON**.
2. Open **Upload JSON** in the app and upload your desktop file. The rendered design and layer list open immediately. Repeat for the mobile file if needed. Ordinary and gzip-packed exports are supported, up to 48 MB each.
3. Toggle **Figma original / Generated HTML** to compare the source with the actual HTML rendering. Choose the corresponding sections on each canvas. The original upload stays available while changing sections; replacing one version preserves the other version.
4. Build and download the HTML ZIP. Invalid replacement files leave your last valid design intact. Assets are encoded as lossless WebP. Missing assets cannot be reconstructed from a JSON file that does not include them; custom fonts must be available in the browser.

## Copy, paste, select a section

1. Choose the **Desktop** slot under **Paste design**. Select your desktop frame in Figma, use normal **Copy / Ctrl+C / Cmd+C**, then press **Ctrl+V / Cmd+V** in the app outside a text input. Alternatively, click the paste area and grant clipboard access when prompted.
2. The **Desktop canvas** shows the copied design and a searchable layer list. The whole frame is selected by default; click a section or choose a layer to save only that part as the desktop version. Alt+click includes text and artwork in canvas hit testing.
3. Choose the **Mobile** paste slot and repeat with your separate mobile frame. This saves the mobile version alongside desktop. Switch between Desktop canvas and Mobile canvas to select matching sections; each selection is retained independently. Replacing or removing one version preserves the other.
4. Click **Build responsive HTML**. Both selected versions are combined in one HTML file and ZIP: mobile below 768px, desktop at 768px and above. Preview, inspect Code and download the ZIP. A single supplied version can also be built on its own.

Native paste interprets the embedded Kiwi schema and scene from Figma clipboard HTML, supporting deflate and Zstandard blocks. It does not execute pasted HTML or schema code and makes no Figma API calls. Decoding runs in a worker with memory/time limits; the input limit is 48 MB, decompressed blocks are limited to 64 MB and scenes to 6,000 layers / 50 levels. The format is undocumented and may change. Native component references are expanded from copied symbol definitions, applying instance text overrides and derived geometry, including nested instance paths. Repeated instances remain independent. When original image bytes are absent, embedded thumbnails are recovered with a reduced-resolution notice. Clipboard contents can still omit image bytes or component definitions; affected layers are listed individually. Download paste sample saves the current copied payload locally for troubleshooting only; it contains the copied design and is never sent automatically. Complex masks, gradients, image crops and custom fonts need visual review. Use the plugin when a native paste is incomplete.

The paste button requests original, unsanitized HTML where the browser supports it. Keyboard paste accepts escaped HTML, marker-only data, supported custom Figma text representations and plain-text plugin exports; it attempts an original clipboard read if the event payload was sanitized. When no layer data is available, the error shows only received MIME types and text length, never the design contents. Images embedded by hash are matched to local image blobs. Icon fonts use their embedded glyph outlines when present. Missing assets are flagged above the canvas rather than hidden in the notes.

For a photo-heavy frame or custom icon fonts, use **Quick start → Download Figma plugin**, select the same frame in Figma, **Copy complete design**, then paste directly into the matching slot under **Paste design**. Plugin v1.6 exports and attempts to copy in one action; if browser permission blocks automatic copying, click **Copy layers** to retry. This path includes the plugin's exported image/font artwork and still supports section selection without uploading a JSON file. Assets absent from the native clipboard cannot be reconstructed from a hash alone.

The native vector importer reads rendered paths, including per-path fill overrides, and falls back to bounded vector-network decoding when outlines are omitted. Native stars and polygons preserve their geometry. Unsupported vectors are reported and left unpainted instead of appearing as solid bounding rectangles. The design canvas selection draws an outline without tinting the source colors. Default text line height uses `normal` when Figma does not supply a measured value. These improvements do not recover image bytes absent from the source or establish pixel parity with a design that has not been visually compared.

Plugin v1.8 **Copy complete design** composites text-free graphic groups with their nested masks and blends, retains full image fill stacks, and falls back to complete layer text when styled runs are unavailable. It includes a bounded original PNG for the **Figma original / Generated HTML** comparison buttons. Builds continue to use editable layers. The renderer also preserves visible children of zero-sized unclipped groups and prevents Tailwind Preflight from shrinking artwork to a smaller parent. Re-import the updated plugin manifest and re-copy both desktop and mobile frames to recover missing source artwork. Normal clipboard copies can still omit source bytes; they cannot be reconstructed from image hashes alone.

Thin SVG artwork with subpixel or zero intrinsic dimensions can otherwise fail rasterisation with `svgload_buffer: bad dimensions`. The backend repairs the raster viewport from the original viewBox or, when necessary, the measured layer dimensions. Colors, transparency and the HTML layer geometry are retained, and the conversion report records the repair. This also works on already-copied exports. Plugin v1.7 attempts PNG export for these thin leaves, retaining the SVG for backend recovery if PNG is unavailable. Truly unreadable artwork still reports its exact layer path.

The optional `/api/figma/frames` and `/api/figma/import` endpoints remain available for API clients using a Figma token. The app's primary workflow uses native clipboard paste.

## Plugin workflow (no API token)

1. Download the plugin from Quick start in the app (or use the repository's figma-plugin folder).
2. In Figma desktop: Plugins / Development / Import plugin from manifest. Choose figma-plugin/manifest.json. If Figma requires an assigned plugin ID, create a development plugin and copy its generated ID into this manifest.
3. Select one frame, group or component. Run Frame to Code  Copy Layers.
4. Export selected frame / Copy layers. Paste into the app's desktop or mobile zone. You can also upload the plugin's downloaded JSON.
5. Add a second frame if needed. Build HTML, inspect Preview/Code, and download ZIP.

Choose **Upload JSON** to paste the plugin's copied layers into the desktop/mobile zones. PNG/SVG screenshots cannot produce editable text/layout and are rejected. The plugin path needs no Figma access token, has no network permissions and does not modify the document.

## Output and limits

The renderer preserves measured layer positions using Tailwind utilities only, with arbitrary values for exact geometry and visual styling. It generates no inline styles, style blocks, custom CSS files, or resizing scripts. Native CSS container units scale geometry, font sizes, borders and spacing together. Text supports styled runs. Containers named Button or CTA become buttons; their actions and navigation must be implemented separately. It does not infer semantic sections, interactive behavior or flexbox reflow from a screenshot.

With both frames, base and sm (640px) use the mobile geometry; md (768px), lg (1024px), xl (1280px) and 2xl (1536px) use the desktop geometry. All five breakpoint variants appear explicitly in generated HTML. Layouts scale fluidly between these widths and preserve source measurements at each original frame width. Supplying both exports is necessary to reproduce both designs. Frame dimensions come directly from the export. Complex masks, blends, image crops and custom font metrics may need manual adjustment. Available fonts load via Google Fonts; custom fonts must be installed or supplied separately. Tailwind and Google Fonts require internet in the exported page. Conversion itself makes no external API calls. The preview includes all breakpoint widths plus the original desktop/mobile widths; the Code tab supports wrapping on small screens.

Plugin v1.3 deduplicates artwork and compresses large exports with gzip. It supports 3,000 layers, nesting depth 50, 96 MB before packing, and 48 MB after packing per frame. The backend accepts files up to MAX_FILE_MB (50 MB default), and decompresses at most 128 MB. Both regular and packed JSON work with paste and file upload. Use Download JSON if the browser cannot copy a large payload. ZIPs contain index.html, README.md, conversion.json (counts and warnings), and artwork assets.

## Backend environment

| Variable | Purpose |
|---|---|
| PORT | API port (default 5000) |
| MONGO_URI | MongoDB connection string |
| CLIENT_URL | Allowed CORS origin (default http://localhost:5173) |
| MAX_FILE_MB | Per-file upload limit (default 50) |
| FIGMA_ACCESS_TOKEN | Optional server token for Figma link import; requires file_content:read |

Frontend VITE_API_URL defaults to /api, proxied to the backend by Vite.

## API

- POST /api/convert: multipart desktop, mobile, options JSON to ZIP
- POST /api/clipboard: native clipboard HTML to editable layers and a design canvas preview (no database write)
- POST /api/figma/frames: Figma link and token to available frame metadata
- POST /api/figma/import: Figma link, token and desktopId/mobileId to editable layer exports
- GET /api/plugin: downloadable development plugin ZIP
- GET /api/history: recent conversions
- GET /api/history/:id/download: download saved output

## Validation

Run npm.cmd test in backend and frontend. Run npm.cmd run build in frontend. Local native-paste tests use self-authored binary scenes with embedded schemas, deflate/Zstandard compression, styled text and nested sections. Live Figma copy/paste and plugin document access must also be checked manually inside Figma; local tests do not establish compatibility with every live Figma clipboard version.

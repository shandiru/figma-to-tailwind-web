# Frame to Code

Paste exported Figma layers and build editable HTML locally, without AI or API keys. Text stays text; containers become HTML; only individual artwork leaves become WebP assets. The workspace includes preview, code, conversion history and ZIP downloads.

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

## Figma workflow

1. Download the plugin from Quick start in the app (or use the repository's figma-plugin folder).
2. In Figma desktop: Plugins / Development / Import plugin from manifest. Choose figma-plugin/manifest.json. If Figma requires an assigned plugin ID, create a development plugin and copy its generated ID into this manifest.
3. Select one frame, group or component. Run Frame to Code  Copy Layers.
4. Export selected frame / Copy layers. Paste into the app's desktop or mobile zone. You can also upload the plugin's downloaded JSON.
5. Add a second frame if needed. Build HTML, inspect Preview/Code, and download ZIP.

Normal Figma Ctrl+C clipboard metadata is not supported. PNG/SVG screenshots cannot produce editable text/layout and are rejected. No Figma access token is needed. The plugin has no network permissions and does not modify the document.

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

Frontend VITE_API_URL defaults to /api, proxied to the backend by Vite.

## API

- POST /api/convert: multipart desktop, mobile, options JSON to ZIP
- GET /api/plugin: downloadable development plugin ZIP
- GET /api/history: recent conversions
- GET /api/history/:id/download: download saved output

## Validation

Run npm.cmd test in backend and frontend. Run npm.cmd run build in frontend. Plugin document access must also be checked inside Figma; local tests use simulated Figma nodes.

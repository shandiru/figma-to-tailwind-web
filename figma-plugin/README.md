# Frame to Code: copy Figma layers

v1.5 keeps masked illustrations together, exports icon-font glyphs as artwork, preserves paragraph spacing, and attempts PNG recovery before discarding logos with unavailable render bounds. Photo leaves export directly as PNG to retain their Figma crop. Cropped/tiled/filtered image fills are rasterised separately from editable frame contents using a temporary paint rectangle that is removed in a finally block. Re-export frames to recover assets missing from older JSON exports.

v1.4 resolves bound paint colors using each layer's variable mode. Concrete fills, strokes and corner radii take precedence over computed `var(--token)` declarations, so section backgrounds and button colors remain available outside Figma. Older exports containing token names without color values must be exported again to recover those values.

1. In the Figma desktop app, open **Plugins → Development → Import plugin from manifest** and choose this folder's `manifest.json`. If your Figma setup requires an assigned plugin ID, create a development plugin in Figma first and copy its generated `id` into this manifest.
2. Select exactly one frame, group, or component.
3. Run **Plugins → Development → Frame to Code — Copy Layers**.
4. Click **Export selected frame**, then **Copy layers**.
5. Hover the converter's desktop or mobile paste zone and press Ctrl/Cmd+V. Or download JSON from the plugin and upload it.
6. Repeat for the other frame if needed, then build the page.

No account token, network access, permanent document changes, or AI is used by the plugin. It reads the selected frame and exports its computed layer geometry and visual styles. Text becomes HTML text; containers become elements; artwork and text-free masked illustrations become assets. Temporary paint rectangles used for exact image crops are removed even if export fails. It does not export a screenshot of the entire frame.

The converter retains absolute layer geometry and scales each frame to fit. Supplying both frames switches layouts at 768px. It does not infer flexbox reflow, implement Figma prototype interactions, or guarantee exact rendering of masks, complex blends, custom fonts, advanced image crops, and text metrics. Name a container `Button` or `CTA` to emit a button; implement its behavior in the generated HTML. Fonts must be available locally or on Google Fonts. Frame widths come from the exported layers.

v1.3 stores repeated artwork once and compresses large exports with gzip when supported by the plugin browser. The converter accepts both ordinary and packed JSON. Large clipboard writes may be blocked by the browser; use Download JSON and upload the file in that case.

Limits are 3,000 layers, 96 MB of deduplicated JSON, and 48 MB after packing per frame. Backend uploads default to 50 MB; restart the backend after updating MAX_FILE_MB. Oversized frames can be exported in sections. Text and layer structure remain editable through packing.

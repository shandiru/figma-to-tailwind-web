# Frame to Code: copy Figma layers

v1.13 writes transforms relative to the immediate parent by calculating inverse(parent.absoluteTransform) ? node.absoluteTransform. Figma relativeTransform skips GROUP/BOOLEAN_OPERATION parents, so using it directly had applied group offsets twice. The export now includes coordinateSpace: parent. The app also normalizes unmarked v1.10?v1.12 exports automatically on import.

v1.12 applies bound paint alpha once. SolidPaint.opacity already carries the effective transparency; multiplying it by the COLOR variable alpha made 5% backgrounds become 0.25%, hiding secondary buttons, radio controls, text areas and select backgrounds. Re-export for accurate transparent styles.

v1.11 fixes variable modes in dynamic-page/incremental documents: collection IDs are resolved with getVariableCollectionByIdAsync, and collection objects are passed to setExplicitVariableModeForCollection. Image paints, artwork viewports and clones all await mode inheritance. Collections are cached per export; paint caches distinguish variable modes.

v1.10 isolates raster artwork in a temporary local viewport, keeps its original transform and adjusts the viewport origin in that same coordinate system. This avoids applying baked rotation twice and mixing world bounds with parent coordinates. All image fills, including FILL/FIT, are rendered by Figma with a fixed viewport so transparent margins and off-centre crops survive. Structural frames stay as editable/selectable containers. Temporary clones and viewports are removed on success and failure. The JSON includes exporterVersion for identification.

v1.9 makes **Export complete JSON** include the same composed artwork and original-frame comparison image as Copy complete design. Use Export complete JSON, then Download JSON. The app opens uploaded files on its section canvas and retains separate desktop/mobile selections. Converted artwork is lossless WebP.

v1.8 composites text-free artwork groups as PNG, retaining nested masks and blend effects. It exports full image fill stacks, recovers missing text runs, and includes an original-frame comparison image with Copy complete design. Re-export your desktop and mobile frames with this version.

v1.7 attempts native PNG export for thin vector leaves whose SVG viewport can round to zero raster pixels. If PNG export is unavailable, it retains the SVG for backend viewport repair. Already-copied SVG exports are repaired by the backend using their viewBox or measured layer geometry; text, layout dimensions and positions are retained.

v1.6 adds **Copy complete design**: one action exports the selected frame's actual artwork and editable layers, then attempts to copy the full payload. In the app, choose the Desktop or Mobile slot under Paste design, paste, select a section and build. If automatic copying is blocked, click Copy layers to retry with clipboard permission. No Figma token or JSON file upload is needed when copying succeeds.

v1.5 keeps masked illustrations together, exports icon-font glyphs as artwork, preserves paragraph spacing, and attempts PNG recovery before discarding logos with unavailable render bounds. Photo leaves export directly as PNG to retain their Figma crop. Cropped/tiled/filtered image fills are rasterised separately from editable frame contents using a temporary paint rectangle that is removed in a finally block. Re-export frames to recover assets missing from older JSON exports.

v1.4 resolves bound paint colors using each layer's variable mode. Concrete fills, strokes and corner radii take precedence over computed `var(--token)` declarations, so section backgrounds and button colors remain available outside Figma. Older exports containing token names without color values must be exported again to recover those values.

1. In the Figma desktop app, open **Plugins → Development → Import plugin from manifest** and choose this folder's `manifest.json`. If your Figma setup requires an assigned plugin ID, create a development plugin in Figma first and copy its generated `id` into this manifest.
2. Select exactly one frame, group, or component.
3. Run **Plugins → Development → Frame to Code — Copy Layers**.
4. Click **Copy complete design**. Alternatively, use **Export complete JSON**, then **Download JSON**.
5. In the converter, open **Upload JSON** and upload the file under Desktop or Mobile. Compare **Figma original** with **Generated HTML**, select matching sections, then build. Copy complete design can also be pasted under Paste design.
6. Repeat for the other frame if needed, then build the page.

No account token, network access, permanent document changes, or AI is used by the plugin. It reads the selected frame and exports its computed layer geometry and visual styles. Text becomes HTML text; containers become elements; artwork and text-free masked illustrations become assets. Temporary paint rectangles, artwork clones and viewport frames are removed even if export fails. Copy complete design also includes a bounded PNG of the original frame for the comparison view. This reference is never substituted for generated HTML.

The converter retains absolute layer geometry and scales each frame to fit. Supplying both frames switches layouts at 768px. It does not infer flexbox reflow, implement Figma prototype interactions, or guarantee exact rendering of masks, complex blends, custom fonts, advanced image crops, and text metrics. Name a container `Button` or `CTA` to emit a button; implement its behavior in the generated HTML. Fonts must be available locally or on Google Fonts. Frame widths come from the exported layers.

v1.3 stores repeated artwork once and compresses large exports with gzip when supported by the plugin browser. The converter accepts both ordinary and packed JSON. Large clipboard writes may be blocked by the browser; use Download JSON and upload the file in that case.

Limits are 3,000 layers, 96 MB of deduplicated JSON, and 48 MB after packing per frame. Backend uploads default to 50 MB; restart the backend after updating MAX_FILE_MB. Oversized frames can be exported in sections. Text and layer structure remain editable through packing.

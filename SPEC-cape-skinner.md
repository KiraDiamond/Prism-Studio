# Spec: Cape Skinner

## Objective

Add an in-app Cape Skinner to Prism Studio's Capes page. It derives a compact palette from either an uploaded Minecraft skin PNG or the selected account's current skin, recolours a chosen PNG cape while preserving transparency and visual shading, previews the result, and saves it as a new cape without modifying the source.

## Tech Stack

- Existing Tauri 2 application and vanilla HTML/CSS/JavaScript UI.
- Browser canvas for PNG decoding, preview rendering, and PNG encoding.
- A pure JavaScript RGBA recolour engine that can be unit-tested without the DOM.
- Existing Rust `add_cape` validation/storage command for the final generated PNG.
- Lazy catalogue source fetch for a selected remote cape; no bulk texture dependency.

## Commands

- Focused tests: `node --test scripts/test-cape-skinner.mjs`
- Application checks: `npm run check`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Release build: `npm run build`

## Project Structure

- `ui/cape-skinner-engine.js` — palette extraction and deterministic RGBA recolouring.
- `ui/capes.js` — Cape-page orchestration, file selection, preview, and save flow.
- `ui/index.html` / `ui/style.css` — accessible controls and responsive layout.
- `scripts/test-cape-skinner.mjs` — pure engine regression tests.

## Code Style

Keep transformation logic pure and UI orchestration separate:

```js
const result = recolorCape({ capePixels, skinPixels, paletteSize: 6 });
renderCapePreview(result.pixels);
```

Use existing buttons, panels, spacing, colors, and error/toast patterns rather than introducing a separate visual language.

## Testing Strategy

- RED/GREEN unit tests for palette extraction, deterministic output, transparent pixels, preserved alpha, luminance ordering, empty/invalid skins, and unchanged dimensions.
- Browser verification for uploaded-skin and current-account-skin flows, keyboard access, focus behavior, responsive layout, preview, save, and errors.
- Rust validation remains the final boundary for size, PNG validity, and supported cape dimensions.

## Boundaries

- Always: preserve every source alpha value; preserve relative light/dark ordering; create a new saved cape; provide a before/after preview; validate input dimensions and type.
- Ask first: adding manual painting, per-pixel editing, or cloud-based processing.
- Never: overwrite the original cape or skin, send either image to a new external service, expose account tokens, or flatten animated/GIF capes to a single frame.

## Success Criteria

- The user can choose an uploaded skin or the selected account's current skin.
- The engine extracts a compact deterministic palette from opaque skin pixels.
- The user can choose a saved cape or a saveable PNG catalogue cape.
- Choosing a catalogue cape fetches only that selected source and reuses the bounded cache.
- Recolouring preserves cape dimensions, alpha values, and brightness ordering.
- Before/after preview clearly identifies the selected skin and cape.
- Saving creates a separately named cape assigned to the selected account.
- GIF/animated and non-saveable catalogue capes show an explicit read-only message.
- Engine tests, browser checks, existing checks, Rust tests, and the Windows build pass.

## Open Questions

- None. The user approved automatic palette derivation, current/uploaded skin sources, non-destructive saving, shading/transparency preservation, and read-only animated sources.

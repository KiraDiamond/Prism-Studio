# Spec: Lazy Cape Assets

## Objective

Keep Prism Studio lightweight by removing the 5,081 raw textures and 5,081 generated back previews from the shipped UI bundle. Load only the images needed for visible cards, details, saving, or skinning, and retain a bounded local cache for repeat use.

## Tech Stack

- Existing Tauri 2 Rust backend for trusted network fetches and persistent cache management.
- Fixed Wynntils Athena cape endpoint; user-controlled URLs are never accepted.
- Existing vanilla JavaScript catalogue UI with native lazy image loading.

## Commands

- JavaScript checks: `npm run check`
- Cape tests: `npm run check:capes`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Release build: `npm run build`

## Project Structure

- `src-tauri/src/cape_catalog.rs` — fixed-host fetch, validation, cache, and size limits.
- `ui/catalog.js` — lazy preview requests and explicit unavailable/offline states.
- `ui/catalog/` — metadata and compact indexes only; no raw/back texture directories in the release bundle.
- App data cache — bounded, disposable downloaded cape sources/previews.

## Code Style

External data is validated before caching or exposing it to the UI:

```rust
let bytes = fetch_fixed_athena_sha(&sha)?;
validate_catalog_texture(&bytes, &expected_metadata)?;
cache_atomically(&sha, &bytes)?;
```

## Testing Strategy

- Rust tests for SHA validation, fixed-host enforcement, maximum response size, PNG/GIF validation, cache hits, atomic writes, eviction, and corrupt-cache recovery.
- Browser tests proving only visible card previews load, filter/sort causes no bulk fetch, selected saveable PNGs can be saved, and offline failures remain usable.
- Compare packaged installer size and assert raw/back catalogue directories are absent from packaged assets.

## Boundaries

- Always: fixed trusted endpoint, strict IDs and size limits, bounded cache, lazy loading, explicit offline/error state.
- Ask first: changing the upstream cape provider or retaining more than the cache limit.
- Never: accept arbitrary fetch URLs, download the complete catalogue at runtime, block app startup on the network, or flatten animated files.

## Success Criteria

- The installer contains no bundled raw or back cape texture collection.
- Opening Prism Studio downloads no cape image.
- Opening the catalogue downloads only previews entering the visible/prefetch window.
- Sorting and filtering use local metadata and cause no image downloads by themselves.
- Selecting, saving, or skinning one cape downloads at most that cape's source, then reuses the cache.
- The catalogue remains searchable and sortable offline; uncached previews show a useful placeholder.
- Cache corruption and network failure cannot damage saved capes or catalogue metadata.

## Open Questions

- Default cache budget will be chosen during planning from measured cape sizes, with a conservative target rather than an unbounded cache.


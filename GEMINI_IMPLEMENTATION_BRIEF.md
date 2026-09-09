# GEMINI_IMPLEMENTATION_BRIEF

## EXISTING_ARCHITECTURE
Implemented against Rust/Tauri 2, classic `ui/app.js`, `window.__TAURI__.core.invoke`, and skinview3d 3.4.2. Existing settings live at `%APPDATA%/PrismStudio/connection.json`. Library, launches, instance inspector and profile selection retain their existing bridge commands.

## VERIFIED_COMPATIBLE
Integrated Gemini's `SkinLibrary`, `SkinPack`, `StoredSkin`, SHA-256 texture storage and five-position account presentation. Its frontend snippets were adapted to the existing DOM and functions, rather than installed as competing renderers. Static cached character previews retain the existing low GPU usage.

## REQUIRED_CHANGES
Implemented corrections found during integration and subsequent audit:

- HIGH — `src-tauri/src/skins.rs`: Gemini only parsed PNG metadata. Validation now decodes a frame, checks dimensions, bounds base64/PNG sizes and hashes the uploaded bytes without re-encoding.
- HIGH — same module: reads now use the same semantic validator as writes; duplicate pack IDs, duplicate references, missing skin references, invalid models, names and texture IDs are rejected. Texture reads are bounded and verify content hashes.
- HIGH — same module: writes use an in-process mutex and unique temporary filenames. Interrupted replacement can recover the backup. This is a rollback-based Windows replacement, not an atomic transaction. Concurrent editing by separate app processes is not supported; stale full-library writes across processes remain a limitation.
- HIGH — proposed `ui/skins.js`: roster/selection re-entry and shared asynchronous viewer races avoided by retaining the existing synchronous cached-preview roster and selection functions. Each texture render sequence owns and disposes one viewer.
- HIGH — proposed account and pack markup: raw name interpolation was not adopted. Existing escaped markup and textContent remain in use; a literal HTML-like pack name was tested.
- HIGH — identity: new logical entries use UUIDs, while textures use hashes. Existing V1 IDs are preserved during migration so retries do not duplicate entries. Account snapshots reuse matching name/model/texture entries, preserving older textures in the archive.
- HIGH — migration: V1 is backed up and retained. The completion marker is set only after successful disk save and when every required texture is available. Preview-only legacy entries remain recoverable in V1 rather than becoming invented textures.
- MEDIUM — copying a skin to a pack previously discarded its texture and preview. It now copies the full entry and preserves its logical identity.
- MEDIUM — new skin/pack IDs previously used timestamps and could collide. They now use UUIDs.

## EXISTING_CODE_TO_REUSE
`setProfile`, `renderAccountCarousel`, `prepareAccountSkins`, `renderSkinPacks`, `renderSkinGrid`, `renderSelectedSkin`, `readSkinFile`, `addSkinFiles`, import/share dialogs and all existing bridge commands remain the integration points. `skin-library.js` handles disk persistence and migration.

## DATA_MODEL
- Library: packs plus a map of logical skin IDs to metadata.
- Pack: ID, name and unique references to skin IDs.
- Stored skin: name, slim/default model, textureId.
- Texture: original validated PNG at `%APPDATA%/PrismStudio/skins/textures/<sha256>.png`.
- Library: `%APPDATA%/PrismStudio/skins/library.json`.
- Reserved packs: `all-old-skins` and `account-skins`; custom removal/deletion does not delete archived entries.

## FRONTEND_FLOW
Load and validate disk library; batch textures; render static previews; merge recoverable V1 entries; archive current account textures. Existing account arrows select the launch profile. Pack shelf selects a roster and podium preview without recursive rendering. Custom packs support PNG import, copying entries, removing references, deletion and sharing. Save operations are queued in order. Applying skins to Minecraft accounts remains outside this implementation.

## RUST_COMMANDS
- `read_skin_library()` → validated library.
- `save_skin_library(library)` → validated serialized replacement.
- `process_and_save_texture(base64Data)` → SHA-256 texture ID after full decode.
- `read_skin_textures_batched(ids)` → validated data URLs, at most 128 IDs.
- `generate_uuid()` retained from the proposal; frontend uses native `crypto.randomUUID()`.

## SECURITY_AND_DATA_INTEGRITY
No account credentials added to frontend data. PNG limits, hash-only texture paths, referential validation, bounded batches, ordered saves, retained V1 backup and explicit save errors protect the new library. No automatic texture garbage collection occurs. Missing/corrupt textures produce an error rather than overwriting the disk library with a partial load.

## TESTS_REQUIRED
Completed: six Rust tests, including full PNG decoding/truncation, duplicate references/packs and separate entries sharing a texture; desktop test for PNG import to disk, reload persistence, escaped names, archive-preserving removal and absence of JavaScript errors. Existing bridge tests retained. Full Minecraft authentication/game startup not exercised.

Remaining coverage: multi-process conflict handling, crash injection during every replacement step, very large archives and exhaustive historical V1 corruption cases. These are not claimed as verified.

## GEMINI_TASK
Work from the integrated repository, not the original replacement snippets. Preserve the existing UI and bridge. Future changes should target the documented remaining coverage and limitations without reintroducing duplicate renderers, hash-as-logical-ID, header-only PNG checks or destructive migration. Rebuild and test the actual executable before claiming a release is complete.

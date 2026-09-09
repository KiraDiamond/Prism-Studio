# Local coding agent handoff

Project: `C:\Users\Jayden\Documents\Codex\2026-09-08\i-ha\outputs\Prism Studio`

Use a local Ollama runtime with `qwen2.5-coder:7b`. This machine has 32 GB system RAM and 16 GB dedicated AMD GPU memory, so 7B is a practical small-task model. Keep prompts narrow and review every diff; it is suitable for UI tweaks, small Rust fixes, tests, and build troubleshooting, but not unsupervised architectural changes.

Build/package notes:

- Rust/Tauri app with vanilla HTML/CSS/JavaScript.
- Preserve the existing Prism backend bridge, executable discovery, accounts, instances, and all current uncommitted changes.
- Build UI: `npm run build:ui`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Package executable: `npm run build` (the no-bundle release executable is under `src-tauri/target/release/`).
- Do not reset, clean, or overwrite unrelated work.

Skin verification still needed: inspect `work\anime-skins\manifest.json` and its PNGs; in the app add a PNG to the existing “Anime girls” pack, confirm it renders, close/reopen the app, and confirm it remains. The current UI notes say applying/uploading a skin through the Rust backend is disabled; do not claim that part works unless it is implemented and tested.

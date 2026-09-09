# Release validation — 0.1.0

Release candidate built on Windows, 9 September 2026. Further release work was stopped at the owner's usage-limit request.

## Passed

- Clean npm ci: 12 packages, no reported vulnerabilities.
- npm run check: JavaScript syntax, runtime references, matching versions, private-path scan and CSP.
- npm run build:ui: bundled local skin renderer.
- cargo test --manifest-path src-tauri/Cargo.toml: 7 passed, 0 failed.
- npm run build: optimized release executable and NSIS x64 installer produced successfully.
- Actual release desktop: 26 real instances, search, all three layouts, Settings/toolbar synchronization.
- Accounts: arrows and roster browse without changing profile; explicit button and Enter select; rapid navigation.
- Skins: cancelled creation, create/rename, PNG import, numbered names, skin rename, shared-ID copy/move, remove/delete, export payload/import, archive texture deduplication, reload persistence, invalid texture/path rejection.
- All pack rows remain visible together with the selected preview on the right, as requested.
- Six widths (640/768/1024/1280/1440/1920), four screens: no document horizontal overflow.
- No JavaScript exceptions during the completed desktop regression.

## Not verified in this final pass

- Installer installation/uninstallation on a clean Windows machine.
- Full Minecraft startup. Play process handoff is not proof that Minecraft launched.
- The additional inspector/launch/first-run integration run did not complete before the requested cutoff; no passing result is claimed.
- Final full-process restart, multi-window concurrent editing, every recovery scenario, and large-pack stress testing.
- GitHub CI execution or a published GitHub release.

Apply Skin remains disabled. Installer is unsigned. The project owner must select a project license before a licensed public release; none was invented.

## Delivered changes

Rust-backed skin metadata retains original deduplicated PNGs, reserved archive protections, validation, previous-save backup, and serialized writes. Legacy browser payloads move to a disk backup. Skin pack rendering/management now lives in skin-packs.js instead of duplicate implementations. The existing layout preference is preserved.

README is user-first with installation, connection, privacy, limitations, build instructions and four current screenshots under docs/screenshots. Windows CI builds an installer but does not publish or sign it.

Removed obsolete proposal implementations, internal agent handoffs, old installation text files, patch helpers/backups and outdated preview screenshots. The working Continue Playing changes were retained. No Prism account or instance configuration was rewritten.

## Artifacts

Prism Studio_0.1.0_x64-setup.exe — NSIS installer.
Prism Studio.exe — optimized executable; WebView2 required.
Prism Studio.zip — portable executable and documentation.

These are a usable release candidate, not a claim that every public-release acceptance check is complete.

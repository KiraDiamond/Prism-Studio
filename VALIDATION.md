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

The initial release pass left Apply Skin disabled; the update below adds it. Installer is unsigned. The project owner must select a project license before a licensed public release; none was invented.

## Delivered changes

Rust-backed skin metadata retains original deduplicated PNGs, reserved archive protections, validation, previous-save backup, and serialized writes. Legacy browser payloads move to a disk backup. Skin pack rendering/management now lives in skin-packs.js instead of duplicate implementations. The existing layout preference is preserved.

README is user-first with installation, connection, privacy, limitations, build instructions and four current screenshots under docs/screenshots. Windows CI builds an installer but does not publish or sign it.

Removed obsolete proposal implementations, internal agent handoffs, old installation text files, patch helpers/backups and outdated preview screenshots. The working Continue Playing changes were retained. No Prism account or instance configuration was rewritten.

## Artifacts

Prism Studio_0.1.0_x64-setup.exe — NSIS installer.
Prism Studio.exe — optimized executable; WebView2 required.
Prism Studio.zip — portable executable and documentation.

These are a usable release candidate, not a claim that every public-release acceptance check is complete.

## Apply Skin update

Apply Skin now uploads the stored original PNG to the official Minecraft Java skin endpoint. A dialog identifies the target account and offers Classic/Slim arms. Only Rust reads Prism's saved Minecraft session; no token is returned to JavaScript, logged, or passed through a process command line. The frontend cannot supply the service URL. HTTPS is required, redirects are disabled, requests have timeouts, and the authenticated profile ID is checked before uploading. Prism account files are not modified. Expired sessions require refreshing the account through Prism.

Protocol checked against [Prism's skin upload implementation](https://github.com/PrismLauncher/PrismLauncher/blob/develop/launcher/minecraft/skins/SkinUpload.cpp) and account serialization. No Prism source implementation was copied.

Ten Rust tests passed, including a local HTTP fixture that checks the identity request, authorization header, multipart PNG and Slim variant, plus rejection of expired/offline/ambiguous accounts and non-success statuses. Static checks and npm runtime dependency audit passed (zero vulnerabilities reported). No online account was changed during automated tests, so live Minecraft propagation is not claimed as tested. The account preview is updated for the current Studio session after success; Prism's own cached preview refreshes through Prism.

Updated production installer build passed. Actual release desktop checks passed: enabled Apply, named target and model dialog, Cancel, Rust identity rejection before network, retryable errors, invalid-model rejection, all pack rows retained, and no JavaScript errors. No live online skin was changed during testing.

## Version 0.1.1 — dialogs and updates

All three dialogs passed centering checks at 640, 1280 and 1920 pixels in the actual release executable. Ten Rust tests and static checks passed. The optimized executable and NSIS installer built successfully. Settings now includes Check for updates, and the standalone updater supports older EXE installations. The updater preserves data and a previous-EXE backup, validates release metadata and SHA-256, and refuses unverified downloads.

Public-release updater verification passed: downloaded the actual GitHub release without authentication, verified its digest and executable metadata, upgraded an isolated copy from 0.1.0 to 0.1.1, retained the previous EXE backup, and reported up to date on the second run. The repository was made public with owner approval.

# Prism Studio

A Carbon/Feather-inspired Windows desktop frontend for your existing Prism Launcher library. Compiled Rust backend, Tauri 2, and a small HTML/CSS/JavaScript interface rendered with Windows WebView2. No Node server, Electron, advertising, or telemetry at runtime.

## Run

Open **Prism Studio.exe**. Keep Prism Launcher installed. Studio detects its usual Windows data folder and executable; use **Connection** to select a portable/custom installation.

## Included

- Real Prism instances, icons, Minecraft versions, loaders, playtime, and groups (searchable).
- Search, loader filtering, recent/name/playtime sorting, grid/list views, and saved favourites.
- Existing account selection, including Prism's current default account on first run.
- Launch through Prism; optional direct server joining from instance details.
- Read-only installed-mod list with filtering and enabled/disabled status.
- Open an instance folder or its editor in Prism.
- Connection settings, explicit loading/error states, and keyboard navigation. Press `/` to search; Escape closes details.

## Boundaries

This is an independent frontend, not an embedded fork of Prism's C++ core. Launching uses the [documented Prism command-line interface](https://prismlauncher.org/wiki/getting-started/command-line-interface/): `--dir`, `--launch`, `--profile`, `--server`, and `--show`.

Prism still handles authentication, downloads, Java, modloaders, installing packs, and advanced instance editing. Those operations may display Prism windows. A successful launch handoff means the Prism process started; it does not prove that Minecraft finished launching. Studio cannot eliminate a failure or hang inside Prism. The interface remains independent of that process.

Account credentials are never sent to the frontend. Only profile names and the active flag are returned. Studio reads Prism files and doesn't rewrite its instance or account configuration. Favourites, UI choices and server addresses are stored in Studio's WebView storage; connection settings are in `%APPDATA%\PrismStudio\connection.json`.

## Build from source

Requires [Rust and Windows C++ build tools](https://v2.tauri.app/start/prerequisites/), Node.js for the build CLI, and WebView2. Node.js is not needed to run the compiled app.

```text
npm ci
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

The executable is produced at `src-tauri/target/release/prism-studio.exe` (or `CARGO_TARGET_DIR/release/prism-studio.exe` when configured).

For a sanitized connection diagnostic, run `prism-studio.exe --diagnose output.json`. This exports instance metadata, image data and profile names, never authentication tokens. Keep that output private if you do not want to share your profile names.

Independent personal project; not an official Prism Launcher, GDLauncher or Feather release.

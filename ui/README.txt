Prism Studio — Character Select + Skin Packs pass

Replace:
  ui/index.html
  ui/style.css
  ui/app.js

What changed:
- Accounts is now an old-school character-select carousel.
- No 1/8 or 8/8 counter.
- Arrow keys and left/right buttons browse profiles.
- Enter selects the centered profile.
- Skins is now pack-based.
- Default pack: All Old Skins.
- Create Pack works locally.
- Import Shared Pack reads Prism Studio JSON pack files.
- Share Pack exports a JSON pack file.
- Delete Pack works for user-created packs.
- Existing backend commands are unchanged.
- Applying/uploading Minecraft skins is still disabled because the Rust backend has no skin command yet.

Run:
  npm run dev

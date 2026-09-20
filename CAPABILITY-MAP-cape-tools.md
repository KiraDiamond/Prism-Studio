# Capability Map: Cape Tools

| Module id | Responsibility | Depends on |
|---|---|---|
| `sorter-hardening` | Build a compact global design index and make the launcher sort/filter all capes instantly without running Python, Node, OCR, or image comparisons on the user's computer. | — |
| `lazy-cape-assets` | Remove the thousands of bundled textures and load/cache only the cape previews or source files the user actually opens. | `sorter-hardening` metadata |
| `cape-skinner` | Recolour a PNG cape from an uploaded skin or the selected account's current skin, preview it, and save it as a new cape. | `lazy-cape-assets`, existing cape and account APIs |

Build order: `sorter-hardening` → `lazy-cape-assets` → `cape-skinner`. The pure colour engine may be developed alongside the first two modules.

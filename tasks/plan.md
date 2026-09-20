# Implementation Plan: Lightweight Cape Tools

## Overview

Replace bundled cape images with compact metadata plus lazy fixed-host fetching, retain instant global grouping/filtering, and add a non-destructive skin-derived cape recolour flow.

## Architecture Decisions

- Stage the production UI into `dist-ui` and exclude `catalog/raw` and `catalog/back`; maintainer source assets remain outside the shipped bundle.
- Use the existing complete variation index for global design sorting; no runtime image comparison or bulk download.
- Fetch one selected Athena source through Rust with strict SHA, metadata, size, format, and cache validation.
- Keep palette extraction/recolouring pure JavaScript; use canvas only for PNG decode/encode and preview.

## Task List

1. Add failing engine and lightweight-bundle tests.
2. Add staged UI build and remote lazy catalogue previews.
3. Add trusted single-cape Rust fetch/cache command.
4. Add Cape Skinner engine and Capes-page workflow.
5. Run checks, build, smoke-test, commit, and launch.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Athena unavailable | Missing uncached images | Metadata remains usable; clear offline placeholders. |
| Cross-origin canvas restrictions | Cannot recolour remote image in UI | Rust returns validated base64 for the one selected source. |
| Generated PNG exceeds 500 KB | Save rejected | Reuse existing validation and show the error without replacing the source. |
| Animated cape loses frames | Data loss | Disable skinning for animated/GIF records. |

## Open Questions

- None.


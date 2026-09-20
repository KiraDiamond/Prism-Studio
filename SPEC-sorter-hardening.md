# Spec: Sorter Hardening

## Objective

Ship a compact, precomputed global cape index with Prism Studio. The launcher must sort and filter every catalog entry immediately without downloading cape textures or running Python, Node.js, OCR, or pairwise image comparisons on the user's computer. Developer-side catalog maintenance remains reviewable and repeatable.

## Tech Stack

- Existing reviewed guild and recolour metadata as authoritative inputs.
- Build-time feature extraction and bucketed similarity grouping.
- A compact versioned JSON index consumed by the existing vanilla JavaScript catalogue UI.
- No runtime dependency beyond Prism Studio itself.

## Commands

- Test: `npm run check:capes`
- Static validation: `npm run check`
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`
- Application build: `npm run build`
- Index build: repository script to be added as `npm run build:cape-index`

## Project Structure

- `scripts/` — maintainer-only feature extraction, grouping, review, and tests.
- `ui/catalog/capes.json` — searchable metadata without embedded image bytes.
- `ui/catalog/variation-groups.json` — compact accepted global design groups.
- `ui/catalog/sort-index.json` — compact sort keys and similarity buckets when not already represented by the two files above.
- `work/` — ignored maintainer checkpoints, logs, and review results.

## Code Style

Keep generated index publication explicit and atomic:

```python
temporary.write_text(json.dumps(document), encoding="utf-8")
temporary.replace(destination)
```

Runtime sorting must use metadata/index fields only; it must never fall back to downloading every cape.

## Testing Strategy

- Unit-test deterministic global grouping, stable sort order, malformed/stale indexes, and atomic index publication.
- Verify the complete index covers every catalog SHA exactly once where required.
- Browser-test search, color, shade, size, visibility, guild, grouped/all/recolour-only modes without local textures.
- Prove the runtime performs no bulk cape download during startup or sorting.
- Confirm maintainer suggestions never alter reviewed metadata until explicitly accepted.

## Boundaries

- Always: validate complete catalog/index coverage; keep runtime sorting deterministic; use atomic replacements for generated indexes; retain explicit human review for guild and recolour claims.
- Ask first: changing catalogue scoring thresholds or metadata schemas.
- Never: automatically claim guild ownership, overwrite reviewed links, run maintainer tooling on an end-user computer, or download textures merely to sort/filter the catalog.

## Success Criteria

- Prism Studio starts and globally sorts/filters the complete catalog with no Python or Node runtime.
- Initial app startup transfers metadata/index files only and downloads zero cape textures.
- Sorting and filtering always operate on the complete local index; only currently visible previews may load afterward.
- Global design grouping is deterministic and covers all 5,081 current records without duplicate membership.
- Developer-side design, OCR, guild, and recolour suggestions remain review-only and resumable.
- Existing cape tests, new index tests, browser checks, and the Windows build pass.

## Open Questions

- None. The user explicitly requested a fast global launcher sort that stays lightweight and does not download all capes.

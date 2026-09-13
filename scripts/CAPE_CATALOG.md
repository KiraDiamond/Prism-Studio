# Updating the Wynntils cape catalog

Run `python -m pip install -r scripts/requirements-catalog.txt` once, then
`npm run sync:capes` to fetch Athena's current public cape list and add any
new textures to the bundled catalog. Existing cape records and hand-edited
details stay intact. New entries receive a stable `ATH-` display ID, a back
preview, resolution, color, shade, visible-back coverage, repeat grouping,
and searchable tags. Athena currently supplies only SHA, dimensions, and an
animated flag; years, ownership, guilds, and names are not inferred.
Animated PNG sheets use their first frame for the catalog preview. Athena also
serves two GIFs despite marking them non-animated; they get first-frame previews
and a `gif-source` tag. GIFs and PNGs above the app's 500 KB save limit remain
browsable but cannot be saved to My capes.

For an already downloaded export, run:

```text
python scripts/sync_athena_capes.py --list-file path/to/athena-wynntils-capes.json --image-dir path/to/sha-named-pngs
```

The app reads `ui/catalog/capes.json` and `ui/catalog/raw` / `ui/catalog/back`
from its packaged files. Rebuild the test app after a sync to ship the new
catalog. Re-running the sync adds only unseen Athena IDs, so manual edits to
existing records are preserved. Automatic color and similarity labels are a
starting point for review, not verified cape descriptions.

## Reviewing guild lettering

`npm run scan:guild -- SHA` processes **one specified cape**. It separates
dark, light, and quantized color layers from the back's bottom strip, enlarges
them without blur, and asks Tesseract.js for short text candidates. For a tag
elsewhere, pass `--region x,y,width,height` in source back-panel pixels.
The scan only prints suggestions; it never assigns a guild on its own. Tiny
pixel fonts can misread letters even at high OCR confidence.

After checking the cape visually, run `npm run scan:guild -- SHA --confirm Nia`
to resolve the prefix through Wynncraft's current guild API and save a
tentative guild link. This does not prove cape ownership. The catalog's Guild
filter and detail view then use that reviewed link. The sync command preserves
reviewed links and tags on subsequent runs. Scanning has no bulk mode.

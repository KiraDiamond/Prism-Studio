# Updating the Wynntils cape catalog

Run `python -m pip install -r scripts/requirements-catalog.txt` once, then
`npm run sync:capes` to fetch Athena's current public cape list and add any
new textures to the bundled catalog. Existing cape records and hand-edited
details stay intact. New entries receive a stable `ATH-` display ID, a back
preview, resolution, color, shade, visible-back coverage, repeat grouping,
and searchable tags. Athena currently supplies only SHA, dimensions, and an
animated flag; years, ownership, guilds, and names are not inferred.

For an already downloaded export, run:

```text
python scripts/sync_athena_capes.py --list-file path/to/athena-wynntils-capes.json --image-dir path/to/sha-named-pngs
```

The app reads `ui/catalog/capes.json` and `ui/catalog/raw` / `ui/catalog/back`
from its packaged files. Rebuild the test app after a sync to ship the new
catalog. Re-running the sync adds only unseen Athena IDs, so manual edits to
existing records are preserved. Automatic color and similarity labels are a
starting point for review, not verified cape descriptions.

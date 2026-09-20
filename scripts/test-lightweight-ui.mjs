import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['index.html','app.js','catalog.js','capes.js','cape-skinner-engine.js','catalog/capes.json','catalog/variation-groups.json'])
    assert(fs.existsSync('dist-ui/'+file),`missing staged ${file}`);
assert(!fs.existsSync('dist-ui/catalog/raw'),'raw capes must not ship');
assert(!fs.existsSync('dist-ui/catalog/back'),'cape previews must not ship');
const catalogJs=fs.readFileSync('dist-ui/catalog.js','utf8');
assert.match(catalogJs,/https:\/\/athena\.wynntils\.com\/capes\/get\/\$\{sha\}/);
assert.match(catalogJs,/IntersectionObserver/,'catalog previews must be loaded lazily');
assert.match(catalogJs,/\.cape-catalog-crop\[data-catalog-src\]/,'lazy loading must observe the sized preview frame, not its empty image');
assert.match(catalogJs,/fetch_catalog_cape/,'selected capes must cross the validated Rust boundary');
console.log('PASS lightweight UI contains metadata but no cape texture collection');

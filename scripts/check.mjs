import fs from 'node:fs';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const pkg=JSON.parse(fs.readFileSync('package.json'));const config=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json'));
assert.equal(pkg.version,config.version);assert(fs.readFileSync('src-tauri/Cargo.toml','utf8').includes(`version = "${pkg.version}"`));
const html=fs.readFileSync('ui/index.html','utf8');assert(html.includes(pkg.version));
for(const [,file] of html.matchAll(/<script src="([^"]+)"/g)){assert(fs.existsSync('ui/'+file));const result=spawnSync(process.execPath,['--check','ui/'+file],{encoding:'utf8'});if(result.status)throw Error(result.stderr);}
for(const file of fs.readdirSync('ui'))assert(!/proposal|\.bak$|INSTALL|README/.test(file),`Development file in runtime bundle: ${file}`);
for(const file of ['README.md','ui/app.js','ui/skin-library.js','ui/skin-packs.js'])assert(!/C:\\Users\\Jayden|Codex\\2026|SECRET_TOKEN/.test(fs.readFileSync(file,'utf8')),`Private path in ${file}`);
assert(!html.includes('src="https://'));assert(config.app.security.csp.includes("default-src 'self'"));
console.log('PASS JavaScript syntax, runtime references, version agreement, private-path scan and CSP');

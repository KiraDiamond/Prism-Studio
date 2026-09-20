import fs from 'node:fs';
import path from 'node:path';

const source=path.resolve('ui');
const destination=path.resolve('dist-ui');
const excluded=new Set([path.join('catalog','raw'),path.join('catalog','back')]);
fs.rmSync(destination,{recursive:true,force:true});
fs.mkdirSync(destination,{recursive:true});

function copy(directory,relative='') {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
        const nextRelative=path.join(relative,entry.name);
        if ([...excluded].some(value=>nextRelative===value||nextRelative.startsWith(value+path.sep))) continue;
        const from=path.join(directory,entry.name),to=path.join(destination,nextRelative);
        if (entry.isDirectory()) {fs.mkdirSync(to,{recursive:true});copy(from,nextRelative);}
        else fs.copyFileSync(from,to);
    }
}
copy(source);
console.log('Prepared lightweight UI without bundled cape textures.');

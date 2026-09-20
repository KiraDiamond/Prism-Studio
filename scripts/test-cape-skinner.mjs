import assert from 'node:assert/strict';
import {extractSkinPalette,recolorCapePixels} from '../ui/cape-skinner-engine.js';

const skin=new Uint8ClampedArray([
  20,30,50,255, 220,80,120,255, 245,205,150,255, 0,0,0,0,
  20,30,50,255, 220,80,120,255, 245,205,150,255, 255,255,255,10,
]);
const palette=extractSkinPalette(skin,3);
assert.equal(palette.length,3);
assert.deepEqual(palette,extractSkinPalette(skin,3),'palette extraction is deterministic');

const cape=new Uint8ClampedArray([
  10,10,10,255, 100,100,100,128, 240,240,240,255, 7,8,9,0,
]);
const recolored=recolorCapePixels(cape,palette);
assert.equal(recolored.length,cape.length);
assert.deepEqual([recolored[3],recolored[7],recolored[11],recolored[15]],[255,128,255,0]);
assert.deepEqual([...recolored.slice(12,15)],[7,8,9],'fully transparent RGB stays untouched');
const luminance=index=>.2126*recolored[index]+.7152*recolored[index+1]+.0722*recolored[index+2];
assert(luminance(0)<=luminance(4));
assert(luminance(4)<=luminance(8));
assert.throws(()=>extractSkinPalette(new Uint8ClampedArray([0,0,0,0]),4),/opaque pixels/i);
console.log('PASS cape palette and recolour invariants');

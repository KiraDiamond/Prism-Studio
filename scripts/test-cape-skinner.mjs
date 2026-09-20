import assert from 'node:assert/strict';
import {extractOutfitPalette,extractSkinPalette,recolorCapePixels} from '../ui/cape-skinner-engine.js';

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

const texture=new Uint8ClampedArray(64*64*4);
const paint=(x,y,width,height,rgba)=>{
  for (let row=y;row<y+height;row++) for (let column=x;column<x+width;column++)
    texture.set(rgba,(row*64+column)*4);
};
paint(0,0,64,16,[240,16,16,255]);       // head and hat: deliberately dominant, must be ignored
paint(0,16,16,16,[240,224,16,255]);     // leg: must be ignored
paint(16,16,24,16,[24,64,208,255]);     // torso
paint(32,20,8,12,[224,16,224,255]);      // rear torso panel: covered by cape, must be ignored
paint(32,36,8,12,[224,16,224,255]);      // rear jacket panel: covered by cape, must be ignored
paint(40,16,16,16,[32,192,96,255]);     // right arm
paint(32,48,16,16,[48,176,112,255]);    // left arm
const outfitPalette=extractOutfitPalette(texture,64,64,6);
assert(outfitPalette.some(([red,green,blue])=>blue>red && blue>green),'torso color is represented');
assert(outfitPalette.some(([red,green,blue])=>green>red && green>blue),'arm color is represented');
assert(!outfitPalette.some(([red,green,blue])=>red>green*2 && red>blue*2),'head color is excluded');
assert(!outfitPalette.some(([red,green,blue])=>red>150 && green>150 && blue<80),'leg color is excluded');
assert(!outfitPalette.some(([red,green,blue])=>red>150 && blue>150 && green<80),'rear torso colors are excluded');
console.log('PASS cape palette and recolour invariants');

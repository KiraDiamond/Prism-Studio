const luma=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];

function addPixel(buckets,pixels,index,weight=1) {
    if (pixels[index+3]<128) return;
    const rgb=[pixels[index],pixels[index+1],pixels[index+2]].map(value=>Math.min(255,Math.round(value/16)*16));
    const key=rgb.join(','),entry=buckets.get(key)||{rgb,count:0};
    entry.count+=weight;buckets.set(key,entry);
}

function selectPalette(buckets,limit) {
    const candidates=[...buckets.values()].sort((a,b)=>b.count-a.count||a.rgb.join(',').localeCompare(b.rgb.join(',')));
    if (!candidates.length) throw new Error('Skin has no opaque pixels.');
    const selected=[candidates.shift()];
    while (selected.length<limit && candidates.length) {
        let best=0,bestScore=-1;
        for (let i=0;i<candidates.length;i++) {
            const candidate=candidates[i];
            const distance=Math.min(...selected.map(other=>candidate.rgb.reduce((sum,value,index)=>sum+(value-other.rgb[index])**2,0)));
            const score=distance*(1+Math.log2(candidate.count+1));
            if (score>bestScore) {best=i;bestScore=score;}
        }
        selected.push(candidates.splice(best,1)[0]);
    }
    return selected.map(entry=>entry.rgb).sort((a,b)=>luma(a)-luma(b));
}

export function extractSkinPalette(pixels,limit=6) {
    if (!pixels || pixels.length%4 || limit<1) throw new Error('Invalid skin pixels.');
    const buckets=new Map();
    for (let index=0;index<pixels.length;index+=4) addPixel(buckets,pixels,index);
    return selectPalette(buckets,limit);
}

export function extractOutfitPalette(pixels,width,height,limit=6) {
    if (!pixels || width!==64 || ![32,64].includes(height) || pixels.length!==width*height*4 || limit<1)
        throw new Error('Skin must be 64x32 or 64x64 pixels.');
    const buckets=new Map();
    // Torso front/sides/top/bottom exclude the cape-covered rear panel at x32..39, y20..31.
    // Weighting favors the chest while retaining arms, jacket surfaces, and sleeves.
    const regions=[[16,16,24,4,4],[16,20,16,12,4],[40,16,16,16,2]];
    if (height===64) regions.push(
        [32,48,16,16,2],
        [16,32,24,4,3],[16,36,16,12,3],
        [40,32,16,16,2],[48,48,16,16,2]
    );
    for (const [x,y,regionWidth,regionHeight,weight] of regions)
        for (let row=y;row<y+regionHeight;row++) for (let column=x;column<x+regionWidth;column++)
            addPixel(buckets,pixels,(row*width+column)*4,weight);
    return selectPalette(buckets,limit);
}

export function recolorCapePixels(pixels,palette) {
    if (!pixels || pixels.length%4 || !Array.isArray(palette) || !palette.length) throw new Error('Invalid recolour input.');
    const colors=palette.map(rgb=>rgb.slice(0,3)).sort((a,b)=>luma(a)-luma(b));
    const result=new Uint8ClampedArray(pixels);
    const levels=[];
    for (let i=0;i<pixels.length;i+=4) if (pixels[i+3]) levels.push(luma([pixels[i],pixels[i+1],pixels[i+2]]));
    if (!levels.length) return result;
    const minimum=Math.min(...levels),maximum=Math.max(...levels),span=maximum-minimum;
    for (let i=0;i<pixels.length;i+=4) {
        if (!pixels[i+3]) continue;
        const value=luma([pixels[i],pixels[i+1],pixels[i+2]]);
        const position=(span ? (value-minimum)/span : value/255)*(colors.length-1);
        const low=Math.floor(position),high=Math.min(colors.length-1,low+1),mix=position-low;
        for (let channel=0;channel<3;channel++) result[i+channel]=Math.round(colors[low][channel]*(1-mix)+colors[high][channel]*mix);
    }
    return result;
}

const capeCatalog = { records:null, bySha:new Map(), filtered:[], matchCount:0,
    groups:new Map(), groupBySha:new Map(), uncertainBySha:new Map(), selected:null,
    expandedGroup:null, expandedAnchorSha:null, shown:60, visible:false, loading:null };
const catalogAsset = sha => `https://athena.wynntils.com/capes/get/${sha}`;
const catalogGroup = cape => capeCatalog.groupBySha.get(cape.sha1) || cape.sha1;
const catalogMembers = cape => capeCatalog.groups.get(catalogGroup(cape));
const catalogCollator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
let catalogImageObserver;

function observeCatalogImages(root=document) {
    const images=[...root.querySelectorAll('img[data-catalog-src]')];
    const load=image=>{
        image.src=image.dataset.catalogSrc;
        delete image.dataset.catalogSrc;
    };
    if (!('IntersectionObserver' in window)) { images.forEach(load); return; }
    catalogImageObserver??=new IntersectionObserver(entries=>{
        for (const entry of entries) if (entry.isIntersecting) {
            catalogImageObserver.unobserve(entry.target);
            load(entry.target);
        }
    },{rootMargin:'160px'});
    images.forEach(image=>catalogImageObserver.observe(image));
}

function catalogOption(select,value,label) {
    select.add(new Option(label,value));
}

async function loadCapeCatalog() {
    if (capeCatalog.records) return;
    if (capeCatalog.loading) return capeCatalog.loading;
    capeCatalog.loading=(async()=>{
        const [response,variationResponse]=await Promise.all([
            fetch('catalog/capes.json'),fetch('catalog/variation-groups.json')
        ]);
        if (!response.ok || !variationResponse.ok) throw new Error('Catalog files are unavailable.');
        const [data,variationIndex]=await Promise.all([response.json(),variationResponse.json()]);
        if (!Array.isArray(data.capes) || !data.capes.length) throw new Error('Catalog data is incomplete.');
        if (variationIndex.catalog_count!==data.capes.length) throw new Error('Cape variation index is out of date.');
        capeCatalog.records=data.capes;
        capeCatalog.bySha=new Map(data.capes.map(cape=>[cape.sha1,cape]));
        if (capeCatalog.bySha.size!==data.capes.length) throw new Error('Catalog contains repeated cape IDs.');
        for (const group of variationIndex.groups) {
            const members=group.variants.flatMap(variant=>variant.members);
            for (const sha of members) {
                if (!capeCatalog.bySha.has(sha) || capeCatalog.groupBySha.has(sha))
                    throw new Error('Cape variation index contains an invalid or repeated ID.');
                capeCatalog.groupBySha.set(sha,group.id);
            }
            capeCatalog.groups.set(group.id,{...group,members});
        }
        for (const pair of variationIndex.uncertain) {
            if (!capeCatalog.bySha.has(pair.a) || !capeCatalog.bySha.has(pair.b)) continue;
            for (const [sha,other] of [[pair.a,pair.b],[pair.b,pair.a]]) {
                if (!capeCatalog.uncertainBySha.has(sha)) capeCatalog.uncertainBySha.set(sha,[]);
                capeCatalog.uncertainBySha.get(sha).push(other);
            }
        }
        const date=new Date(data.generated_at);
        document.getElementById('cape-catalog-source').textContent=
            `${data.capes.length.toLocaleString()} capes · ${variationIndex.groups.length.toLocaleString()} expandable designs · ${variationIndex.uncertain.length} unresolved pairs kept separate · snapshot ${date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}`;

        const colors=new Set(), shades=new Set(), sizes=new Set(), tags=new Set(), guilds=new Map();
        for (const cape of data.capes) {
            colors.add(cape.color); shades.add(cape.shade); sizes.add(cape.resolution);
            cape.tags.forEach(tag=>tags.add(tag));
            cape.guilds.forEach(guild=>guilds.set(guild.tag, guild.name));
        }
        const addValues=(id,values)=>{
            const select=document.getElementById(id);
            for (const value of [...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))) catalogOption(select,value,value);
        };
        addValues('cape-catalog-color',colors);
        addValues('cape-catalog-shade',shades);
        addValues('cape-catalog-size',sizes);
        addValues('cape-catalog-tag',tags);
        const guildSelect=document.getElementById('cape-catalog-guild');
        for (const [tag,name] of [...guilds].sort((a,b)=>a[0].localeCompare(b[0]))) {
            catalogOption(guildSelect,tag,`${tag} · ${name}`);
        }
        filterCapeCatalog();
    })();
    try { await capeCatalog.loading; }
    finally { capeCatalog.loading=null; }
}

async function showCapeCatalog(force) {
    capeCatalog.visible=force===undefined ? !capeCatalog.visible : force;
    document.getElementById('cape-saved-workspace').hidden=capeCatalog.visible;
    document.getElementById('cape-catalog-workspace').hidden=!capeCatalog.visible;
    const button=document.getElementById('btn-browse-wynntils');
    button.textContent=capeCatalog.visible?'My capes':'Browse catalog';
    button.setAttribute('aria-pressed',String(capeCatalog.visible));
    if (!capeCatalog.visible) return;
    try { await loadCapeCatalog(); }
    catch(error) {
        document.getElementById('cape-catalog-source').textContent=String(error);
        showToast('Could not load the cape catalog: '+String(error),'error');
    }
}

function filterCapeCatalog() {
    if (!capeCatalog.records) return;
    const value=id=>document.getElementById(id).value;
    const terms=value('cape-catalog-search').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const color=value('cape-catalog-color'), shade=value('cape-catalog-shade');
    const size=value('cape-catalog-size'), tag=value('cape-catalog-tag'), guild=value('cape-catalog-guild');
    const visibility=value('cape-catalog-visibility');
    const matches=capeCatalog.records.filter(cape=>{
        if (visibility==='visible' && cape.coverage===0 || visibility==='transparent' && cape.coverage>0) return false;
        if (color && cape.color!==color || shade && cape.shade!==shade || size && cape.resolution!==size) return false;
        if (tag && !cape.tags.includes(tag)) return false;
        if (guild && (guild==='linked' ? !cape.guilds.length : !cape.guilds.some(link=>link.tag===guild))) return false;
        const searchable=[cape.id,cape.sha1,cape.color,cape.shade,cape.resolution,...cape.tags,
            ...cape.guilds.flatMap(link=>[link.tag,link.name])].join(' ').toLowerCase();
        return terms.every(term=>searchable.includes(term));
    });
    const sort=value('cape-catalog-sort');
    matches.sort((a,b)=>{
        if (sort==='coverage') return b.coverage-a.coverage||catalogCollator.compare(a.id,b.id);
        if (sort==='resolution') return catalogCollator.compare(a.resolution,b.resolution)||catalogCollator.compare(a.id,b.id);
        if (sort==='id') return catalogCollator.compare(a.id,b.id);
        return catalogCollator.compare(a.color,b.color)||catalogCollator.compare(a.shade,b.shade)||catalogCollator.compare(a.id,b.id);
    });
    capeCatalog.matchCount=matches.length;
    const repeats=value('cape-catalog-repeats');
    if (repeats!=='all') {
        const seen=new Set();
        capeCatalog.filtered=matches.filter(cape=>{
            const group=catalogGroup(cape);
            if (repeats==='only' && (catalogMembers(cape)?.variants.length || 0)<2) return false;
            if (seen.has(group)) return false;
            seen.add(group);
            return true;
        });
    } else capeCatalog.filtered=matches;
    const visibleGroups=new Set(capeCatalog.filtered.map(catalogGroup));
    if (capeCatalog.selected && !visibleGroups.has(catalogGroup(capeCatalog.selected))) {
        capeCatalog.selected=null;
        const note=document.createElement('p');
        note.textContent='Choose a cape to view its colors and tags.';
        document.getElementById('cape-catalog-detail').replaceChildren(note);
    }
    if (capeCatalog.expandedGroup && !visibleGroups.has(capeCatalog.expandedGroup)) {
        capeCatalog.expandedGroup=null;
        capeCatalog.expandedAnchorSha=null;
    }
    if (capeCatalog.expandedGroup && !capeCatalog.filtered.some(cape=>cape.sha1===capeCatalog.expandedAnchorSha)) {
        capeCatalog.expandedAnchorSha=capeCatalog.filtered.find(cape=>catalogGroup(cape)===capeCatalog.expandedGroup)?.sha1;
    }
    capeCatalog.shown=60;
    renderCapeCatalog();
}

function catalogPreview(cape,large=false) {
    if (cape.coverage===0) {
        const empty=document.createElement('div');
        empty.className='cape-catalog-no-preview'+(large?' cape-catalog-large':'');
        empty.textContent='Transparent back';
        return empty;
    }
    const frame=document.createElement('div');
    frame.className='cape-catalog-crop'+(large?' cape-catalog-large':'');
    const image=document.createElement('img');
    image.dataset.catalogSrc=catalogAsset(cape.sha1);
    image.alt=large?`Back of cape ${cape.id}`:'';
    image.decoding='async';
    image.addEventListener('error',()=>frame.classList.add('failed'),{once:true});
    frame.append(image);
    return frame;
}

function catalogVariationPanel(group) {
    const panel=document.createElement('section');
    panel.id='cape-catalog-variation-panel';
    panel.className='cape-catalog-variations';
    panel.setAttribute('aria-label','Color variations of this cape design');
    const heading=document.createElement('h4');
    heading.textContent=group.variants.length>1
        ? `${group.variants.length} color variations of this design`
        : `${group.members.length} identical copies of this design`;
    const note=document.createElement('p');
    note.textContent='Choose a variation to see its own details and save that exact cape.';
    const variants=document.createElement('div');
    variants.className='cape-catalog-variation-grid';
    for (const variant of group.variants) {
        const cape=capeCatalog.bySha.get(variant.representative);
        const card=document.createElement('button');
        card.type='button'; card.className='cape-catalog-variation';
        if (capeCatalog.selected && variant.members.includes(capeCatalog.selected.sha1)) card.classList.add('active');
        card.dataset.sha=cape.sha1;
        card.setAttribute('aria-label',`${cape.id}, ${cape.color} ${cape.shade}, ${variant.members.length} identical file${variant.members.length===1?'':'s'}`);
        const title=document.createElement('strong'); title.textContent=cape.id;
        const subtitle=document.createElement('span');
        subtitle.textContent=`${cape.color} · ${cape.shade}${variant.members.length>1?' · '+variant.members.length+' copies':''}`;
        card.append(catalogPreview(cape),title,subtitle);
        variants.append(card);
    }
    panel.append(heading,note,variants);
    return panel;
}

function renderCapeCatalog() {
    const grid=document.getElementById('cape-catalog-grid');
    catalogImageObserver?.disconnect();
    grid.replaceChildren();
    for (const cape of capeCatalog.filtered.slice(0,capeCatalog.shown)) {
        const group=catalogMembers(cape);
        const card=document.createElement('button');
        card.type='button';
        card.className='cape-catalog-card'+(capeCatalog.selected && catalogGroup(capeCatalog.selected)===catalogGroup(cape)?' active':'');
        card.dataset.sha=cape.sha1;
        card.setAttribute('aria-label',`${cape.id}, ${cape.color}, ${cape.resolution}${group?', '+group.variants.length+' variations':''}`);
        if (group) {
            card.setAttribute('aria-expanded',String(capeCatalog.expandedGroup===group.id));
            card.setAttribute('aria-controls','cape-catalog-variation-panel');
        }
        const title=document.createElement('strong'); title.textContent=cape.id;
        const subtitle=document.createElement('span');
        subtitle.textContent=`${cape.color} · ${cape.resolution}${group?' · '+(group.variants.length>1?group.variants.length+' variations':group.members.length+' copies'):''}`;
        card.append(catalogPreview(cape),title,subtitle);
        grid.append(card);
        if (group && capeCatalog.expandedGroup===group.id && capeCatalog.expandedAnchorSha===cape.sha1)
            grid.append(catalogVariationPanel(group));
    }
    const count=capeCatalog.filtered.length;
    const repeatMode=document.getElementById('cape-catalog-repeats').value;
    document.getElementById('cape-catalog-count').textContent=repeatMode!=='all'
        ? `${count.toLocaleString()} designs from ${capeCatalog.matchCount.toLocaleString()} capes`
        : `${count.toLocaleString()} ${count===1?'cape':'capes'}`;
    document.getElementById('cape-catalog-empty').hidden=count!==0;
    const more=document.getElementById('cape-catalog-more');
    more.hidden=capeCatalog.shown>=count;
    more.textContent=`Show more (${Math.min(capeCatalog.shown,count).toLocaleString()} of ${count.toLocaleString()})`;
    observeCatalogImages(grid);
}

function showCapeCatalogDetail(cape) {
    capeCatalog.selected=cape;
    document.querySelectorAll('.cape-catalog-card').forEach(card=>card.classList.toggle('active',catalogGroup(capeCatalog.bySha.get(card.dataset.sha))===catalogGroup(cape)));
    document.querySelectorAll('.cape-catalog-variation').forEach(card=>{
        const variant=catalogMembers(cape)?.variants.find(item=>item.representative===card.dataset.sha);
        card.classList.toggle('active',Boolean(variant?.members.includes(cape.sha1)));
    });
    const detail=document.getElementById('cape-catalog-detail');
    detail.replaceChildren();
    const heading=document.createElement('div'); heading.className='section-kicker'; heading.textContent='CAPE DETAILS';
    const title=document.createElement('h3'); title.textContent=cape.id;
    const preview=catalogPreview(cape,true);
    const facts=document.createElement('p'); facts.textContent=`${cape.resolution} · ${cape.color} · ${cape.shade} · ${Math.round(cape.coverage)}% back coverage${cape.source_format==='GIF'?' · GIF source':''}`;
    const id=document.createElement('p'); id.className='cape-catalog-hash'; id.textContent=`SHA-1 ${cape.sha1}`;
    const palette=document.createElement('div'); palette.className='cape-catalog-palette';
    for (const item of cape.palette.slice(0,6)) {
        const chip=document.createElement('span');
        chip.style.backgroundColor=item.hex;
        chip.title=`${item.hex} · ${item.percent_visible}% of visible back`;
        chip.setAttribute('aria-label',chip.title);
        palette.append(chip);
    }
    const tags=document.createElement('p'); tags.className='cape-catalog-tags'; tags.textContent=`Tags: ${cape.tags.join(', ')}`;
    detail.append(heading,title,preview,facts,id,palette,tags);
    const group=catalogMembers(cape);
    if (group) {
        const note=document.createElement('p');
        note.textContent=group.variants.length>1
            ? `${group.variants.length} accepted color variations share this design. Open the card to compare them.`
            : `${group.members.length} identical files share this design. Choose “Show every cape” to inspect each copy.`;
        detail.append(note);
    }
    const uncertain=capeCatalog.uncertainBySha.get(cape.sha1) || [];
    if (uncertain.length) {
        const section=document.createElement('div'); section.className='cape-catalog-uncertain';
        const label=document.createElement('strong'); label.textContent='Possible lookalikes · not confirmed recolors';
        section.append(label);
        for (const sha of uncertain.slice(0,5)) {
            const other=capeCatalog.bySha.get(sha);
            const button=document.createElement('button');
            button.type='button'; button.textContent=`View ${other.id}`;
            button.addEventListener('click',()=>showCapeCatalogDetail(other));
            section.append(button);
        }
        detail.append(section);
    }
    if (cape.guilds.length) {
        const guild=document.createElement('p');
        guild.textContent=cape.guilds.some(link=>link.status==='text-reviewed')
            ? `Reviewed lettering: ${cape.guilds.map(link=>`${link.tag} · ${link.name}`).join(', ')}. This matches a guild prefix, not verified cape ownership.`
            : `Possible guild: ${cape.guilds.map(link=>`${link.tag} · ${link.name} (${link.confidence.toLowerCase()} confidence)`).join(', ')}. Not verified ownership.`;
        detail.append(guild);
    }
    observeCatalogImages(detail);
    if (cape.animated || cape.source_format==='GIF' || cape.saveable===false) {
        const note=document.createElement('p');
        note.textContent=cape.animated || cape.source_format==='GIF'
            ? 'Athena serves this cape as an animated GIF. This is a first-frame preview; saving it as a PNG cape is unavailable.'
            : 'This cape PNG exceeds the app’s 500 KB save limit. It remains available to view in the catalog.';
        detail.append(note);
        return;
    }
    const button=document.createElement('button');
    button.type='button'; button.className='btn btn-primary'; button.textContent='Save to my capes';
    button.addEventListener('click',()=>saveCatalogCape(cape,button));
    detail.append(button);
}

async function saveCatalogCape(cape,button) {
    const account=state.profile;
    if (!account) { showToast('Choose a Minecraft account first.','error'); return; }
    button.disabled=true;
    button.textContent='Saving…';
    try {
        const base64Data=await invoke('fetch_catalog_cape',{sha:cape.sha1});
        const saved=await invoke('add_cape',{account,name:cape.id,base64Data});
        capeLibrary.push(saved);
        selectedCapes[account.toLowerCase()]=saved.id;
        localStorage.setItem('selected_capes_v1',JSON.stringify(selectedCapes));
        await showCapeCatalog(false);
        renderCapeLibrary();
        showToast(`${cape.id} saved for ${account}.`,'success');
    } catch(error) {
        showToast('Could not save catalog cape: '+String(error),'error');
    } finally {
        button.disabled=false;
        button.textContent='Save to my capes';
    }
}

for (const id of ['cape-catalog-search','cape-catalog-color','cape-catalog-shade','cape-catalog-size','cape-catalog-tag','cape-catalog-guild','cape-catalog-visibility','cape-catalog-repeats','cape-catalog-sort']) {
    document.getElementById(id).addEventListener(id==='cape-catalog-search'?'input':'change',filterCapeCatalog);
}
document.getElementById('cape-catalog-clear').addEventListener('click',()=>{
    for (const id of ['cape-catalog-search','cape-catalog-color','cape-catalog-shade','cape-catalog-size','cape-catalog-tag','cape-catalog-guild']) {
        document.getElementById(id).value='';
    }
    document.getElementById('cape-catalog-repeats').value='grouped';
    document.getElementById('cape-catalog-visibility').value='visible';
    document.getElementById('cape-catalog-sort').value='color';
    filterCapeCatalog();
});
document.getElementById('cape-catalog-grid').addEventListener('click',event=>{
    const variation=event.target.closest('.cape-catalog-variation');
    if (variation) {
        const cape=capeCatalog.bySha.get(variation.dataset.sha);
        if (cape) showCapeCatalogDetail(cape);
        return;
    }
    const card=event.target.closest('.cape-catalog-card');
    const cape=capeCatalog.bySha.get(card?.dataset.sha);
    if (!cape) return;
    const group=catalogMembers(cape);
    if (group) {
        const same=capeCatalog.expandedGroup===group.id && capeCatalog.expandedAnchorSha===cape.sha1;
        capeCatalog.expandedGroup=same?null:group.id;
        capeCatalog.expandedAnchorSha=same?null:cape.sha1;
        renderCapeCatalog();
    }
    showCapeCatalogDetail(cape);
});
document.getElementById('cape-catalog-more').addEventListener('click',()=>{
    capeCatalog.shown+=60;
    renderCapeCatalog();
});

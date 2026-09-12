const capeCatalog = { records:null, filtered:[], matchCount:0, groupSizes:new Map(), selected:null, shown:60, visible:false, loading:null };
const catalogAsset = (folder,sha) => `catalog/${folder}/${sha}.png`;
const catalogGroup = cape => cape.repeat_of || cape.sha1;

function catalogOption(select,value,label) {
    select.add(new Option(label,value));
}

async function loadCapeCatalog() {
    if (capeCatalog.records) return;
    if (capeCatalog.loading) return capeCatalog.loading;
    capeCatalog.loading=(async()=>{
        const response=await fetch('catalog/capes.json');
        if (!response.ok) throw new Error('Catalog files are unavailable.');
        const data=await response.json();
        if (!Array.isArray(data.capes) || data.capes.length!==2143) throw new Error('Catalog data is incomplete.');
        capeCatalog.records=data.capes;
        for (const cape of data.capes) {
            const group=catalogGroup(cape);
            capeCatalog.groupSizes.set(group,(capeCatalog.groupSizes.get(group)||0)+1);
        }
        const date=new Date(data.generated_at);
        document.getElementById('cape-catalog-source').textContent=
            `${data.capes.length.toLocaleString()} capes · snapshot ${date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})} · guild links are tentative; creation years are unavailable`;

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
    const matches=capeCatalog.records.filter(cape=>{
        if (color && cape.color!==color || shade && cape.shade!==shade || size && cape.resolution!==size) return false;
        if (tag && !cape.tags.includes(tag)) return false;
        if (guild && (guild==='linked' ? !cape.guilds.length : !cape.guilds.some(link=>link.tag===guild))) return false;
        const searchable=[cape.id,cape.sha1,cape.color,cape.shade,cape.resolution,...cape.tags,
            ...cape.guilds.flatMap(link=>[link.tag,link.name])].join(' ').toLowerCase();
        return terms.every(term=>searchable.includes(term));
    });
    capeCatalog.matchCount=matches.length;
    const repeats=value('cape-catalog-repeats');
    if (repeats==='hide') {
        const seen=new Set();
        capeCatalog.filtered=matches.filter(cape=>{
            const group=catalogGroup(cape);
            if (seen.has(group)) return false;
            seen.add(group);
            return true;
        });
    } else if (repeats==='only') {
        capeCatalog.filtered=matches.filter(cape=>capeCatalog.groupSizes.get(catalogGroup(cape))>1);
    } else capeCatalog.filtered=matches;
    if (capeCatalog.selected && !capeCatalog.filtered.includes(capeCatalog.selected)) {
        capeCatalog.selected=null;
        const note=document.createElement('p');
        note.textContent='Choose a cape to view its colors and tags.';
        document.getElementById('cape-catalog-detail').replaceChildren(note);
    }
    capeCatalog.shown=60;
    renderCapeCatalog();
}

function renderCapeCatalog() {
    const grid=document.getElementById('cape-catalog-grid');
    grid.replaceChildren();
    for (const cape of capeCatalog.filtered.slice(0,capeCatalog.shown)) {
        const card=document.createElement('button');
        card.type='button';
        card.className='cape-catalog-card'+(capeCatalog.selected?.sha1===cape.sha1?' active':'');
        card.dataset.sha=cape.sha1;
        card.setAttribute('aria-label',`${cape.id}, ${cape.color}, ${cape.resolution}`);
        const image=document.createElement('img');
        image.src=catalogAsset('back',cape.sha1);
        image.alt=''; image.loading='lazy';
        const title=document.createElement('strong'); title.textContent=cape.id;
        const copies=capeCatalog.groupSizes.get(catalogGroup(cape));
        const subtitle=document.createElement('span'); subtitle.textContent=`${cape.color} · ${cape.resolution}${copies>1?' · '+copies+' alike':''}`;
        card.title=copies>1?`${copies} entries have this or a very similar front/back preview`:'';
        card.append(image,title,subtitle);
        grid.append(card);
    }
    const count=capeCatalog.filtered.length;
    const repeatMode=document.getElementById('cape-catalog-repeats').value;
    document.getElementById('cape-catalog-count').textContent=repeatMode==='hide'
        ? `${count.toLocaleString()} designs from ${capeCatalog.matchCount.toLocaleString()} capes`
        : `${count.toLocaleString()} ${count===1?'cape':'capes'}`;
    document.getElementById('cape-catalog-empty').hidden=count!==0;
    const more=document.getElementById('cape-catalog-more');
    more.hidden=capeCatalog.shown>=count;
    more.textContent=`Show more (${Math.min(capeCatalog.shown,count).toLocaleString()} of ${count.toLocaleString()})`;
}

function showCapeCatalogDetail(cape) {
    capeCatalog.selected=cape;
    document.querySelectorAll('.cape-catalog-card').forEach(card=>card.classList.toggle('active',card.dataset.sha===cape.sha1));
    const detail=document.getElementById('cape-catalog-detail');
    detail.replaceChildren();
    const heading=document.createElement('div'); heading.className='section-kicker'; heading.textContent='CAPE DETAILS';
    const title=document.createElement('h3'); title.textContent=cape.id;
    const preview=document.createElement('img'); preview.className='cape-catalog-large';
    preview.src=catalogAsset('back',cape.sha1); preview.alt=`Back of cape ${cape.id}`;
    const facts=document.createElement('p'); facts.textContent=`${cape.resolution} · ${cape.color} · ${cape.shade} · ${Math.round(cape.coverage)}% back coverage`;
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
    const copies=capeCatalog.groupSizes.get(catalogGroup(cape));
    if (copies>1) {
        const note=document.createElement('p');
        note.textContent=`${copies} entries share this or a very similar front/back preview. Choose “Show all” to see each entry.`;
        detail.append(note);
    }
    if (cape.guilds.length) {
        const guild=document.createElement('p');
        guild.textContent=`Possible guild: ${cape.guilds.map(link=>`${link.tag} · ${link.name} (${link.confidence.toLowerCase()} confidence)`).join(', ')}. Not verified ownership.`;
        detail.append(guild);
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
        const response=await fetch(catalogAsset('raw',cape.sha1));
        if (!response.ok) throw new Error('Cape PNG is unavailable.');
        const file=new File([await response.blob()],`${cape.id}.png`,{type:'image/png'});
        const base64Data=await readCapeFile(file);
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

for (const id of ['cape-catalog-search','cape-catalog-color','cape-catalog-shade','cape-catalog-size','cape-catalog-tag','cape-catalog-guild','cape-catalog-repeats']) {
    document.getElementById(id).addEventListener(id==='cape-catalog-search'?'input':'change',filterCapeCatalog);
}
document.getElementById('cape-catalog-clear').addEventListener('click',()=>{
    for (const id of ['cape-catalog-search','cape-catalog-color','cape-catalog-shade','cape-catalog-size','cape-catalog-tag','cape-catalog-guild']) {
        document.getElementById(id).value='';
    }
    document.getElementById('cape-catalog-repeats').value='all';
    filterCapeCatalog();
});
document.getElementById('cape-catalog-grid').addEventListener('click',event=>{
    const card=event.target.closest('.cape-catalog-card');
    const cape=capeCatalog.records?.find(item=>item.sha1===card?.dataset.sha);
    if (cape) showCapeCatalogDetail(cape);
});
document.getElementById('cape-catalog-more').addEventListener('click',()=>{
    capeCatalog.shown+=60;
    renderCapeCatalog();
});

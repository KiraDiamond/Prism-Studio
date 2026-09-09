/* ---------------- Skin Packs ---------------- */

function ensureActiveSkinPack() {
    if (!state.skinPacks.some(pack => pack.id===state.activeSkinPackId)) {
        state.activeSkinPackId='all-old-skins';
    }
}

function activeSkinPack() {
    return state.skinPacks.find(pack => pack.id===state.activeSkinPackId) || state.skinPacks[0];
}

function allSkinsFlat() {
    return state.skinPacks.flatMap(pack => (pack.skins || []).map(skin => ({...skin,packId:pack.id,packName:pack.name})));
}

function skinById(id) {
    return allSkinsFlat().find(skin => skin.id===id) || null;
}

function createSkinVisualSeed(name) {
    let hash=0;
    for (const ch of String(name)) hash=((hash<<5)-hash)+ch.charCodeAt(0)|0;
    const hues=[210,250,330,20,160,45,285,195];
    const h=hues[Math.abs(hash)%hues.length];
    return { a:`hsl(${h} 18% 48%)`, b:`hsl(${(h+20)%360} 20% 20%)` };
}

function renderSkinPacks() {
    ensureActiveSkinPack();
    els.skinPackTabs.replaceChildren();

    state.skinPacks.forEach(pack => {
        const button=document.createElement('button');
        button.className=`pack-tab ${pack.id===state.activeSkinPackId?'active':''}`;
        button.dataset.packId=pack.id;
        button.setAttribute('aria-pressed',String(pack.id===state.activeSkinPackId));
        const previews=document.createElement('span');previews.className='pack-card-previews';
        for(const skin of pack.skins.slice(0,3)){if(skin.render){const img=document.createElement('img');img.src=skin.render;img.alt='';previews.append(img);}}
        const label=document.createElement('span');label.textContent=pack.name;const count=document.createElement('small');count.textContent=pack.skins.length+' skins';button.append(previews,label,count);
        els.skinPackTabs.appendChild(button);
    });

    const pack=activeSkinPack();
    els.activePackTitle.textContent=pack.name;
    els.activePackCount.textContent=`${pack.skins?.length || 0} skins`;
    els.btnDeleteSkinPack.disabled=!!pack.locked;
    els.btnAddSkinFile.disabled=!!pack.locked||!skinStorageReady;
    els.btnCreateSkinPack.disabled=!skinStorageReady;
    els.btnImportSkinPack.disabled=!skinStorageReady;
    document.getElementById('btn-rename-pack').disabled=!!pack.locked||!skinStorageReady;
    document.getElementById('btn-move-skin').disabled=!!pack.locked||!pack.skins.length||!skinStorageReady;
    document.getElementById('btn-remove-skin').disabled=!!pack.locked||!pack.skins.length;
    els.selectedSkinPackLabel.textContent=pack.name;

    renderSkinGrid(pack);
}

function renderSkinGrid(pack) {
    els.skinGrid.replaceChildren();
    els.skinPackEmpty.classList.add('hidden');
    if(!pack.skins.some(s=>s.id===state.selectedSkinId))state.selectedSkinId=pack.skins[0]?.id||'';
    for(const rowPack of state.skinPacks) {
        const section=document.createElement('section');section.className='skin-pack-row';
        section.classList.toggle('selected-pack',rowPack.id===pack.id);
        const heading=document.createElement('button');heading.type='button';heading.className='pack-row-heading';heading.dataset.packId=rowPack.id;
        heading.textContent=rowPack.name+' · '+rowPack.skins.length;heading.setAttribute('aria-pressed',String(rowPack.id===pack.id));
        section.append(heading);
        const row=document.createElement('div');row.className='pack-row-skins';
        for(const skin of rowPack.skins) {
            const tile=document.createElement('button');tile.type='button';tile.className='skin-tile';tile.dataset.skinId=skin.id;tile.dataset.packId=rowPack.id;
            const selected=rowPack.id===pack.id&&skin.id===state.selectedSkinId;tile.classList.toggle('active',selected);tile.setAttribute('aria-pressed',String(selected));tile.setAttribute('aria-label',skin.name);
            if(skin.render){const img=document.createElement('img');img.className='pack-real-skin';img.src=skin.render;img.alt='';row.append(tile);tile.append(img);}
            const label=document.createElement('span');label.textContent=skin.name||'Unnamed skin';tile.append(label);row.append(tile);
        }
        if(!rowPack.locked){const add=document.createElement('button');add.type='button';add.className='row-add-skin';add.dataset.packId=rowPack.id;add.textContent='+ Add skin';row.append(add);}
        else if(!rowPack.skins.length){const empty=document.createElement('span');empty.className='row-empty';empty.textContent='No skins';row.append(empty);}
        section.append(row);els.skinGrid.append(section);
    }
    renderSelectedSkin(pack.skins.find(s=>s.id===state.selectedSkinId),pack);
}

function renderSelectedSkin(skin,pack=activeSkinPack()) {
    document.getElementById('btn-apply-skin').disabled=!skin?.texture||!skinStorageReady||skinUploadBusy;
    els.skinPreviewCharacter.classList.toggle('has-real-skin',!!skin?.render);
    els.skinPreviewCharacter.querySelector('.pack-preview-image')?.remove();
    if(skin?.render){const img=document.createElement('img');img.className='pack-preview-image';img.src=skin.render;img.alt=skin.name;els.skinPreviewCharacter.append(img);}
    els.selectedSkinName.value=skin?.name || '';
    els.selectedSkinName.disabled=!skin;
    els.selectedSkinPackLabel.textContent=pack.name;

    const seed=skin?.visual || {a:'#59616d',b:'#2b3038'};
    els.skinPreviewCharacter.style.setProperty('--skin-a',seed.a);
    els.skinPreviewCharacter.style.setProperty('--skin-b',seed.b);

    els.btnAddSkinToPack.disabled=!skin || !state.skinPacks.some(p=>!p.locked&&p.id!==pack.id);
}

function nextSkinName() {
    const used=new Set(state.skinPacks.flatMap(p=>p.skins.map(s=>s.name)));
    let n=1;while(used.has(`Skin ${n}`))n++;
    return `Skin ${n}`;
}

function readSkinFile(file) {
    return new Promise((resolve,reject)=>{
        if (!file || (file.type !== 'image/png' && !/\.png$/i.test(file.name)) || file.size > 1_048_576) return reject(new Error('Choose a PNG skin under 1 MB'));
        const reader=new FileReader();
        reader.onerror=()=>reject(new Error('Could not read the PNG'));
        reader.onload=()=>{
            const image=new Image();
            image.onerror=()=>reject(new Error('That file is not a valid PNG'));
            image.onload=()=>{
                if (image.width!==64 || ![32,64].includes(image.height)) return reject(new Error('Skin must be 64x64 or legacy 64x32'));
                resolve(String(reader.result));
            };
            image.src=String(reader.result);
        };
        reader.readAsDataURL(file);
    });
}

let skinImportBusy=false;
async function addSkinFiles(files) {
    const pack=activeSkinPack();
    if(!skinStorageReady||skinImportBusy||pack.locked)return;
    if(files.length>500||pack.skins.length+files.length>500){showToast('A custom pack can contain up to 500 skins.','error');return;}
    skinImportBusy=true;
    try{
        const records=[];const used=new Set(allSkinsFlat().map(s=>s.name));
        for(const file of files){
            const texture=await readSkinFile(file);const textureId=await validateSkinTexture(texture);
            let n=1;while(used.has('Skin '+n))n++;const name='Skin '+n;used.add(name);
            records.push({id:crypto.randomUUID(),name,texture,textureId,model:'auto',source:'Library'});
        }
        await renderSkinTextures(records);pack.skins.push(...records);
        try{await persistSkinLibrary();}catch(error){pack.skins=pack.skins.filter(s=>!records.includes(s));throw error;}
        state.selectedSkinId=records[0]?.id||'';saveSkinPacks();renderSkinPacks();showToast('Added '+records.length+' skins','success');
    }catch(error){showToast('Skin import failed: '+String(error),'error');}
    finally{skinImportBusy=false;}
}

function slugId(name) {
    return crypto.randomUUID();
}

function createSkinPack(name) {
    if(!skinStorageReady)return;
    const trimmed=name.trim().slice(0,40);
    if (!trimmed) return;
    const pack={id:slugId(trimmed),name:trimmed,locked:false,skins:[]};
    state.skinPacks.push(pack);
    state.activeSkinPackId=pack.id;
    state.selectedSkinId='';
    saveSkinPacks();
    renderSkinPacks();
    showToast(`Created "${trimmed}"`,'success');
}

async function importSkinPackFile(file) {
    if(!skinStorageReady||skinImportBusy)return;skinImportBusy=true;
    try{
        if(file.size>20_000_000)throw new Error('Shared packs must be under 20 MB.');
        const parsed=JSON.parse(await file.text());
        if(parsed.format!=='prism-studio-skin-pack'||![1,2].includes(parsed.version))throw new Error('Unsupported Prism Studio pack format or version.');
        const raw=parsed.pack;
        if(!raw||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>40||!Array.isArray(raw.skins)||raw.skins.length>500)throw new Error('Invalid pack name or skin count.');
        const records=[];
        for(const skin of raw.skins){
            if(typeof skin.name!=='string'||!skin.name.trim()||skin.name.length>60||!['default','slim'].includes(skin.model))throw new Error('Every skin needs a valid name and model.');
            const texture=skin.texture||skin.textureBase64;const textureId=await validateSkinTexture(texture);
            records.push({id:crypto.randomUUID(),name:skin.name,model:skin.model,texture,textureId,source:'Library'});
        }
        await renderSkinTextures(records);
        const pack={id:crypto.randomUUID(),name:raw.name.trim(),locked:false,skins:records};state.skinPacks.push(pack);
        try{await persistSkinLibrary();}catch(error){state.skinPacks=state.skinPacks.filter(p=>p!==pack);throw error;}
        state.activeSkinPackId=pack.id;state.selectedSkinId=records[0]?.id||'';saveSkinPacks();renderSkinPacks();showToast('Pack imported','success');
    }catch(error){showToast('Import failed: '+String(error),'error');}
    finally{skinImportBusy=false;}
}

function skinPackExportData(pack=activeSkinPack()){
    if(pack.skins.some(s=>!s.texture))throw new Error('This pack contains an old preview without its original texture.');
    return {format:'prism-studio-skin-pack',version:2,pack:{name:pack.name,skins:pack.skins.map(s=>({name:s.name,model:s.model,texture:s.texture}))}};
}
async function shareActiveSkinPack(){
    await skinStorageQueue;
    const payload=skinPackExportData();const json=JSON.stringify(payload);
    if(new Blob([json]).size>20_000_000)throw new Error('Split this collection into packs smaller than 20 MB before sharing.');
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const link=document.createElement('a');link.href=url;
    link.download=(payload.pack.name.replace(/[^a-z0-9]+/gi,'-')||'skin-pack')+'.prism-skinpack.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renameActivePack(){
    const pack=activeSkinPack();if(pack.locked)return;
    els.createPackForm.dataset.renameId=pack.id;els.newPackName.value=pack.name;
    els.createPackDialog.querySelector('h3').textContent='Rename skin pack';els.confirmCreatePack.textContent='Save name';els.createPackDialog.showModal();els.newPackName.focus();
}
function chooseSkinDestination(move){
    const source=activeSkinPack();if(move&&source.locked)return;
    const skin=skinById(state.selectedSkinId);if(!skin)return;
    const dialog=document.getElementById('skin-destination-dialog');const select=document.getElementById('skin-destination');select.replaceChildren();
    for(const pack of state.skinPacks.filter(p=>!p.locked&&p.id!==source.id)){const option=document.createElement('option');option.value=pack.id;option.textContent=pack.name;select.append(option);}
    if(!select.options.length){showToast('Create another custom pack first.','warning');return;}
    dialog.dataset.source=source.id;dialog.dataset.skin=skin.id;dialog.dataset.move=String(move);dialog.querySelector('h3').textContent=move?'Move skin':'Add skin to pack';dialog.showModal();select.focus();
}
async function transferSkin(sourceId,skinId,targetId,move){
    const source=state.skinPacks.find(p=>p.id===sourceId),target=state.skinPacks.find(p=>p.id===targetId);const skin=source?.skins.find(s=>s.id===skinId);
    if(!skin||!target||target.locked||source===target||(move&&source.locked))throw new Error('Choose a valid custom pack.');
    if(!target.skins.some(s=>s.id===skin.id))target.skins.push(skin);
    if(move)source.skins=source.skins.filter(s=>s.id!==skinId);
    await persistSkinLibrary();renderSkinPacks();
}

function deleteActiveSkinPack() {
    const pack=activeSkinPack();
    if (pack.locked) return;
    if (!confirm(`Delete skin pack "${pack.name}"?`)) return;

    state.skinPacks=state.skinPacks.filter(p => p.id!==pack.id);
    state.activeSkinPackId='all-old-skins';
    state.selectedSkinId='';
    saveSkinPacks();
    renderSkinPacks();
}

let skinUploadBusy=false;
document.getElementById('btn-apply-skin').addEventListener('click',()=>{
    const skin=skinById(state.selectedSkinId);
    if(!skin||skinUploadBusy)return;
    if(!state.profile){showToast('Select your Minecraft account in Accounts first.','error');return;}
    const dialog=document.getElementById('apply-skin-dialog');
    dialog.dataset.skin=skin.id;dialog.dataset.profile=state.profile;
    document.getElementById('apply-skin-target').textContent=`Apply “${skin.name}” to ${state.profile}? This changes that account’s Minecraft Java skin.`;
    document.getElementById('apply-skin-model').value=skin.model==='slim'?'slim':'default';
    document.getElementById('apply-skin-status').textContent='';
    dialog.showModal();
});
document.getElementById('apply-skin-form').addEventListener('submit',async event=>{
    event.preventDefault();const dialog=document.getElementById('apply-skin-dialog');
    if(event.submitter?.value==='cancel'){dialog.close();return;}
    if(skinUploadBusy)return;
    const profile=dialog.dataset.profile,skinId=dialog.dataset.skin;
    const model=document.getElementById('apply-skin-model').value;
    const status=document.getElementById('apply-skin-status');const button=document.getElementById('confirm-apply-skin');
    skinUploadBusy=true;button.disabled=true;document.getElementById('apply-skin-model').disabled=true;
    document.getElementById('btn-apply-skin').disabled=true;status.textContent='Uploading to Minecraft…';
    try{
        await skinStorageQueue;
        await invoke('apply_skin',{skinId,profile,model});
        const skin=skinById(skinId),account=state.accounts.find(a=>a.name===profile);
        if(skin&&account){account.skin=skin.texture;account.model=model;await prepareAccountSkins();}
        dialog.close();showToast(`Skin applied to ${profile}. Rejoin your world or server to see it.`,'success');
    }catch(error){status.textContent=String(error);}
    finally{skinUploadBusy=false;button.disabled=false;document.getElementById('apply-skin-model').disabled=false;renderSkinPacks();}
});


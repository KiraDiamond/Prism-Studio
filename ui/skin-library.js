// Original textures and metadata live on disk. These maps hold session-only previews.
let skinStorageReady = false;
let skinStorageQueue = Promise.resolve();
let storedSkinLibrary = null;
const textureIds = new Map();
const previewCache = new Map();
let previewQueue = Promise.resolve();
let lastSkinSnapshot = '';

function renderSkinTextures(records) {
    const job = previewQueue.catch(() => {}).then(async () => {
        const { SkinViewer } = await import('./skinview.bundle.js');
        let viewer;
        try {
            for (const skin of records) {
                const key = skin.texture + ':' + skin.model;
                if (!previewCache.has(key)) {
                    if (!viewer) viewer = new SkinViewer({canvas:document.createElement('canvas'),width:260,height:420,pixelRatio:1,zoom:.9,fov:35,enableControls:false,renderPaused:true,preserveDrawingBuffer:true});
                    viewer.playerObject.rotation.y=.18;viewer.globalLight.intensity=2.8;viewer.cameraLight.intensity=.7;
                    await viewer.loadSkin(skin.texture,{model:skin.model || 'auto'});
                    skin.model=viewer.playerObject.skin.modelType;
                    viewer.render();previewCache.set(skin.texture+':'+skin.model,viewer.canvas.toDataURL('image/png'));
                }
                skin.render=previewCache.get(skin.texture+':'+skin.model);
            }
        } finally { if(viewer){viewer.dispose();viewer.renderer.forceContextLoss();} }
        return records;
    });
    previewQueue=job;return job;
}

async function validateSkinTexture(texture) {
    if(typeof texture!=='string'||texture.length>1_400_000)throw new Error('Skin texture is missing or too large.');
    let id=textureIds.get(texture);
    if(!id){id=await invoke('process_and_save_texture',{base64Data:texture});textureIds.set(texture,id);}
    return id;
}

async function initSkinStorage() {
    try {
        storedSkinLibrary=await invoke('read_skin_library');
        const legacy=localStorage.getItem('skin_packs_v1_backup')||localStorage.getItem('skin_packs_v1');
        if(legacy)await invoke('backup_legacy_skin_packs',{data:legacy});
        const textures={};const ids=[...new Set(Object.values(storedSkinLibrary.skins).map(s=>s.textureId))];
        for(let i=0;i<ids.length;i+=128)Object.assign(textures,await invoke('read_skin_textures_batched',{ids:ids.slice(i,i+128)}));
        const records=[];
        for(const [id,skin] of Object.entries(storedSkinLibrary.skins)){
            const texture=textures[skin.textureId];
            if(!texture)throw new Error('A saved texture is missing. Restore your skin-library backup before editing.');
            textureIds.set(texture,skin.textureId);records.push({id,...skin,texture,source:'Library'});
        }
        await renderSkinTextures(records);
        const entries=new Map(records.map(s=>[s.id,s]));
        state.skinPacks=storedSkinLibrary.packs.map(p=>({...p,locked:['all-old-skins','account-skins'].includes(p.id),skins:p.skins.map(id=>entries.get(id))}));
        let complete=true;
        if(!localStorage.getItem('skin_migration_v2_done')){
            const oldText=legacy||await invoke('read_legacy_skin_packs');
            if(oldText){
                const old=JSON.parse(oldText);if(!Array.isArray(old))throw new Error('The legacy skin backup is not a pack list.');
                for(const pack of old){
                    if(['all-old-skins','account-skins'].includes(pack.id))continue;
                    let target=state.skinPacks.find(p=>p.id===pack.id);
                    if(!target){target={id:/^[a-zA-Z0-9_-]{1,64}$/.test(pack.id)?pack.id:crypto.randomUUID(),name:String(pack.name||'Imported pack').slice(0,40),locked:false,skins:[]};state.skinPacks.push(target);}
                    for(const skin of pack.skins||[]){
                        try{
                            const texture=skin.texture||skin.textureBase64;
                            const textureId=await validateSkinTexture(texture);
                            const model=skin.model==='slim'?'slim':'default';
                            let entry=records.find(s=>s.textureId===textureId&&s.model===model&&s.name===skin.name);
                            if(!entry){entry={id:/^[a-zA-Z0-9_-]{1,64}$/.test(skin.id)?skin.id:crypto.randomUUID(),name:String(skin.name||nextSkinName()).slice(0,60),model,texture,textureId,source:'Library'};await renderSkinTextures([entry]);records.push(entry);}
                            if(!target.skins.some(s=>s.id===entry.id))target.skins.push(entry);
                        }catch{complete=false;}
                    }
                }
            }
        }
        skinStorageReady=true;
        await persistSkinLibrary();
        // The disk backup remains recoverable even after browser blobs are removed.
        localStorage.removeItem('skin_packs_v1');localStorage.removeItem('skin_packs_v1_backup');
        if(complete)localStorage.setItem('skin_migration_v2_done','true');
        else showToast('Some old previews had no usable texture. Their original data is retained in the local legacy backup.','warning');
    }catch(error){skinStorageReady=false;showToast('Skin library unavailable: '+String(error),'error');}
}

function persistSkinLibrary() {
    if(!skinStorageReady)return Promise.resolve();
    const snapshot=structuredClone(state.skinPacks);
    const signature=JSON.stringify(snapshot.map(p=>({id:p.id,name:p.name,skins:p.skins.map(s=>[s.id,s.name,s.model,s.textureId||textureIds.get(s.texture)])})));
    if(signature===lastSkinSnapshot)return skinStorageQueue;
    lastSkinSnapshot=signature;
    const job=skinStorageQueue.catch(()=>{}).then(async()=>{
        const lib=structuredClone(storedSkinLibrary);
        const archive=lib.packs.find(p=>p.id==='all-old-skins').skins;
        const archiveByTexture=new Map(archive.map(id=>[lib.skins[id].textureId,id]));
        lib.packs=[];
        for(const pack of snapshot){
            const refs=[];
            for(const skin of pack.skins){
                const textureId=skin.textureId||await validateSkinTexture(skin.texture);
                lib.skins[skin.id]={name:skin.name,model:skin.model==='slim'?'slim':'default',textureId};
                if(!refs.includes(skin.id))refs.push(skin.id);
                if(!archiveByTexture.has(textureId))archiveByTexture.set(textureId,skin.id);
            }
            lib.packs.push({id:pack.id,name:pack.id==='all-old-skins'?'All Old Skins':pack.id==='account-skins'?'Account Skins':pack.name,skins:refs});
        }
        lib.packs.find(p=>p.id==='all-old-skins').skins=[...archiveByTexture.values()];
        await invoke('save_skin_library',{library:lib});storedSkinLibrary=lib;
        const available=new Map(state.skinPacks.flatMap(p=>p.skins.map(s=>[s.id,s])));
        const archivePack=state.skinPacks.find(p=>p.id==='all-old-skins');
        // Preserve in-flight edits in other packs; only add available archive references.
        archivePack.skins=lib.packs.find(p=>p.id==='all-old-skins').skins.map(id=>available.get(id)||archivePack.skins.find(s=>s.id===id)).filter(Boolean);
    });
    skinStorageQueue=job;
    job.catch(error=>{lastSkinSnapshot='';showToast('Skins were not saved. '+String(error),'error');});
    return job;
}

async function archiveAccountSkins() {
    if(!skinStorageReady)return;
    const pack=state.skinPacks.find(p=>p.id==='account-skins');const records=[];
    for(const account of state.accounts){
        if(!account.skin||!skinRenders.has(account.name))continue;
        try{
            const textureId=await validateSkinTexture(account.skin);const model=account.model||'default';
            const existing=Object.entries(storedSkinLibrary.skins).find(([,s])=>s.textureId===textureId&&s.model===model);
            records.push({id:existing?.[0]||crypto.randomUUID(),name:existing?.[1].name||account.name,model,textureId,texture:account.skin,render:skinRenders.get(account.name),source:'Library'});
        }catch{showToast('A cached account skin could not be read. Refresh after updating it in Prism.','warning');}
    }
    pack.skins=records.filter((s,i)=>records.findIndex(other=>other.id===s.id)===i);await persistSkinLibrary();
}

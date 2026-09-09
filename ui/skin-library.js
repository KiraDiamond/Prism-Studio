// Gemini's texture/library split, adapted to the existing pack and preview UI.
let skinStorageReady=false;
let skinStorageQueue=Promise.resolve();
let storedSkinLibrary=null;
const textureIds=new Map();
const logicalIds=new Map();

async function initSkinStorage() {
    try {
        storedSkinLibrary=await invoke('read_skin_library');
        const old=state.skinPacks;
        const legacy=localStorage.getItem('skin_packs_v1');
        if(legacy&&!localStorage.getItem('skin_packs_v1_backup'))localStorage.setItem('skin_packs_v1_backup',legacy);
        const ids=[...new Set(Object.values(storedSkinLibrary.skins).map(s=>s.textureId))];
        const textures={};
        for(let i=0;i<ids.length;i+=128) Object.assign(textures,await invoke('read_skin_textures_batched',{ids:ids.slice(i,i+128)}));
        const entries={};
        const {SkinViewer}=await import('./skinview.bundle.js');
        const canvas=document.createElement('canvas');
        const viewer=new SkinViewer({canvas,width:260,height:420,pixelRatio:1,zoom:.9,fov:35,enableControls:false,renderPaused:true,preserveDrawingBuffer:true});
        try {
            viewer.playerObject.rotation.y=.18;viewer.globalLight.intensity=2.8;viewer.cameraLight.intensity=.7;
            for(const [id,skin] of Object.entries(storedSkinLibrary.skins)) {
                const texture=textures[skin.textureId];
                if(!texture) throw new Error('A saved skin texture is missing; original storage has been retained.');
                await viewer.loadSkin(texture,{model:skin.model});viewer.render();
                textureIds.set(texture,skin.textureId);logicalIds.set(id,id);
                entries[id]={id,name:skin.name,model:skin.model,texture,render:canvas.toDataURL('image/png'),source:'Library'};
            }
        } finally {viewer.dispose();viewer.renderer.forceContextLoss();}
        state.skinPacks=storedSkinLibrary.packs.map(p=>({...p,locked:['all-old-skins','account-skins'].includes(p.id),skins:p.skins.map(id=>entries[id])}));
        // Keep V1 intact. Reuse old IDs to make retries idempotent, including empty packs.
        if(!localStorage.getItem('skin_migration_v2_done')) {
            for(const pack of old) {
                if(pack.id==='all-old-skins')continue; // Previously generated account previews; rebuilt from Prism.
                let target=state.skinPacks.find(p=>p.id===pack.id);
                if(!target){target={...pack,locked:false,skins:[]};state.skinPacks.push(target);}
                for(const skin of pack.skins||[])if(!target.skins.some(s=>s.id===skin.id))target.skins.push(skin);
            }
        }
        skinStorageReady=true;
        await persistSkinLibrary();
    } catch(error) {showToast('Skin library: '+String(error),'error');}
}

function persistSkinLibrary() {
    if(!skinStorageReady)return skinStorageQueue;
    // Capture each mutation in order; a later write cannot overtake an earlier one.
    const packs=structuredClone(state.skinPacks);
    skinStorageQueue=skinStorageQueue.then(async()=>{
        const lib=structuredClone(storedSkinLibrary);
        let migrationComplete=true;
        const archive=new Set(lib.packs.find(p=>p.id==='all-old-skins').skins);
        lib.packs=[];
        for(const pack of packs) {
            const refs=[];
            for(const skin of pack.skins) {
                const texture=skin.texture||skin.textureBase64;
                if(!texture){migrationComplete=false;continue;}
                let textureId=textureIds.get(texture);
                if(!textureId){textureId=await invoke('process_and_save_texture',{base64Data:texture});textureIds.set(texture,textureId);}
                // Account snapshots get distinct identities when texture/model changes.
                const key=skin.source==='Prism'?`${skin.id}:${textureId}:${skin.model}`:skin.id;
                let id=logicalIds.get(key);
                if(!id) {
                    const existing=Object.entries(lib.skins).find(([entryId,s])=>entryId===skin.id || (skin.source==='Prism'&&s.name===skin.name&&s.textureId===textureId&&s.model===skin.model));
                    id=existing?.[0] || (/^[a-zA-Z0-9_-]{1,64}$/.test(skin.id)&&skin.source!=='Prism'?skin.id:crypto.randomUUID());
                    logicalIds.set(key,id);
                }
                lib.skins[id]={name:skin.name,model:skin.model==='slim'?'slim':'default',textureId};
                if(!refs.includes(id))refs.push(id);archive.add(id);
            }
            lib.packs.push({id:pack.id,name:pack.name,skins:refs});
        }
        lib.packs.find(p=>p.id==='all-old-skins').skins=[...archive];
        await invoke('save_skin_library',{library:lib});
        storedSkinLibrary=lib;
        // Archive references share the existing previews; removing a custom reference preserves the skin.
        const archivePack=state.skinPacks.find(p=>p.id==='all-old-skins');
        for(const pack of packs)for(const skin of pack.skins)if(skin.texture&&!archivePack.skins.some(s=>s.id===skin.id))archivePack.skins.push(skin);
        if(migrationComplete)localStorage.setItem('skin_migration_v2_done','true');
    }).catch(error=>showToast('Skins could not be saved: '+String(error),'error'));
    return skinStorageQueue;
}

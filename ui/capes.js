// Cape PNGs live in the test app's data folder; only the selected tile is a browser preference.
let capeLibrary=[];
let capePreviewKey='';
let capeSkinnerSource=null;
let capeSkinnerUploadedSkin='';
let capeSkinnerResult='';
const selectedCapes=loadJsonPreference('selected_capes_v1',{});
const wynntilsConnectionStatus={};
const wynntilsStatusText={
    checking:'Checking Wynntils login…',
    login:'Sign in on the Wynntils window. It will hide when this account is connected.',
    manage:'Wynntils window open. You can sign out and connect a different login here.',
    wrong_account:'Wynntils is signed in as a different account. Sign out there and use this Minecraft account.',
    connected:'Wynntils connected. The login window is hidden.',
    applying:'Applying cape in the background…',
    applied:'Cape applied on Wynntils.',
    error:'Wynntils could not apply the cape. Open its login window to check the site.'
};

function capesForProfile() {
    return capeLibrary.filter(cape=>cape.account.toLowerCase()===state.profile.toLowerCase());
}

function selectedCape() {
    return capesForProfile().find(cape=>cape.id===selectedCapes[state.profile.toLowerCase()]);
}

function resetCapePreview() {
    capePreviewKey='';
    const host=document.getElementById('cape-character-preview');
    host.querySelectorAll('.turnable-skin-canvas').forEach(canvas=>canvas.remove());
    host.classList.remove('has-turnable-skin');
    clearTurnableViewer('cape');
}

function updateCapeCharacterPreview(cape) {
    if (!document.getElementById('view-capes').classList.contains('active')) return;
    const account=state.accounts.find(item=>item.name.toLowerCase()===state.profile.toLowerCase());
    const key=cape && account?.skin ? `${cape.id}:${account.name}:${account.skin}:${account.model}` : '';
    if (key===capePreviewKey) return;
    if (!key) resetCapePreview();
    capePreviewKey=key;
    if (key) showTurnableViewer('cape',document.getElementById('cape-character-preview'),account.skin,account.model,300,370,`${account.name} wearing ${cape.name}`,cape.texture);
}

function renderCapeLibrary() {
    const accountSelect=document.getElementById('cape-account-select');
    accountSelect.replaceChildren();
    if (!state.accounts.length) {
        accountSelect.add(new Option('No accounts connected',''));
        accountSelect.disabled=true;
    } else {
        accountSelect.disabled=false;
        for (const account of state.accounts) accountSelect.add(new Option(account.name,account.name));
        accountSelect.value=state.profile;
    }

    const capes=capesForProfile();
    const key=state.profile.toLowerCase();
    if (!capes.some(cape=>cape.id===selectedCapes[key])) selectedCapes[key]=capes[0]?.id||'';
    const selected=selectedCape();
    const grid=document.getElementById('cape-grid');
    grid.replaceChildren();
    for (const cape of capes) {
        const tile=document.createElement('button');
        tile.type='button';
        tile.className='skin-tile cape-tile'+(cape.id===selected?.id?' active':'');
        tile.dataset.id=cape.id;
        tile.setAttribute('aria-label',`Select cape ${cape.name}`);
        tile.setAttribute('aria-pressed',String(cape.id===selected?.id));
        const image=document.createElement('img');
        image.src=cape.texture;
        image.alt='';
        const label=document.createElement('span');
        label.textContent=cape.name;
        tile.append(image,label);
        grid.append(tile);
    }
    document.getElementById('cape-empty').classList.toggle('hidden',capes.length>0);
    document.getElementById('cape-count').textContent=`${capes.length} ${capes.length===1?'cape':'capes'}`;
    document.getElementById('cape-library-title').textContent=state.profile?`${state.profile}'s capes`:'Your capes';
    document.getElementById('selected-cape-account').textContent=state.profile||'No account';
    document.getElementById('cape-wynntils-status').textContent=
        wynntilsStatusText[wynntilsConnectionStatus[key]]||'Wynntils login not checked for this account.';
    const name=document.getElementById('selected-cape-name');
    name.value=selected?.name||'';
    name.disabled=!selected;
    const image=document.getElementById('selected-cape-image');
    const placeholder=document.getElementById('cape-preview-placeholder');
    const hasCharacter=!!(selected && state.accounts.some(account=>account.name.toLowerCase()===key && account.skin));
    if (selected && !hasCharacter) {
        placeholder.textContent='Loading cape preview…';
        if (image.dataset.capeId!==selected.id) {
            image.hidden=true;
            placeholder.hidden=false;
            image.dataset.capeId=selected.id;
            image.removeAttribute('src');
            image.onload=()=>{
                if (image.dataset.capeId===selected.id) {
                    image.hidden=false;
                    placeholder.hidden=true;
                }
            };
            image.src=selected.texture;
        } else placeholder.hidden=!image.hidden;
    } else {
        image.hidden=true;
        image.onload=null;
        image.dataset.capeId='';
        image.removeAttribute('src');
        placeholder.textContent=selected?'Loading character preview…':'Choose a cape to preview';
        placeholder.hidden=false;
    }
    document.getElementById('cape-turn-hint').hidden=!hasCharacter;
    document.getElementById('btn-apply-cape').disabled=!selected;
    document.getElementById('btn-remove-cape').disabled=!selected;
    updateCapeCharacterPreview(selected);
}

async function initCapeLibrary() {
    try {
        const saved=await invoke('list_capes');
        capeLibrary=saved.capes;
        if (saved.unreadable) showToast(`${saved.unreadable} saved cape file(s) could not be read. Their files remain on disk.`,'warning');
    }
    catch(error) { showToast('Cape library unavailable: '+String(error),'error'); }
    renderCapeLibrary();
}

async function addCapeFiles(files) {
    const account=state.profile;
    if (!account) { showToast('Choose a Minecraft account first.','error'); return; }
    for (const file of files) {
        try {
            const base64Data=await readCapeFile(file);
            const name=(file.name.replace(/\.png$/i,'').trim()||'Cape').slice(0,60);
            const cape=await invoke('add_cape',{account,name,base64Data});
            capeLibrary.push(cape);
            selectedCapes[account.toLowerCase()]=cape.id;
            localStorage.setItem('selected_capes_v1',JSON.stringify(selectedCapes));
        } catch(error) { showToast(`${file.name}: ${String(error)}`,'error'); }
    }
    renderCapeLibrary();
}

async function applySavedCape() {
    const cape=selectedCape();
    if (!cape) return;
    const button=document.getElementById('btn-apply-cape');
    button.disabled=true;
    try {
        await invoke('apply_wynntils_cape',{account:cape.account,base64Data:cape.texture});
        showToast(`Applying ${cape.name} for ${cape.account}. A Wynntils sign-in window will appear if needed.`,'success');
    } catch(error) { showToast('Could not open Wynntils cape: '+String(error),'error'); }
    finally { button.disabled=false; }
}

function loadPixelImage(source) {
    return new Promise((resolve,reject)=>{
        const image=new Image();
        image.onload=()=>{
            const canvas=document.createElement('canvas');
            canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
            const context=canvas.getContext('2d',{willReadFrequently:true});
            context.drawImage(image,0,0);
            resolve({width:canvas.width,height:canvas.height,pixels:context.getImageData(0,0,canvas.width,canvas.height).data});
        };
        image.onerror=()=>reject(new Error('Could not read this image.'));
        image.src=source;
    });
}

function drawCapePixels(canvas,width,height,pixels) {
    canvas.width=width; canvas.height=height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
}

function currentAccountSkin() {
    return state.accounts.find(account=>account.name.toLowerCase()===state.profile.toLowerCase())?.skin||'';
}

function updateCapeSkinnerReadyState() {
    const current=document.getElementById('cape-skinner-current').checked;
    const hasSkin=current?Boolean(currentAccountSkin()):Boolean(capeSkinnerUploadedSkin);
    const animated=capeSkinnerSource?.kind==='catalog' && (capeSkinnerSource.cape.animated || capeSkinnerSource.cape.source_format==='GIF');
    document.getElementById('cape-skinner-generate').disabled=!capeSkinnerSource||!hasSkin||animated;
    if (animated) document.getElementById('cape-skinner-status').textContent='Animated catalog capes are read-only so their animation is never flattened.';
    else if (!hasSkin) document.getElementById('cape-skinner-status').textContent=current?'This account does not have a skin available. Upload one instead.':'Choose a skin PNG to continue.';
}

function openCapeSkinner() {
    if (!state.profile) { showToast('Choose a Minecraft account first.','error'); return; }
    const catalogCape=capeCatalog.visible?capeCatalog.selected:null;
    const savedCape=selectedCape();
    capeSkinnerSource=catalogCape?{kind:'catalog',cape:catalogCape}:savedCape?{kind:'saved',cape:savedCape}:null;
    if (!capeSkinnerSource) {
        showToast(capeCatalog.visible?'Choose a catalog cape first.':'Choose or add a saved cape first.','error');
        return;
    }
    capeSkinnerResult='';
    document.getElementById('cape-skinner-save').disabled=true;
    const label=capeSkinnerSource.kind==='catalog'?`${catalogCape.id} from the catalog`:savedCape.name;
    document.getElementById('cape-skinner-source').textContent=`Using ${label}. The original will not be changed.`;
    document.getElementById('cape-skinner-name').value=`${catalogCape?.id||savedCape.name} - skin matched`.slice(0,60);
    document.getElementById('cape-skinner-palette').replaceChildren();
    for (const id of ['cape-skinner-before','cape-skinner-after']) {
        const canvas=document.getElementById(id); canvas.width=64; canvas.height=32;
        canvas.getContext('2d').clearRect(0,0,64,32);
    }
    document.getElementById('cape-skinner-status').textContent='Generate a preview, then save it as a new cape.';
    if (!currentAccountSkin()) document.getElementById('cape-skinner-upload').checked=true;
    updateCapeSkinnerReadyState();
    document.getElementById('cape-skinner-dialog').showModal();
}

async function readSkinUpload(file) {
    if (!file || file.size>2*1024*1024 || file.type && file.type!=='image/png') throw new Error('Choose a skin PNG under 2 MB.');
    const data=await new Promise((resolve,reject)=>{
        const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('Could not read the skin PNG.')); reader.readAsDataURL(file);
    });
    const image=await loadPixelImage(data);
    if (image.width!==64 || ![32,64].includes(image.height)) throw new Error('Skin must be 64x32 or 64x64 pixels.');
    return data;
}

async function generateSkinnedCape() {
    const button=document.getElementById('cape-skinner-generate');
    const status=document.getElementById('cape-skinner-status');
    button.disabled=true; status.textContent='Building palette and recolouring cape…';
    try {
        const skinSource=document.getElementById('cape-skinner-current').checked?currentAccountSkin():capeSkinnerUploadedSkin;
        if (!skinSource) throw new Error('Choose a skin first.');
        const capeSource=capeSkinnerSource.kind==='catalog'
            ? await invoke('fetch_catalog_cape',{sha:capeSkinnerSource.cape.sha1})
            : capeSkinnerSource.cape.texture;
        const [skin,cape,engine]=await Promise.all([loadPixelImage(skinSource),loadPixelImage(capeSource),import('./cape-skinner-engine.js')]);
        const palette=engine.extractSkinPalette(skin.pixels,6);
        const recoloured=engine.recolorCapePixels(cape.pixels,palette);
        drawCapePixels(document.getElementById('cape-skinner-before'),cape.width,cape.height,cape.pixels);
        const after=document.getElementById('cape-skinner-after');
        drawCapePixels(after,cape.width,cape.height,recoloured);
        capeSkinnerResult=after.toDataURL('image/png');
        const paletteHost=document.getElementById('cape-skinner-palette'); paletteHost.replaceChildren();
        for (const rgb of palette) {
            const chip=document.createElement('span');
            chip.style.backgroundColor=`rgb(${rgb.join(',')})`; chip.title=`RGB ${rgb.join(', ')}`; paletteHost.append(chip);
        }
        document.getElementById('cape-skinner-save').disabled=false;
        status.textContent='Preview ready. Shading and transparency are preserved.';
    } catch(error) {
        capeSkinnerResult=''; document.getElementById('cape-skinner-save').disabled=true;
        status.textContent=String(error);
    } finally { updateCapeSkinnerReadyState(); }
}

async function saveSkinnedCape() {
    const name=document.getElementById('cape-skinner-name').value.trim();
    if (!name) { document.getElementById('cape-skinner-status').textContent='Give the new cape a name.'; return; }
    const button=document.getElementById('cape-skinner-save'); button.disabled=true;
    try {
        const saved=await invoke('add_cape',{account:state.profile,name,base64Data:capeSkinnerResult});
        capeLibrary.push(saved); selectedCapes[state.profile.toLowerCase()]=saved.id;
        localStorage.setItem('selected_capes_v1',JSON.stringify(selectedCapes));
        if (capeCatalog.visible) await showCapeCatalog(false);
        renderCapeLibrary(); document.getElementById('cape-skinner-dialog').close();
        showToast(`${name} saved as a new cape.`,'success');
    } catch(error) {
        document.getElementById('cape-skinner-status').textContent='Could not save cape: '+String(error);
        button.disabled=false;
    }
}

function setupCapeEvents() {
    window.__TAURI__?.event?.listen('wynntils-cape-status',event=>{
        const {account,status}=event.payload||{};
        if (!account || !wynntilsStatusText[status]) return;
        wynntilsConnectionStatus[account.toLowerCase()]=status;
        if (state.profile.toLowerCase()===account.toLowerCase()) renderCapeLibrary();
        if (status==='applied') showToast(`Cape applied for ${account}.`,'success');
        if (status==='error') showToast(`Could not apply cape for ${account}. Check Wynntils login.`,'error');
    });
    document.getElementById('cape-account-select').addEventListener('change',event=>setProfile(event.target.value));
    document.getElementById('btn-connect-wynntils').addEventListener('click',async()=>{
        if (!state.profile) { showToast('Choose a Minecraft account first.','error'); return; }
        const account=state.profile;
        try {
            await invoke('open_wynntils_window',{account});
            wynntilsConnectionStatus[account.toLowerCase()]='manage';
            renderCapeLibrary();
        } catch(error) { showToast('Could not open Wynntils login: '+String(error),'error'); }
    });
    document.getElementById('btn-browse-wynntils').addEventListener('click',()=>showCapeCatalog());
    document.getElementById('btn-cape-skinner').addEventListener('click',openCapeSkinner);
    document.getElementById('cape-skinner-close').addEventListener('click',()=>document.getElementById('cape-skinner-dialog').close());
    document.getElementById('cape-skinner-generate').addEventListener('click',generateSkinnedCape);
    document.getElementById('cape-skinner-save').addEventListener('click',saveSkinnedCape);
    document.getElementById('cape-skinner-choose-file').addEventListener('click',()=>document.getElementById('cape-skinner-file').click());
    for (const id of ['cape-skinner-current','cape-skinner-upload']) document.getElementById(id).addEventListener('change',event=>{
        capeSkinnerResult=''; document.getElementById('cape-skinner-save').disabled=true;
        if (event.target.id==='cape-skinner-upload' && event.target.checked && !capeSkinnerUploadedSkin) document.getElementById('cape-skinner-file').click();
        updateCapeSkinnerReadyState();
    });
    document.getElementById('cape-skinner-file').addEventListener('change',async event=>{
        try {
            capeSkinnerUploadedSkin=await readSkinUpload(event.target.files[0]);
            document.getElementById('cape-skinner-upload').checked=true;
            document.getElementById('cape-skinner-status').textContent=`Using uploaded skin ${event.target.files[0].name}.`;
        } catch(error) { capeSkinnerUploadedSkin=''; document.getElementById('cape-skinner-status').textContent=String(error); }
        updateCapeSkinnerReadyState();
    });
    document.getElementById('btn-add-cape').addEventListener('click',()=>{
        if (!state.profile) { showToast('Choose a Minecraft account first.','error'); return; }
        const input=document.getElementById('cape-file-input');
        input.value='';input.click();
    });
    document.getElementById('cape-file-input').addEventListener('change',event=>addCapeFiles([...event.target.files]));
    document.getElementById('cape-grid').addEventListener('click',event=>{
        const tile=event.target.closest('.cape-tile');
        if (!tile) return;
        selectedCapes[state.profile.toLowerCase()]=tile.dataset.id;
        localStorage.setItem('selected_capes_v1',JSON.stringify(selectedCapes));
        renderCapeLibrary();
    });
    document.getElementById('selected-cape-name').addEventListener('change',async event=>{
        const cape=selectedCape();
        if (!cape) return;
        const name=event.target.value.trim();
        try {
            await invoke('rename_cape',{id:cape.id,name});
            cape.name=name;
        } catch(error) { showToast('Could not rename cape: '+String(error),'error'); }
        renderCapeLibrary();
    });
    document.getElementById('btn-remove-cape').addEventListener('click',async()=>{
        const cape=selectedCape();
        if (!cape || !confirm(`Remove ${cape.name} from the test app's cape library?`)) return;
        try {
            await invoke('remove_cape',{id:cape.id});
            capeLibrary=capeLibrary.filter(item=>item.id!==cape.id);
            selectedCapes[state.profile.toLowerCase()]='';
            localStorage.setItem('selected_capes_v1',JSON.stringify(selectedCapes));
            renderCapeLibrary();
        } catch(error) { showToast('Could not remove cape: '+String(error),'error'); }
    });
    document.getElementById('btn-apply-cape').addEventListener('click',applySavedCape);
}

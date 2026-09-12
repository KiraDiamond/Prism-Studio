// Cape PNGs live in the test app's data folder; only the selected tile is a browser preference.
let capeLibrary=[];
const selectedCapes=loadJsonPreference('selected_capes_v1',{});

function capesForProfile() {
    return capeLibrary.filter(cape=>cape.account.toLowerCase()===state.profile.toLowerCase());
}

function selectedCape() {
    return capesForProfile().find(cape=>cape.id===selectedCapes[state.profile.toLowerCase()]);
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
    const name=document.getElementById('selected-cape-name');
    name.value=selected?.name||'';
    name.disabled=!selected;
    const image=document.getElementById('selected-cape-image');
    image.hidden=!selected;
    if (selected) image.src=selected.texture;
    else image.removeAttribute('src');
    document.getElementById('cape-preview-placeholder').hidden=!!selected;
    document.getElementById('btn-apply-cape').disabled=!selected;
    document.getElementById('btn-remove-cape').disabled=!selected;
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
        const path=await invoke('prepare_wynntils_cape',{base64Data:cape.texture});
        els.wynntilsCapeFile.value='';
        if (wynntilsCapePreviewUrl) URL.revokeObjectURL(wynntilsCapePreviewUrl);
        wynntilsCapePreviewUrl=null;
        els.wynntilsCapePreview.src=cape.texture;
        els.wynntilsCapePreview.hidden=false;
        els.wynntilsCapeAccount.textContent=`${cape.name} for ${cape.account}`;
        els.wynntilsCapePath.value=path;
        els.wynntilsCapeHandoff.hidden=false;
        els.wynntilsCapeStatus.textContent='On Wynntils, press Choose PNG, paste this path into the file picker, check the preview, then press Save.';
        try { await navigator.clipboard.writeText(path); } catch { /* Path is visible below. */ }
        els.wynntilsCapeDialog.showModal();
        await invoke('open_wynntils_capes');
    } catch(error) { showToast('Could not prepare cape: '+String(error),'error'); }
    finally { button.disabled=false; }
}

function setupCapeEvents() {
    document.getElementById('cape-account-select').addEventListener('change',event=>setProfile(event.target.value));
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

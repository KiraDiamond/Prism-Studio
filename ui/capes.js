// Cape PNGs live in the test app's data folder; only the selected tile is a browser preference.
let capeLibrary=[];
let capePreviewKey='';
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

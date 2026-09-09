
const skinRenders = new Map();
const skinHeads = new Map();
let renderingSkins = false;
async function prepareAccountSkins() {
    if (renderingSkins) return;
    renderingSkins = true;
    let viewer;
    try {
        const {SkinViewer} = await import('./skinview.bundle.js');
        const canvas = document.createElement('canvas');
        viewer = new SkinViewer({canvas,width:260,height:420,pixelRatio:1,zoom:.9,fov:35,enableControls:false,renderPaused:true,preserveDrawingBuffer:true});
        viewer.globalLight.intensity=2.8;viewer.cameraLight.intensity=.7;
        viewer.playerObject.rotation.y=.18;
        for (const account of state.accounts) {
            if (!account.skin || skinRenders.has(account.name)) continue;
            await viewer.loadSkin(account.skin,{model:account.model||'default'});
            viewer.render();skinRenders.set(account.name,canvas.toDataURL('image/png'));
            const image = new Image();image.src=account.skin;await image.decode();
            const face=document.createElement('canvas');face.width=32;face.height=32;
            const ctx=face.getContext('2d');ctx.imageSmoothingEnabled=false;
            const s=image.width/64;ctx.drawImage(image,8*s,8*s,8*s,8*s,0,0,32,32);ctx.drawImage(image,40*s,8*s,8*s,8*s,0,0,32,32);
            skinHeads.set(account.name,face.toDataURL('image/png'));
        }
        const pack=state.skinPacks.find(p=>p.id==='all-old-skins');
        if(pack){pack.name='Account skins';pack.skins=state.accounts.filter(a=>skinRenders.has(a.name)).map(a=>({id:'account-'+a.name,name:a.name,source:'Prism',render:skinRenders.get(a.name)}));}
        renderHeaderAccounts();renderAccountCarousel();renderSkinPacks();
    } catch(error) { console.error('Skin rendering failed',error); }
    finally { if(viewer){viewer.dispose();viewer.renderer.forceContextLoss();}renderingSkins=false; }
}
// Prism Studio Frontend — Character Select + Skin Packs
// Uses only the existing Tauri backend commands.
// Skin pack creation/import/share is stored locally in the frontend.

const invoke = window.__TAURI__?.core?.invoke || async function mockInvoke(cmd, args) {
    console.warn(`[Mock Tauri] ${cmd}`, args);
    if (cmd === 'library') return { instances: [], accounts: [], settings: { root: '', executable: '' }, warnings: [], executableFound: false };
    if (cmd === 'get_settings') return { root: '', executable: '' };
    if (cmd === 'mods') return [];
    if (cmd === 'save_connection') return { instances: [], accounts: [], settings: { root: '', executable: '' }, warnings: [], executableFound: true };
    if (cmd === 'launch') return 'Launch request sent to Prism';
    return null;
};

function loadJsonPreference(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

const DEFAULT_SKIN_PACKS = [
    { id: 'all-old-skins', name: 'All Old Skins', locked: true, skins: [] }
];

const state = {
    library: null,
    instances: [],
    accounts: [],
    settings: {},
    profile: localStorage.getItem('selected_profile') || '',
    viewMode: localStorage.getItem('view_mode') || 'grid',
    sortMode: localStorage.getItem('sort_mode') || 'recent',
    favorites: new Set(loadJsonPreference('favorites', [])),
    servers: loadJsonPreference('servers', {}),
    selectedId: null,
    currentFilter: 'all',
    searchQuery: '',
    modCache: {},
    modSearchQuery: '',
    launching: new Set(),

    accountCarouselIndex: 0,

    skinPacks: loadSkinPacks(),
    activeSkinPackId: localStorage.getItem('active_skin_pack') || 'all-old-skins',
    selectedSkinId: localStorage.getItem('selected_skin_id') || ''
};

function loadSkinPacks() {
    const stored = loadJsonPreference('skin_packs_v1', null);
    if (!Array.isArray(stored) || !stored.length) return structuredClone(DEFAULT_SKIN_PACKS);

    const hasOld = stored.some(pack => pack?.id === 'all-old-skins');
    return hasOld ? stored : [structuredClone(DEFAULT_SKIN_PACKS[0]), ...stored];
}

function saveSkinPacks() {
    localStorage.setItem('skin_packs_v1', JSON.stringify(state.skinPacks));
    localStorage.setItem('active_skin_pack', state.activeSkinPackId);
    localStorage.setItem('selected_skin_id', state.selectedSkinId || '');
}

const els = {
    views: [...document.querySelectorAll('.view')],
    navItems: [...document.querySelectorAll('.nav-item')],

    grid: document.getElementById('library-grid'),
    libraryCount: document.getElementById('library-count'),
    hero: document.getElementById('hero-section'),
    searchInput: document.getElementById('search-input'),
    filterContainer: document.getElementById('filter-container'),
    btnGrid: document.getElementById('btn-grid'),
    btnList: document.getElementById('btn-list'),
    sortSelect: document.getElementById('sort-select'),
    headerAccountSelect: document.getElementById('header-account-select'),
    headerAccountAvatar: document.getElementById('header-account-avatar'),
    btnRefreshLibrary: document.getElementById('btn-refresh-library'),

    statusPanel: document.getElementById('launcher-status'),
    statusMain: document.getElementById('status-main'),
    statusSub: document.getElementById('status-sub'),
    toastContainer: document.getElementById('toast-container'),

    btnOpenPrismAccounts: document.getElementById('btn-open-prism-accounts'),
    accountCarousel: document.getElementById('account-carousel'),
    accountNameplate: document.getElementById('account-nameplate'),
    accountRoster: document.getElementById('account-roster'),
    accountPrev: document.getElementById('account-prev'),
    accountNext: document.getElementById('account-next'),

    skinPackTabs: document.getElementById('skin-pack-tabs'),
    skinGrid: document.getElementById('skin-grid'),
    skinPackEmpty: document.getElementById('skin-pack-empty'),
    activePackTitle: document.getElementById('active-pack-title'),
    activePackCount: document.getElementById('active-pack-count'),
    selectedSkinName: document.getElementById('selected-skin-name'),
    selectedSkinPackLabel: document.getElementById('selected-skin-pack-label'),
    skinPreviewCharacter: document.getElementById('skin-preview-character'),
    btnCreateSkinPack: document.getElementById('btn-create-skin-pack'),
    btnAddSkinFile: document.getElementById('btn-add-skin-file'),
    skinFileInput: document.getElementById('skin-file-input'),
    btnImportSkinPack: document.getElementById('btn-import-skin-pack'),
    btnShareSkinPack: document.getElementById('btn-share-skin-pack'),
    btnDeleteSkinPack: document.getElementById('btn-delete-skin-pack'),
    btnAddSkinToPack: document.getElementById('btn-add-skin-to-pack'),
    skinPackFileInput: document.getElementById('skin-pack-file-input'),
    createPackDialog: document.getElementById('create-pack-dialog'),
    createPackForm: document.getElementById('create-pack-form'),
    newPackName: document.getElementById('new-pack-name'),
    confirmCreatePack: document.getElementById('confirm-create-pack'),

    settingExe: document.getElementById('setting-executable'),
    settingRoot: document.getElementById('setting-root'),
    btnSaveConnection: document.getElementById('btn-save-connection'),

    inspector: document.getElementById('inspector'),
    btnCloseInspector: document.getElementById('btn-close-inspector'),
    inspBannerBg: document.getElementById('insp-banner-bg'),
    inspBannerIcon: document.getElementById('insp-banner-icon'),
    inspName: document.getElementById('insp-name'),
    inspVersion: document.getElementById('insp-version'),
    inspLoader: document.getElementById('insp-loader'),
    inspPlaytime: document.getElementById('insp-playtime'),
    inspLastPlayed: document.getElementById('insp-lastplayed'),
    inspFav: document.getElementById('insp-fav'),
    inspServer: document.getElementById('insp-server'),
    btnPlay: document.getElementById('insp-btn-play'),
    btnEdit: document.getElementById('insp-btn-edit'),
    btnFolder: document.getElementById('insp-btn-folder'),
    inspModCount: document.getElementById('insp-mod-count'),
    inspModSearch: document.getElementById('insp-mod-search'),
    inspModList: document.getElementById('insp-mod-list')
};

async function init() {
    setupUIEvents();
    applyStoredPreferences();
    ensureActiveSkinPack();

    try {
        const settings = await invoke('get_settings');
        if (settings) {
            els.settingExe.value = settings.executable || '';
            els.settingRoot.value = settings.root || '';
        }
    } catch (error) {
        showToast(`Failed to load settings: ${String(error)}`, 'error');
    }

    await fetchLibrary();
    renderSkinPacks();
}

function applyStoredPreferences() {
    if (!['recent', 'az', 'playtime'].includes(state.sortMode)) state.sortMode = 'recent';
    if (!['grid', 'list'].includes(state.viewMode)) state.viewMode = 'grid';
    els.sortSelect.value = state.sortMode;
    updateViewModeClass();
}

function updateViewModeClass() {
    const isList = state.viewMode === 'list';
    els.grid.classList.toggle('list-view', isList);
    els.btnList.classList.toggle('active', isList);
    els.btnGrid.classList.toggle('active', !isList);
    els.btnList.setAttribute('aria-pressed', String(isList));
    els.btnGrid.setAttribute('aria-pressed', String(!isList));
}

async function fetchLibrary(isRefresh = false) {
    updateStatus('Connecting…', 'Checking Prism Launcher');

    try {
        const data = await invoke('library');
        state.modCache = {};
        processLibraryData(data);
        if (isRefresh) showToast('Library refreshed', 'success');
    } catch (error) {
        updateStatus('Connection error', 'Open Settings to reconnect', true);
        showToast(`Failed to connect to Prism: ${String(error)}`, 'error');
        renderConnectionError();
    }
}

function processLibraryData(data) {
    state.library = data || {};
    state.instances = Array.isArray(data?.instances) ? data.instances : [];
    state.accounts = Array.isArray(data?.accounts) ? data.accounts : [];
    state.settings = data?.settings || {};

    if (data?.settings) {
        els.settingExe.value = data.settings.executable || '';
        els.settingRoot.value = data.settings.root || '';
    }

    if (data?.executableFound === false) {
        updateStatus('Prism needs attention', 'Check launcher settings', true);
    } else {
        updateStatus('Launcher ready', `${state.instances.length} instances found`);
    }

    if (Array.isArray(data?.warnings)) {
        data.warnings.forEach(w => showToast(String(w), 'warning'));
    }

    resolveProfile();
    prepareAccountSkins();
    renderFilters();
    renderHeaderAccounts();
    syncAccountCarouselToProfile();
    renderAccountCarousel();
    renderLibrary();

    if (state.selectedId) {
        const stillExists = state.instances.some(instance => instance.id === state.selectedId);
        if (stillExists) selectInstance(state.selectedId);
        else closeInspector();
    }
}

function resolveProfile() {
    if (!state.accounts.length) {
        state.profile = '';
        localStorage.removeItem('selected_profile');
        return;
    }

    if (!state.accounts.some(account => account.name === state.profile)) {
        const prismDefault = state.accounts.find(account => account.active);
        state.profile = prismDefault?.name || state.accounts[0].name;
        localStorage.setItem('selected_profile', state.profile);
    }
}

function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function cssUrl(value) {
    return value ? `url(${JSON.stringify(String(value))})` : 'none';
}

/* ---------------- Library ---------------- */

function renderFilters() {
    const counts = new Map();

    for (const instance of state.instances) {
        const loader = instance.loader || 'Vanilla';
        const key = loader.toLowerCase();
        counts.set(key, { label: loader, count: (counts.get(key)?.count || 0) + 1 });
    }

    els.filterContainer.replaceChildren();

    const addChip = (label, filter, count) => {
        const button = document.createElement('button');
        button.className = `chip ${state.currentFilter === filter ? 'active' : ''}`;
        button.dataset.filter = filter;
        const text = document.createElement('span');
        text.textContent = label;
        const badge = document.createElement('span');
        badge.className = 'chip-count';
        badge.textContent = String(count);
        button.append(text, badge);
        els.filterContainer.appendChild(button);
    };

    addChip('All', 'all', state.instances.length);
    addChip('Favourites', 'favourites', state.instances.filter(i => state.favorites.has(i.id)).length);

    [...counts.entries()].sort((a,b) => a[1].label.localeCompare(b[1].label))
        .forEach(([filter, info]) => addChip(info.label, filter, info.count));
}

function getFilteredInstances() {
    let filtered = [...state.instances];

    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(instance =>
            [instance.name, instance.id, instance.version, instance.loader, instance.group]
                .filter(Boolean)
                .some(value => String(value).toLowerCase().includes(q))
        );
    }

    if (state.currentFilter === 'favourites') {
        filtered = filtered.filter(instance => state.favorites.has(instance.id));
    } else if (state.currentFilter !== 'all') {
        filtered = filtered.filter(instance => (instance.loader || 'Vanilla').toLowerCase() === state.currentFilter);
    }

    filtered.sort((a,b) => {
        if (state.sortMode === 'az') return (a.name || '').localeCompare(b.name || '');
        if (state.sortMode === 'playtime') return (b.playtime || 0) - (a.playtime || 0);
        return (b.lastLaunch || 0) - (a.lastLaunch || 0);
    });

    return filtered;
}

function renderLibrary() {
    const filtered = getFilteredInstances();
    els.libraryCount.textContent = String(filtered.length);
    els.grid.replaceChildren();

    if (!state.instances.length) {
        renderEmptyState('No instances found','Check your Prism Launcher connection or add an instance in Prism.',
            [{label:'Open Settings',action:'goto-settings',primary:true}]);
        els.hero.style.display = 'none';
        return;
    }

    if (!filtered.length) {
        renderEmptyState('Nothing here yet', state.currentFilter === 'favourites' ? 'Favourite an instance and it will appear here.' : 'Try changing your search or filter.', []);
        els.hero.style.display = 'none';
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const instance of filtered) fragment.appendChild(createInstanceCard(instance));
    els.grid.appendChild(fragment);
    renderHero();
}

function createInstanceCard(instance) {
    const card = document.createElement('article');
    card.className = `card ${state.selectedId === instance.id ? 'selected' : ''}`;
    card.dataset.id = instance.id;

    const isFavourite = state.favorites.has(instance.id);
    const isLaunching = state.launching.has(instance.id);

    card.innerHTML = `
        <div class="card-banner">
            <div class="card-banner-bg"></div>
            <img class="card-banner-icon" alt="">
            <button class="card-fav-btn ${isFavourite ? 'active' : ''}" data-action="favorite"
                    aria-label="Toggle favourite" aria-pressed="${isFavourite}">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="m12 3 2.67 5.41 5.97.87-4.32 4.21 1.02 5.95L12 16.63l-5.34 2.81 1.02-5.95-4.32-4.21 5.97-.87L12 3Z"/></svg>
            </button>
        </div>
        <div class="card-content">
            <div class="card-title">${escapeHTML(instance.name || 'Unknown')}</div>
            <div class="card-meta">
                <span class="badge">${escapeHTML(instance.version || 'Unknown')}</span>
                <span class="badge">${escapeHTML(instance.loader || 'Vanilla')}</span>
            </div>
            <div class="card-playtime">${formatPlaytime(instance.playtime)} played</div>
            <div class="card-actions">
                <button class="btn card-play-btn" data-action="play" ${isLaunching ? 'disabled' : ''}>${isLaunching ? 'Launching…' : 'Play'}</button>
                <button class="btn btn-secondary card-details-btn" data-action="details">Details</button>
            </div>
        </div>
    `;

    applyInstanceArtwork(card.querySelector('.card-banner-bg'), card.querySelector('.card-banner-icon'), instance);
    return card;
}

function applyInstanceArtwork(backgroundElement, imageElement, instance) {
    const icon = instance?.icon || '';
    if (backgroundElement) backgroundElement.style.backgroundImage = cssUrl(icon);

    if (imageElement) {
        if (icon) {
            imageElement.src = icon;
            imageElement.style.display = '';
        } else {
            imageElement.removeAttribute('src');
            imageElement.style.display = 'none';
        }
    }
}

function renderHero() {
    if (state.currentFilter !== 'all' || state.searchQuery || !state.instances.length) {
        els.hero.style.display = 'none';
        els.hero.replaceChildren();
        return;
    }

    const instance = [...state.instances].sort((a,b) => (b.lastLaunch || 0) - (a.lastLaunch || 0))[0];
    const isLaunching = state.launching.has(instance.id);

    els.hero.style.display = 'block';
    els.hero.innerHTML = `
        <div class="hero-bg"></div><div class="hero-vignette"></div>
        <div class="hero-content">
            <div class="hero-info">
                <div class="section-kicker">CONTINUE PLAYING</div>
                <h1>${escapeHTML(instance.name || 'Unknown')}</h1>
                <div class="hero-meta-line">${escapeHTML(instance.version || 'Unknown')} · ${escapeHTML(instance.loader || 'Vanilla')} · ${escapeHTML(formatPlaytime(instance.playtime))} played</div>
                <div class="hero-actions">
                    <button class="btn hero-play" data-action="hero-play" data-id="${escapeHTML(instance.id)}" ${isLaunching?'disabled':''}>${isLaunching?'Launching…':'Play'}</button>
                    <button class="btn btn-secondary" data-action="hero-details" data-id="${escapeHTML(instance.id)}">View details</button>
                </div>
            </div>
            <div class="hero-art"><img class="hero-crisp-icon" alt=""></div>
        </div>
    `;

    applyInstanceArtwork(els.hero.querySelector('.hero-bg'), els.hero.querySelector('.hero-crisp-icon'), instance);
}

function renderEmptyState(title, body, actions) {
    const box = document.createElement('div');
    box.className = 'empty-state';
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = body;
    box.append(h,p);

    if (actions.length) {
        const row = document.createElement('div'); row.className='empty-actions';
        actions.forEach(action => {
            const button=document.createElement('button');
            button.className=`btn ${action.primary?'btn-primary':'btn-secondary'}`;
            button.dataset.action=action.action; button.textContent=action.label; row.appendChild(button);
        });
        box.appendChild(row);
    }
    els.grid.appendChild(box);
}

function renderConnectionError() {
    els.hero.style.display='none';
    els.grid.replaceChildren();
    renderEmptyState('Unable to connect to Prism','Check your Prism installation and connection settings, then try again.',
        [{label:'Open Settings',action:'goto-settings',primary:true},{label:'Try again',action:'retry-connect'}]);
}

/* ---------------- Accounts character selector ---------------- */

const CHARACTER_PALETTES = [
    ['#394552','#1f252c'], ['#6b5f67','#332e34'], ['#615063','#2d2631'], ['#5a3f39','#211817'],
    ['#715b5a','#312526'], ['#4a5967','#202934'], ['#685943','#2f291e'], ['#4e435d','#24202b']
];

function renderHeaderAccounts() {
    els.headerAccountSelect.replaceChildren();

    if (!state.accounts.length) {
        const option=document.createElement('option'); option.value=''; option.textContent='No accounts';
        els.headerAccountSelect.appendChild(option);
        els.headerAccountAvatar.textContent='?';
        return;
    }

    state.accounts.forEach(account => {
        const option=document.createElement('option');
        option.value=account.name; option.textContent=account.name; option.selected=account.name===state.profile;
        els.headerAccountSelect.appendChild(option);
    });
    const face=skinHeads.get(state.profile);
    els.headerAccountAvatar.innerHTML=face ? '<img src="'+face+'" alt="">' : '';
    els.headerAccountAvatar.onclick=()=>showView('accounts');
}

function syncAccountCarouselToProfile() {
    const index=state.accounts.findIndex(a => a.name===state.profile);
    state.accountCarouselIndex=index>=0?index:0;
}

function circularOffset(index, current, total) {
    if (!total) return 0;
    let d=index-current;
    while (d > total/2) d -= total;
    while (d < -total/2) d += total;
    return d;
}

function blockCharacterMarkup(account, index) {
    const image=skinRenders.get(account.name);
    return image ? '<img class="real-character" src="'+image+'" alt="'+escapeHTML(account.name)+'">' : '<div class="real-character"></div>';
}

function renderAccountCarousel() {
    els.accountCarousel.replaceChildren();
    els.accountRoster.replaceChildren();

    if (!state.accounts.length) {
        els.accountNameplate.innerHTML='<h3>No accounts found</h3><div class="account-nameplate-tags"><span class="nameplate-tag">Manage accounts in Prism</span></div>';
        els.accountPrev.disabled=true; els.accountNext.disabled=true;
        return;
    }

    els.accountPrev.disabled=state.accounts.length<2;
    els.accountNext.disabled=state.accounts.length<2;

    state.accounts.forEach((account,index) => {
        const offset=circularOffset(index,state.accountCarouselIndex,state.accounts.length);
        const wrap=document.createElement('button');
        wrap.type='button';
        wrap.className='account-character';
        wrap.dataset.index=String(index);
        wrap.dataset.offset=String(Math.max(-3,Math.min(3,offset)));
        if (Math.abs(offset)>3) wrap.classList.add('hidden-character');
        wrap.style.border='0';
        wrap.style.background='transparent';
        wrap.setAttribute('aria-label','Select '+account.name);wrap.setAttribute('aria-pressed',String(account.name===state.profile));
        wrap.tabIndex=Math.abs(offset)>3?-1:0;
        wrap.innerHTML=blockCharacterMarkup(account,index);
        els.accountCarousel.appendChild(wrap);

        const chip=document.createElement('button');
        chip.type='button';
        chip.className=`roster-chip ${index===state.accountCarouselIndex?'active':''}`;
        chip.dataset.index=String(index);
        const face=skinHeads.get(account.name);chip.innerHTML=face?'<img src="'+face+'" alt="">':'';
        chip.setAttribute('aria-label','Select '+account.name);chip.setAttribute('aria-pressed',String(account.name===state.profile));
        chip.title=account.name;
        els.accountRoster.appendChild(chip);
    });

    const selected=state.accounts[state.accountCarouselIndex];
    const isProfile=selected.name===state.profile;

    els.accountNameplate.innerHTML=`
        <h3>${isProfile?'<span class="nameplate-check">✓</span>':''}${escapeHTML(selected.name)}</h3>
        <div class="account-nameplate-tags">
            ${selected.active?'<span class="nameplate-tag default">Prism default</span>':''}
            ${isProfile?'<span class="nameplate-tag">Playing as this profile</span>':'<button class="nameplate-tag" id="select-carousel-profile" type="button">Use this profile</button>'}
        </div>
    `;

    const choose=document.getElementById('select-carousel-profile');
    if (choose) choose.addEventListener('click',() => setProfile(selected.name));
}

function moveAccountCarousel(delta) {
    if (!state.accounts.length) return;
    const total=state.accounts.length;
    state.accountCarouselIndex=(state.accountCarouselIndex+delta+total)%total;
    setProfile(state.accounts[state.accountCarouselIndex].name);
}

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
        button.textContent=pack.name;
        els.skinPackTabs.appendChild(button);
    });

    const pack=activeSkinPack();
    els.activePackTitle.textContent=pack.name;
    els.activePackCount.textContent=`${pack.skins?.length || 0} skins`;
    els.btnDeleteSkinPack.disabled=!!pack.locked;
    els.selectedSkinPackLabel.textContent=pack.name;

    renderSkinGrid(pack);
}

function renderSkinGrid(pack) {
    els.skinGrid.replaceChildren();
    const skins=Array.isArray(pack.skins)?pack.skins:[];

    els.skinPackEmpty.classList.toggle('hidden',skins.length>0);
    if (!skins.length) {
        state.selectedSkinId='';
        renderSelectedSkin(null,pack);
        return;
    }

    if (!skins.some(s => s.id===state.selectedSkinId)) state.selectedSkinId=skins[0].id;

    skins.forEach((skin,index) => {
        const seed=skin.visual || createSkinVisualSeed(skin.name || `Skin ${index+1}`);
        const tile=document.createElement('button');
        tile.type='button';
        tile.className=`skin-tile ${skin.id===state.selectedSkinId?'active':''}`;
        tile.dataset.skinId=skin.id;
        tile.innerHTML=`
            <div class="skin-tile-character" style="--skin-a:${escapeHTML(seed.a)};--skin-b:${escapeHTML(seed.b)}">
                <div class="voxel-head"></div><div class="voxel-body"></div>
                <div class="voxel-arm voxel-arm-left"></div><div class="voxel-arm voxel-arm-right"></div>
                <div class="voxel-leg voxel-leg-left"></div><div class="voxel-leg voxel-leg-right"></div>
            </div>
            <span>${escapeHTML(skin.name || 'Unnamed skin')}</span>
        `;
        if(skin.render){tile.querySelector('.skin-tile-character').outerHTML='<img class="pack-real-skin" src="'+escapeHTML(skin.render)+'" alt="">';}
        els.skinGrid.appendChild(tile);
    });

    renderSelectedSkin(skinById(state.selectedSkinId),pack);
    saveSkinPacks();
}

function renderSelectedSkin(skin,pack=activeSkinPack()) {
    els.skinPreviewCharacter.classList.toggle('has-real-skin',!!skin?.render);
    els.skinPreviewCharacter.querySelector('.pack-preview-image')?.remove();
    if(skin?.render){const img=document.createElement('img');img.className='pack-preview-image';img.src=skin.render;img.alt=skin.name;els.skinPreviewCharacter.append(img);}
    els.selectedSkinName.textContent=skin?.name || 'No skin selected';
    els.selectedSkinPackLabel.textContent=pack.name;

    const seed=skin?.visual || {a:'#59616d',b:'#2b3038'};
    els.skinPreviewCharacter.style.setProperty('--skin-a',seed.a);
    els.skinPreviewCharacter.style.setProperty('--skin-b',seed.b);

    els.btnAddSkinToPack.disabled=!skin || state.skinPacks.length<2;
}

function readSkinFile(file) {
    return new Promise((resolve,reject)=>{
        if (!file || file.type !== 'image/png' || file.size > 2_000_000) return reject(new Error('Choose a PNG skin under 2 MB'));
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

async function addSkinFiles(files) {
    const pack=activeSkinPack();
    if (!pack || pack.locked) { showToast('Select an unlocked skin pack first','warning'); return; }
    let viewer;
    try {
        const {SkinViewer}=await import('./skinview.bundle.js');
        const canvas=document.createElement('canvas');
        viewer=new SkinViewer({canvas,width:260,height:420,pixelRatio:1,zoom:.9,fov:35,enableControls:false,renderPaused:true,preserveDrawingBuffer:true});
        viewer.globalLight.intensity=2.8;viewer.cameraLight.intensity=.7;viewer.playerObject.rotation.y=.18;
        let added=0;
        for (const file of files) {
            try {
                const texture=await readSkinFile(file);
                const name=file.name.replace(/\.png$/i,'').slice(0,60) || `Skin ${pack.skins.length+1}`;
                await viewer.loadSkin(texture,{model:'slim'});viewer.render();
                pack.skins.push({id:slugId(name),name,source:'local file',texture,render:canvas.toDataURL('image/png'),model:'slim',visual:createSkinVisualSeed(name)});
                added++;
            } catch(error) { showToast(`${file.name}: ${error.message}`,'error'); }
        }
        if (added) { state.selectedSkinId=pack.skins[pack.skins.length-added].id;saveSkinPacks();renderSkinPacks();showToast(`Added ${added} skin${added===1?'':'s'}`,'success'); }
    } catch(error) { showToast(`Could not load skin renderer: ${error.message}`,'error'); }
    finally { if(viewer){viewer.dispose();viewer.renderer.forceContextLoss();} }
}

function slugId(name) {
    return `${String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'pack'}-${Date.now().toString(36)}`;
}

function createSkinPack(name) {
    const trimmed=name.trim();
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
    try {
        const text=await file.text();
        const parsed=JSON.parse(text);
        const raw=parsed.pack || parsed;

        if (!raw || typeof raw.name!=='string' || !Array.isArray(raw.skins)) {
            throw new Error('Not a valid Prism Studio skin pack');
        }

        const pack={
            id:slugId(raw.name),
            name:raw.name.slice(0,40),
            locked:false,
            skins:raw.skins.slice(0,500).map((skin,index) => ({
                id:slugId(skin?.name || `Skin ${index+1}`),
                name:String(skin?.name || `Skin ${index+1}`).slice(0,60),
                source:skin?.source || 'shared',
                texture:typeof skin?.texture==='string'&&skin.texture.startsWith('data:image/png;base64,')&&skin.texture.length<200000?skin.texture:null,
                render:typeof skin?.render==='string'&&skin.render.startsWith('data:image/png;base64,')&&skin.render.length<200000?skin.render:null,
                model:skin?.model==='default'?'default':'slim',
                visual:skin?.visual && typeof skin.visual.a==='string' && typeof skin.visual.b==='string'
                    ? {a:skin.visual.a,b:skin.visual.b}
                    : createSkinVisualSeed(skin?.name || String(index))
            }))
        };

        state.skinPacks.push(pack);
        state.activeSkinPackId=pack.id;
        state.selectedSkinId=pack.skins[0]?.id || '';
        saveSkinPacks();
        renderSkinPacks();
        showToast(`Imported "${pack.name}"`,'success');
    } catch (error) {
        showToast(`Import failed: ${String(error)}`,'error');
    }
}

function shareActiveSkinPack() {
    const pack=activeSkinPack();
    const payload={
        format:'prism-studio-skin-pack',
        version:1,
        pack:{
            name:pack.name,
            skins:(pack.skins || []).map(skin => ({
                name:skin.name,
                source:skin.source || 'local',
                texture:skin.texture || null,
                render:skin.render || null,
                model:skin.model || 'slim',
                visual:skin.visual || createSkinVisualSeed(skin.name)
            }))
        }
    };

    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;
    anchor.download=`${pack.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'') || 'skin-pack'}.prism-skinpack.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast('Shared pack file created','success');
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

function addSelectedSkinToAnotherPack() {
    const skin=skinById(state.selectedSkinId);
    if (!skin) return;

    const choices=state.skinPacks.filter(pack => pack.id!==state.activeSkinPackId);
    if (!choices.length) return;

    const names=choices.map((p,i)=>`${i+1}. ${p.name}`).join('\n');
    const answer=prompt(`Add "${skin.name}" to which pack?\n${names}\n\nEnter the number:`);
    const index=Number(answer)-1;
    if (!Number.isInteger(index) || index<0 || index>=choices.length) return;

    const target=choices[index];
    if (target.skins.some(s=>s.name===skin.name)) {
        showToast('That skin is already in the pack','warning');
        return;
    }

    target.skins.push({
        id:slugId(skin.name),
        name:skin.name,
        source:skin.source || 'copied',
        visual:skin.visual || createSkinVisualSeed(skin.name)
    });
    saveSkinPacks();
    showToast(`Added to "${target.name}"`,'success');
}

/* ---------------- Inspector/actions ---------------- */

async function selectInstance(id) {
    state.selectedId=id;
    const instance=state.instances.find(item=>item.id===id);
    if (!instance) return;

    for (const card of els.grid.querySelectorAll('.card')) card.classList.toggle('selected',card.dataset.id===id);

    els.inspName.textContent=instance.name||'Unknown';
    els.inspVersion.textContent=instance.version||'—';
    els.inspLoader.textContent=instance.loader||'Vanilla';
    els.inspPlaytime.textContent=formatPlaytime(instance.playtime);
    els.inspLastPlayed.textContent=formatDate(instance.lastLaunch);
    applyInstanceArtwork(els.inspBannerBg,els.inspBannerIcon,instance);
    els.inspServer.value=state.servers[id]||'';

    const favourite=state.favorites.has(id);
    els.inspFav.classList.toggle('active',favourite);
    els.inspFav.setAttribute('aria-pressed',String(favourite));
    updateInspectorLaunchState(id);
    els.inspector.classList.remove('hidden');

    state.modSearchQuery='';
    els.inspModSearch.value='';
    els.inspModCount.textContent='…';
    els.inspModList.innerHTML='<div class="mod-item"><span class="mod-item-name">Loading mods…</span></div>';

    try {
        if (!state.modCache[id]) state.modCache[id]=await invoke('mods',{id});
        if (state.selectedId===id) renderMods(id);
    } catch (error) {
        if (state.selectedId===id) {
            els.inspModCount.textContent='0';
            els.inspModList.innerHTML=`<div class="mod-item"><span class="mod-item-name" style="color:var(--status-error)">${escapeHTML(String(error))}</span></div>`;
        }
    }
}

function renderMods(instanceId) {
    const mods=state.modCache[instanceId];
    if (!Array.isArray(mods)||!mods.length) {
        els.inspModCount.textContent='0';
        els.inspModList.innerHTML='<div class="mod-item"><span class="mod-item-name">No mods installed</span></div>';
        return;
    }

    let visible=mods;
    if (state.modSearchQuery) {
        const query=state.modSearchQuery.toLowerCase();
        visible=mods.filter(mod=>String(mod.name||'').toLowerCase().includes(query));
    }

    els.inspModCount.textContent=String(mods.length);
    els.inspModList.innerHTML=visible.length
        ? visible.map(mod=>`<div class="mod-item ${mod.enabled?'':'disabled'}"><span class="mod-item-name">${escapeHTML(mod.name||'Unknown mod')}</span><span class="mod-item-meta">${mod.enabled?'Enabled':'Disabled'} · ${escapeHTML(formatSize(mod.size))}</span></div>`).join('')
        : '<div class="mod-item"><span class="mod-item-name">No matching mods</span></div>';
}

function closeInspector() {
    state.selectedId=null;
    els.inspector.classList.add('hidden');
    for (const card of els.grid.querySelectorAll('.card')) card.classList.remove('selected');
}

function toggleFavorite(id) {
    if (!id) return;
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    localStorage.setItem('favorites',JSON.stringify([...state.favorites]));

    const card=[...els.grid.querySelectorAll('.card')].find(item=>item.dataset.id===id);
    const button=card?.querySelector('.card-fav-btn');
    const favourite=state.favorites.has(id);
    if (button) {
        button.classList.toggle('active',favourite);
        button.setAttribute('aria-pressed',String(favourite));
    }
    if (state.selectedId===id) {
        els.inspFav.classList.toggle('active',favourite);
        els.inspFav.setAttribute('aria-pressed',String(favourite));
    }
    renderFilters();
    if (state.currentFilter==='favourites') renderLibrary();
}

async function launchInstance(targetId, server='', persistServerPreference=false) {
    if (!targetId||state.launching.has(targetId)) return;
    if (!state.profile) {
        showToast('Choose a Minecraft account before launching.','error');
        showView('accounts');
        return;
    }

    if (persistServerPreference) {
        const trimmed=server.trim();
        if (trimmed) state.servers[targetId]=trimmed; else delete state.servers[targetId];
        localStorage.setItem('servers',JSON.stringify(state.servers));
        server=trimmed;
    }

    state.launching.add(targetId);
    renderLibrary();
    updateInspectorLaunchState(targetId);

    try {
        const result=await invoke('launch',{id:targetId,profile:state.profile,server});
        showToast(typeof result==='string'?result:'Launch request sent to Prism','success');
    } catch (error) {
        showToast(`Launch failed: ${String(error)}`,'error');
    } finally {
        state.launching.delete(targetId);
        renderLibrary();
        updateInspectorLaunchState(targetId);
    }
}

function updateInspectorLaunchState(id) {
    if (state.selectedId!==id) return;
    const launching=state.launching.has(id);
    els.btnPlay.disabled=launching;
    els.btnPlay.textContent=launching?'Launching…':'Play';
}

async function saveConnectionSettings() {
    const root=els.settingRoot.value.trim();
    const executable=els.settingExe.value.trim();
    try {
        const updatedLibrary=await invoke('save_connection',{root,executable});
        showToast('Connection saved','success');
        state.modCache={};
        processLibraryData(updatedLibrary);
    } catch (error) {
        showToast(`Save failed: ${String(error)}`,'error');
    }
}

function activateNav(viewName) {
    for (const item of els.navItems) item.classList.toggle('active',item.dataset.view===viewName);
}

function showView(viewName) {
    const isLibrarySurface=viewName==='library'||viewName==='favourites';

    for (const view of els.views) {
        view.classList.toggle('active', isLibrarySurface ? view.id==='view-library' : view.id===`view-${viewName}`);
    }
    activateNav(viewName);

    if (viewName==='library') setFilter('all',false);
    else if (viewName==='favourites') setFilter('favourites',false);
    else closeInspector();

    if (viewName==='accounts') renderAccountCarousel();
    if (viewName==='skins') renderSkinPacks();
}

function setFilter(filter,syncNavigation=true) {
    state.currentFilter=filter;
    if (syncNavigation) {
        activateNav(filter==='favourites'?'favourites':'library');
        for (const view of els.views) view.classList.toggle('active',view.id==='view-library');
    }
    renderFilters();
    renderLibrary();
}

function setProfile(profileName) {
    if (!profileName||!state.accounts.some(account=>account.name===profileName)) return;
    state.profile=profileName;
    localStorage.setItem('selected_profile',profileName);
    renderHeaderAccounts();
    syncAccountCarouselToProfile();
    renderAccountCarousel();
}

async function openPrism(id=null) {
    try { await invoke('open_prism',{id}); }
    catch (error) { showToast(`Failed to open Prism: ${String(error)}`,'error'); }
}

/* ---------------- Events ---------------- */

function setupUIEvents() {
    for (const item of els.navItems) item.addEventListener('click',()=>showView(item.dataset.view));

    els.btnRefreshLibrary.addEventListener('click',()=>fetchLibrary(true));

    els.filterContainer.addEventListener('click',event=>{
        const chip=event.target.closest('.chip');
        if (chip) setFilter(chip.dataset.filter,true);
    });

    els.searchInput.addEventListener('input',event=>{ state.searchQuery=event.target.value; renderLibrary(); });

    els.btnGrid.addEventListener('click',()=>{ state.viewMode='grid'; localStorage.setItem('view_mode',state.viewMode); updateViewModeClass(); });
    els.btnList.addEventListener('click',()=>{ state.viewMode='list'; localStorage.setItem('view_mode',state.viewMode); updateViewModeClass(); });
    els.sortSelect.addEventListener('change',event=>{ state.sortMode=event.target.value; localStorage.setItem('sort_mode',state.sortMode); renderLibrary(); });

    els.grid.addEventListener('click',event=>{
        const settingsButton=event.target.closest('[data-action="goto-settings"]');
        if (settingsButton) { showView('settings'); return; }
        const retryButton=event.target.closest('[data-action="retry-connect"]');
        if (retryButton) { fetchLibrary(); return; }

        const card=event.target.closest('.card');
        if (!card) return;
        const id=card.dataset.id;
        const action=event.target.closest('[data-action]')?.dataset.action;

        if (action) {
            event.stopPropagation();
            if (action==='favorite') toggleFavorite(id);
            else if (action==='play') launchInstance(id,'',false);
            else if (action==='details') selectInstance(id);
            return;
        }
        selectInstance(id);
    });

    els.hero.addEventListener('click',event=>{
        const button=event.target.closest('[data-action]');
        if (!button) return;
        const id=button.dataset.id;
        if (button.dataset.action==='hero-play') launchInstance(id,'',false);
        else if (button.dataset.action==='hero-details') selectInstance(id);
    });

    els.headerAccountSelect.addEventListener('change',event=>setProfile(event.target.value));
    els.btnOpenPrismAccounts.addEventListener('click',()=>openPrism(null));

    els.accountPrev.addEventListener('click',()=>moveAccountCarousel(-1));
    els.accountNext.addEventListener('click',()=>moveAccountCarousel(1));
    els.accountCarousel.addEventListener('click',event=>{
        const character=event.target.closest('.account-character');
        if (character) {
            state.accountCarouselIndex=Number(character.dataset.index);
            setProfile(state.accounts[state.accountCarouselIndex].name);
        }
    });
    els.accountRoster.addEventListener('click',event=>{
        const chip=event.target.closest('.roster-chip');
        if (chip) {
            state.accountCarouselIndex=Number(chip.dataset.index);
            setProfile(state.accounts[state.accountCarouselIndex].name);
        }
    });

    els.skinPackTabs.addEventListener('click',event=>{
        const tab=event.target.closest('.pack-tab');
        if (!tab) return;
        state.activeSkinPackId=tab.dataset.packId;
        state.selectedSkinId='';
        saveSkinPacks();
        renderSkinPacks();
    });

    els.skinGrid.addEventListener('click',event=>{
        const tile=event.target.closest('.skin-tile');
        if (!tile) return;
        state.selectedSkinId=tile.dataset.skinId;
        saveSkinPacks();
        renderSkinPacks();
    });

    els.btnCreateSkinPack.addEventListener('click',()=>{
        els.newPackName.value='';
        els.createPackDialog.showModal();
        setTimeout(()=>els.newPackName.focus(),0);
    });

    els.btnAddSkinFile.addEventListener('click',()=>{ els.skinFileInput.value='';els.skinFileInput.click(); });
    els.skinFileInput.addEventListener('change',()=>addSkinFiles([...els.skinFileInput.files]));

    els.createPackForm.addEventListener('submit',event=>{
        event.preventDefault();
        const name=els.newPackName.value;
        if (!name.trim()) return;
        createSkinPack(name);
        els.createPackDialog.close();
    });

    els.btnImportSkinPack.addEventListener('click',()=>els.skinPackFileInput.click());
    els.skinPackFileInput.addEventListener('change',async()=>{
        const file=els.skinPackFileInput.files?.[0];
        if (file) await importSkinPackFile(file);
        els.skinPackFileInput.value='';
    });

    els.btnShareSkinPack.addEventListener('click',shareActiveSkinPack);
    els.btnDeleteSkinPack.addEventListener('click',deleteActiveSkinPack);
    els.btnAddSkinToPack.addEventListener('click',addSelectedSkinToAnotherPack);

    els.btnSaveConnection.addEventListener('click',saveConnectionSettings);
    els.btnCloseInspector.addEventListener('click',closeInspector);
    els.inspFav.addEventListener('click',()=>{ if (state.selectedId) toggleFavorite(state.selectedId); });
    els.btnPlay.addEventListener('click',()=>{ if (state.selectedId) launchInstance(state.selectedId,els.inspServer.value,true); });
    els.btnEdit.addEventListener('click',()=>{ if (state.selectedId) openPrism(state.selectedId); });
    els.btnFolder.addEventListener('click',async()=>{
        if (!state.selectedId) return;
        try { await invoke('open_folder',{id:state.selectedId}); }
        catch (error) { showToast(`Failed to open folder: ${String(error)}`,'error'); }
    });
    els.inspModSearch.addEventListener('input',event=>{
        state.modSearchQuery=event.target.value;
        if (state.selectedId) renderMods(state.selectedId);
    });

    document.addEventListener('keydown',event=>{
        const active=document.activeElement;
        const editable=active?.tagName==='INPUT'||active?.tagName==='SELECT'||active?.tagName==='TEXTAREA'||active?.isContentEditable;

        if (event.key==='/'&&!editable) {
            event.preventDefault();
            showView('library');
            els.searchInput.focus();
        }

        if (event.key==='Escape') {
            if (els.createPackDialog.open) {
                els.createPackDialog.close();
            } else if (editable) {
                active.blur();
            } else if (!els.inspector.classList.contains('hidden')) {
                closeInspector();
            }
        }

        const accountsActive=document.getElementById('view-accounts').classList.contains('active');
        if (accountsActive&&!editable) {
            if (event.key==='ArrowLeft') moveAccountCarousel(-1);
            if (event.key==='ArrowRight') moveAccountCarousel(1);
            if (event.key==='Enter'&&state.accounts[state.accountCarouselIndex]) setProfile(state.accounts[state.accountCarouselIndex].name);
        }
    });
}

/* ---------------- Utility ---------------- */

function updateStatus(main,sub,isError=false) {
    els.statusMain.textContent=main;
    els.statusSub.textContent=sub;
    els.statusPanel.classList.toggle('error',isError);
}

function showToast(message,type='success') {
    const toast=document.createElement('div');
    toast.className=`toast ${type}`;
    const icon=document.createElement('span'); icon.textContent=type==='error'?'!':type==='warning'?'△':'✓';
    const text=document.createElement('span'); text.textContent=String(message);
    toast.append(icon,text); els.toastContainer.appendChild(toast);

    setTimeout(()=>{
        toast.style.opacity='0'; toast.style.transform='translateY(4px)'; toast.style.transition='opacity .2s ease, transform .2s ease';
        setTimeout(()=>toast.remove(),220);
    },3600);
}

function formatPlaytime(seconds) {
    const total=Number(seconds||0);
    if (total<=0) return '0m';
    const hours=Math.floor(total/3600);
    const minutes=Math.floor((total%3600)/60);
    if (hours>=100) return `${hours}h`;
    if (hours>0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function formatDate(unixMs) {
    const value=Number(unixMs||0);
    if (!value) return 'Never';
    const date=new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const days=Math.floor((Date.now()-date.getTime())/86400000);
    if (days===0) return 'Today';
    if (days===1) return 'Yesterday';
    if (days>1&&days<7) return `${days} days ago`;
    return date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}

function formatSize(bytes) {
    const value=Number(bytes||0);
    if (value<=0) return '0 B';
    const units=['B','KB','MB','GB'];
    const index=Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1);
    return `${(value/Math.pow(1024,index)).toFixed(index===0?0:1)} ${units[index]}`;
}

document.addEventListener('DOMContentLoaded',init);

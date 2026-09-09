let allInstances = [];
let filteredInstances = [];

// State
let currentView = localStorage.getItem('instanceLibraryView') || 'grid';
let currentSearch = '';
let currentFilter = 'all';
let currentSort = 'recent';

// Load instances from Rust backend
async function loadInstances() {
    try {
        // Adapt this to the existing Prism Studio backend command
        allInstances = await window.__TAURI__.core.invoke('get_instances');
        applyFiltersAndSort();
        updateViewSwitcherUI();
    } catch (e) {
        console.error("Failed to load instances:", e);
    }
}

function setInstanceView(view) {
    currentView = view;
    localStorage.setItem('instanceLibraryView', view);
    updateViewSwitcherUI();
    renderInstances();
}

function updateViewSwitcherUI() {
    document.querySelectorAll('.view-switcher .icon-btn').forEach(btn => {
        const isActive = btn.dataset.view === currentView;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive.toString());
    });
}

function handleInstancesSearch(query) {
    currentSearch = query.toLowerCase();
    applyFiltersAndSort();
}

function handleInstancesFilter(filter) {
    currentFilter = filter.toLowerCase();
    applyFiltersAndSort();
}

function handleInstancesSort(sort) {
    currentSort = sort;
    applyFiltersAndSort();
}

function applyFiltersAndSort() {
    filteredInstances = allInstances.filter(inst => {
        const matchesSearch = inst.name.toLowerCase().includes(currentSearch) || 
                              inst.minecraftVersion.toLowerCase().includes(currentSearch) ||
                              inst.loader.toLowerCase().includes(currentSearch);
        const matchesFilter = currentFilter === 'all' || inst.loader.toLowerCase().includes(currentFilter);
        return matchesSearch && matchesFilter;
    });

    filteredInstances.sort((a, b) => {
        switch (currentSort) {
            case 'name': return a.name.localeCompare(b.name);
            case 'version': return b.minecraftVersion.localeCompare(a.minecraftVersion);
            case 'created': return b.dateCreated - a.dateCreated;
            case 'recent': default: return (b.lastPlayed || 0) - (a.lastPlayed || 0);
        }
    });

    renderInstances();
}

function renderInstances() {
    const container = document.getElementById('instances-container');

    if (filteredInstances.length === 0) {
        container.className = 'instances-container empty-state-container';
        container.innerHTML = `
            <div class="empty-state">
                <h3>No instances found</h3>
                <p>Create your first Minecraft instance and start playing.</p>
                <button class="btn-prism-accent" onclick="createNewInstance()">+ Create Instance</button>
            </div>
        `;
        return;
    }

    // Apply the correct CSS class for the layout engine
    container.className = `instances-container view-mode-${currentView}`;

    // Render corresponding layout
    switch (currentView) {
        case 'grid': renderVisualGrid(container); break;
        case 'compact': renderCompact(container); break;
        case 'list': renderDetailedList(container); break;
    }
}

// --- RENDERERS ---

function renderVisualGrid(container) {
    container.innerHTML = filteredInstances.map(inst => `
        <div class="instance-card-grid" tabindex="0">
            <div class="card-art" style="background-image: url('${inst.background || 'assets/fallback-bg.jpg'}')">
                <button class="btn-play-hero" aria-label="Play ${inst.name}" onclick="playInstance('${inst.id}')">
                    <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
                </button>
            </div>
            <div class="card-info">
                <img src="${inst.icon || 'assets/default-icon.png'}" class="inst-icon" alt=""/>
                <div class="inst-details">
                    <h4 class="inst-name">${inst.name}</h4>
                    <span class="inst-meta">${inst.loader} • ${inst.minecraftVersion}</span>
                </div>
                <button class="btn-overflow" aria-label="More options" onclick="openInstanceMenu('${inst.id}', event)">⋯</button>
            </div>
        </div>
    `).join('');
}

function renderCompact(container) {
    container.innerHTML = filteredInstances.map(inst => `
        <div class="instance-row-compact" tabindex="0">
            <img src="${inst.icon || 'assets/default-icon.png'}" class="inst-icon-small" alt=""/>
            <div class="inst-name-col">
                <span class="inst-name">${inst.name}</span>
            </div>
            <div class="inst-badges">
                <span class="badge badge-version">${inst.minecraftVersion}</span>
                <span class="badge badge-loader">${inst.loader}</span>
            </div>
            <div class="row-actions">
                <button class="btn-play-small" aria-label="Play ${inst.name}" onclick="playInstance('${inst.id}')">▶ Play</button>
                <button class="btn-overflow" aria-label="More options" onclick="openInstanceMenu('${inst.id}', event)">⋯</button>
            </div>
        </div>
    `).join('');
}

function renderDetailedList(container) {
    let html = `
        <div class="list-header">
            <div class="col-name">Instance</div>
            <div class="col-version">Version</div>
            <div class="col-loader">Loader</div>
            <div class="col-played">Last Played</div>
            <div class="col-actions"></div>
        </div>
        <div class="list-body">
    `;

    html += filteredInstances.map(inst => `
        <div class="instance-row-list" tabindex="0">
            <div class="col-name">
                <img src="${inst.icon || 'assets/default-icon.png'}" class="inst-icon-small" alt=""/>
                <span class="inst-name">${inst.name}</span>
            </div>
            <div class="col-version">${inst.minecraftVersion}</div>
            <div class="col-loader">${inst.loader}</div>
            <div class="col-played">${formatTimeAgo(inst.lastPlayed)}</div>
            <div class="col-actions">
                <button class="btn-play-small" aria-label="Play ${inst.name}" onclick="playInstance('${inst.id}')">▶</button>
                <button class="btn-overflow" aria-label="More options" onclick="openInstanceMenu('${inst.id}', event)">⋯</button>
            </div>
        </div>
    `).join('');

    html += `</div>`;
    container.innerHTML = html;
}

// Formatters and Action Hooks (Wire these to existing Prism Studio commands)
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    // Add relative time formatting logic here
    return new Date(timestamp).toLocaleDateString();
}

function playInstance(id) {
    window.__TAURI__.core.invoke('launch_instance', { id });
}

function openInstanceMenu(id, event) {
    event.stopPropagation();
    // Hook into Prism Studio's existing context menu system here
    // Ex: showContextMenu(id, event.clientX, event.clientY);
}

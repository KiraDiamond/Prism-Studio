const $ = (s) => document.querySelector(s);
const detailNotice = document.createElement('p');
detailNotice.className = 'dialog-notice'; detailNotice.hidden = true; detailNotice.setAttribute('role','status');
$('#details .detail-actions').after(detailNotice);
const invoke = (command, args = {}) => {
  if (!window.__TAURI__) return Promise.reject(new Error('Open Prism Studio.exe to connect to your library.'));
  return window.__TAURI__.core.invoke(command, args);
};
const stored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const state = { library: null, page: 'library', favorites: new Set(stored('favorites', [])), profile: stored('profile', ''), view: stored('view', 'grid'), selected: null, mods: [], launching: new Set() };
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hours = (seconds) => seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} h` : `${Math.floor(seconds / 60)} min`;
const lastPlayed = (time) => time ? new Date(time).toLocaleDateString(undefined, {day:'numeric',month:'short',year:'numeric'}) : 'Not played yet';
const colors = ['#465239','#424d57','#5b493b','#514059','#36544e','#555130'];
const colorFor = id => colors[Array.from(id).reduce((n,c)=>n+c.charCodeAt(0),0)%colors.length];
const icon = (item) => item.icon ? `<img src="${escape(item.icon)}" alt="" loading="lazy">` : `<span class="card-monogram">${escape(item.name.slice(0,2).toUpperCase())}</span>`;
function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { notice('Your preferences could not be saved.', true); } }
function notice(text, error = false) {
  for (const target of [$('#notice'),detailNotice]) {target.textContent=String(text);target.hidden=false;target.classList.toggle('error',error);}
}
function chooseProfile(name) { state.profile=name; persist('profile',name); $('#profile').value=name; $('#avatar').textContent=name.slice(0,1).toUpperCase()||'P'; renderAccounts(); }
function applyLibrary(data) {
  state.library=data;
  const profiles = data.accounts;
  $('#profile').innerHTML = profiles.length ? profiles.map(a=>`<option value="${escape(a.name)}">${escape(a.name)}</option>`).join('') : '<option value="">No accounts</option>';
  chooseProfile(profiles.some(a=>a.name===state.profile) ? state.profile : (profiles.find(a=>a.active)?.name || profiles[0]?.name || ''));
  const filter=$('#loader-filter').value;
  $('#loader-filter').innerHTML='<option value="">All loaders</option>'+[...new Set(data.instances.map(i=>i.loader))].sort().map(l=>`<option>${escape(l)}</option>`).join('');
  $('#loader-filter').value=filter;
  $('#root').value=data.settings.root; $('#executable').value=data.settings.executable;
  $('#library-count').textContent=data.instances.length;
  $('#footer-count').textContent=`${data.instances.length} instances connected`;
  $('#notice').hidden=true;
  if(!data.executableFound) notice('Prism executable not found. Update Connection before launching.',true);
  else if(data.warnings.length) notice(data.warnings.join(' '),true);
  renderLibrary();
}
async function refresh() {
  $('#refresh').disabled=true;
  try { applyLibrary(await invoke('library')); }
  catch(error) {
    notice(error.message||error,true);
    if(!state.library) $('#instances').innerHTML='<div class="empty"><h3>Let’s connect your library.</h3><p>Check your Prism data folder and executable in Connection.</p><button class="secondary" data-connection>Open connection settings</button></div>';
    try { const s=await invoke('get_settings'); $('#root').value=s.root; $('#executable').value=s.executable; } catch {}
  } finally { $('#refresh').disabled=false; }
}
function renderLibrary() {
  if(!state.library) return;
  const query=$('#search').value.toLowerCase().trim();
  const filter=$('#loader-filter').value;
  let items=state.library.instances.filter(i=>(state.page!=='favorites'||state.favorites.has(i.id))&&(!filter||i.loader===filter)&&`${i.name} ${i.id} ${i.version} ${i.loader} ${i.group}`.toLowerCase().includes(query));
  const sort=$('#sort').value;
  items.sort(sort==='name'?(a,b)=>a.name.localeCompare(b.name):sort==='playtime'?(a,b)=>b.playtime-a.playtime:(a,b)=>b.lastLaunch-a.lastLaunch);
  $('#favorite-count').textContent=state.library.instances.filter(i=>state.favorites.has(i.id)).length;
  $('#result-count').textContent=items.length;
  $('#list-heading').firstChild.textContent=state.page==='favorites'?'Your favourites ':'Your instances ';
  const hero=state.library.instances[0];
  $('#hero').hidden=!hero||state.page==='favorites';
  if(hero){ $('#hero-name').textContent=hero.name; $('#hero-meta').textContent=`Minecraft ${hero.version}  ·  ${hero.loader}  ·  ${hours(hero.playtime)} played`; $('#hero-play').disabled=state.launching.has(hero.id); }
  $('#instances').classList.toggle('list',state.view==='list');
  for(const view of ['grid','list']) { $(`#${view}-view`).classList.toggle('active',state.view===view); $(`#${view}-view`).setAttribute('aria-pressed',String(state.view===view)); }
  $('#instances').innerHTML=items.length?items.map(i=>`<article class="card" data-id="${escape(i.id)}"><div class="card-art" style="--card-color:${colorFor(i.id)}">${icon(i)}<span class="loader-tag">${escape(i.loader)}</span><button class="favorite" data-action="favorite" aria-label="Favourite ${escape(i.name)}" aria-pressed="${state.favorites.has(i.id)}">${state.favorites.has(i.id)?'★':'☆'}</button></div><div class="card-body"><button class="card-title" data-action="details">${escape(i.name)}</button><div class="card-meta"><span>${escape(i.version)}</span><span>${hours(i.playtime)} played</span></div><div class="card-actions"><button class="play" data-action="play" ${state.launching.has(i.id)?'disabled':''}>${state.launching.has(i.id)?'Sending…':'▶ Launch'}</button><button class="more" data-action="details" aria-label="Details for ${escape(i.name)}">•••</button></div></div></article>`).join(''):`<div class="empty"><h3>${state.page==='favorites'&&!query?'Keep your favourites close.':'No instances found.'}</h3><p>${state.page==='favorites'&&!query?'Tap the star on an instance to add it here.':'Try another search or loader filter.'}</p></div>`;
}
function renderAccounts() {
  if(!state.library)return;
  $('#accounts').innerHTML=state.library.accounts.length?state.library.accounts.map(a=>`<button class="account-card ${state.profile===a.name?'selected':''}" data-account="${escape(a.name)}" aria-pressed="${state.profile===a.name}"><span class="avatar">${escape(a.name.slice(0,1).toUpperCase())}</span><div>${escape(a.name)}<small>${state.profile===a.name?'Selected for launch':'Click to select'}</small></div></button>`).join(''):'<div class="empty">No Minecraft accounts found. Add an account in Prism and refresh.</div>';
}
function navigate(page) {
  state.page=page;
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  for(const p of ['library','accounts','settings']) $(`#${p}-page`).hidden=p==='library'?!['library','favorites'].includes(page):page!==p;
  $('#crumb').textContent={library:'Library',favorites:'Favourites',accounts:'Accounts',settings:'Connection'}[page];
  renderLibrary(); renderAccounts();
}
async function launch(item,server='') {
  if(!item||state.launching.has(item.id))return;
  if(!state.profile){notice('Choose a Minecraft account before launching.',true);return;}
  state.launching.add(item.id); renderLibrary(); $('#detail-play').disabled=true;
  try { const result=await invoke('launch',{id:item.id,profile:state.profile,server:server.trim()}); notice(`${item.name}: ${result}`); }
  catch(error){ notice(error.message||error,true); }
  finally {state.launching.delete(item.id);renderLibrary();$('#detail-play').disabled=false;}
}
async function details(id) {
  const item=state.library.instances.find(i=>i.id===id); if(!item)return;
  state.selected=item;state.mods=[];
  detailNotice.hidden=true;
  $('#detail-name').textContent=item.name; $('#detail-meta').textContent=`Minecraft ${item.version} · ${item.loader}${item.group?' · '+item.group:''}`;
  $('#detail-icon').innerHTML=icon(item); $('#detail-time').textContent=hours(item.playtime); $('#detail-last').textContent=lastPlayed(item.lastLaunch);
  $('#server').value=stored('servers',{})[id]||''; $('#mod-search').value='';$('#mods-count').textContent='';$('#mods').textContent='Reading installed mods…';
  $('#details').showModal();
  try {const mods=await invoke('mods',{id});if(state.selected?.id===id){state.mods=mods;renderMods();}}
  catch(error){if(state.selected?.id===id)$('#mods').textContent=String(error.message||error);}
}
function renderMods() {
  const items=state.mods.filter(m=>m.name.toLowerCase().includes($('#mod-search').value.toLowerCase()));
  $('#mods-count').textContent=`(${state.mods.length})`;
  $('#mods').innerHTML=items.length?items.map(m=>`<div class="mod"><span>${escape(m.name)}</span><small class="${m.enabled?'enabled':''}">${m.enabled?'Enabled':'Disabled'} · ${(m.size/1048576).toFixed(1)} MB</small></div>`).join(''):'<p class="muted">No matching mods. Install or edit mods using “Edit in Prism”.</p>';
}
async function openPrism(id=null){try{await invoke('open_prism',{id});notice('Opened Prism. Refresh Studio after making changes.');}catch(error){notice(error.message||error,true);}}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$('.brand').addEventListener('click',()=>navigate('library'));
$('#instances').addEventListener('click',e=>{
  if(e.target.closest('[data-connection]')){navigate('settings');return;}
  const button=e.target.closest('[data-action]'),card=e.target.closest('[data-id]');if(!button||!card)return;
  const id=card.dataset.id;
  if(button.dataset.action==='favorite'){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);persist('favorites',[...state.favorites]);renderLibrary();}
  else if(button.dataset.action==='details')details(id);
  else launch(state.library.instances.find(i=>i.id===id));
});
$('#accounts').addEventListener('click',e=>{const a=e.target.closest('[data-account]');if(a)chooseProfile(a.dataset.account);});
$('#profile').addEventListener('change',e=>chooseProfile(e.target.value));
$('#refresh').addEventListener('click',refresh);
$('#search').addEventListener('input',renderLibrary);$('#sort').addEventListener('change',renderLibrary);$('#loader-filter').addEventListener('change',renderLibrary);
for(const view of ['grid','list']) $(`#${view}-view`).addEventListener('click',()=>{state.view=view;persist('view',view);renderLibrary();});
$('#hero-play').addEventListener('click',()=>launch(state.library?.instances[0]));$('#hero-details').addEventListener('click',()=>details(state.library.instances[0].id));
$('#close-details').addEventListener('click',()=>$('#details').close());
$('#details').addEventListener('click',e=>{if(e.target===$('#details')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#detail-play').addEventListener('click',()=>{const servers=stored('servers',{});servers[state.selected.id]=$('#server').value.trim();persist('servers',servers);launch(state.selected,$('#server').value);});
$('#edit-instance').addEventListener('click',()=>openPrism(state.selected.id));
$('#open-folder').addEventListener('click',async()=>{try{await invoke('open_folder',{id:state.selected.id});}catch(error){notice(error.message||error,true);}});
$('#mod-search').addEventListener('input',renderMods);
$('#manage').addEventListener('click',()=>openPrism());$('#manage-accounts').addEventListener('click',()=>openPrism());
$('#connection').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{applyLibrary(await invoke('save_connection',{root:$('#root').value.trim(),executable:$('#executable').value.trim()}));notice('Connected to your Prism library.');}catch(error){notice(error.message||error,true);}finally{button.disabled=false;}});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('#details').open){e.preventDefault();navigate('library');$('#search').focus();}});
refresh();

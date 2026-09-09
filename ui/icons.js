const paths = {
 instances:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"/>',
 filter:'<path d="M3 4h18v3l-7 7v6l-4-2v-4L3 7Z"/>',
 sort:'<path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 refresh:'<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
 settings:'<path d="m9 3-.6 2.3-2 .9-2.1-.6-2 3.4L4 10.7v2.6l-1.7 1.7 2 3.4 2.1-.6 2 .9L9 21h4l.6-2.3 2-.9 2.1.6 2-3.4-1.7-1.7v-2.6L19.7 9l-2-3.4-2.1.6-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
 chevronDown:'<path d="m6 9 6 6 6-6"/>', chevronLeft:'<path d="m15 5-7 7 7 7"/>', chevronRight:'<path d="m9 5 7 7-7 7"/>',
 play:'<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>', check:'<path d="m5 12 4 4L19 6"/>',
 folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11H3Z"/><path d="M3 9h18"/>',
 edit:'<path d="m14 5 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',
 skin:'<rect x="8" y="2" width="8" height="8"/><path d="M8 10H5v7h3m8-7h3v7h-3M8 10v12h4V16h0v6h4V10"/>',
 cube:'<path d="m12 2 9 5v10l-9 5-9-5V7Z"/><path d="m3 7 9 5 9-5m-9 5v10M7.5 4.5l9 5"/>',
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.cube}</svg>`;
export function fillIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);}); }

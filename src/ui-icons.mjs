// Shared vector vocabulary; visual-only, never samples game randomness.
const paths={
 fold:'<path d="M7 5h10v14H7zM4 2h10M10 9l4 6m0-6-4 6"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 call:'<path d="M4 7h12l-4-4m4 4-4 4M20 17H8l4-4m-4 4 4 4"/>',
 bet:'<ellipse cx="12" cy="7" rx="8" ry="4"/><path d="M4 7v5c0 5 16 5 16 0V7M4 12v5c0 5 16 5 16 0v-5"/>',
 raise:'<path d="m5 10 7-7 7 7M12 3v15M4 21h16"/>',
 crown:'<path d="m3 6 5 5 4-8 4 8 5-5-3 13H6zM7 22h10"/>',
 cards:'<path d="M9 3h12v17H9zM6 5 2 6l3 16 7-1M14 8l3 4-3 4-3-4z"/>',
 history:'<path d="M3 8a9 9 0 1 1 0 8M3 3v5h5M12 6v6l4 2"/>',
 wallet:'<path d="M3 6h17v14H3zM3 6V3h14v3M15 10h7v6h-7z"/><circle cx="18" cy="13" r=".8"/>',
 rules:'<path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16M6 8h3M6 12h3M15 8h3M15 12h3"/>',
 leave:'<path d="M10 3H3v18h7M8 12h14l-5-5m5 5-5 5"/>',
 play:'<path d="m8 3 13 9L8 21z"/>',
 sound:'<path d="M3 9h4l5-5v16l-5-5H3zM16 7c4 3 4 7 0 10M19 4c7 5 7 11 0 16"/>',
 settings:'<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
 chip:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M19 5l-3 3M8 16l-3 3"/>'
};
export const icon=(name,extra='')=>`<svg class="ui-icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.chip}</svg>`;

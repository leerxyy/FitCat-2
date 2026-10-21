import {state} from '../core/store.js';
import {$,onAction,openDialog} from '../ui/components.js';
import {DEVELOPER_KEY,LEGACY_ACHIEVEMENTS_KEY,readDeveloperRole} from '../core/developer.js';
export function renderDeveloper(){$('profileDeveloperBadge').hidden=!state.developer;}
export function initDeveloper(){onAction('openDeveloper',()=>{if(state.developer)openDialog('developerModal');});window.addEventListener('storage',event=>{if(![DEVELOPER_KEY,LEGACY_ACHIEVEMENTS_KEY].includes(event.key))return;state.developer=readDeveloperRole(localStorage);renderDeveloper();});renderDeveloper();}

import { initSelectionLens } from './selection-lens.js';

export function initNavLens(nav, options, doc = document, win = window) {
  return initSelectionLens(nav, { ...options, selector: '[data-tab]', padding: 6,
    isEnabled: () => doc.body.dataset.screen === 'mainPage' }, doc, win);
}

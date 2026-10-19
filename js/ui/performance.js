// A rendering policy, separate from saved themes and purchased cosmetics.
// Turning it off restores the full appearance without rewriting any choices.
export const LDM_KEY = 'fitcat_low_detail_mode_v1';

export function lowDetailMode() {
  return globalThis.document?.documentElement?.dataset?.lowDetail === 'on';
}

export function applyPerformanceMode(enabled) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  const value = enabled ? 'on' : 'off';
  if (root.dataset.lowDetail === value) return;
  root.dataset.lowDetail = value;
  document.dispatchEvent(new CustomEvent('fitcat:performance', { detail: { enabled: Boolean(enabled) } }));
}

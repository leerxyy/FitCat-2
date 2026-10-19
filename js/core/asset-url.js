// CSS custom-property URLs resolve at their consuming stylesheet. Resolve once
// against this app's module root so /FitCat-2/ never becomes /styles/assets/.
export function appAssetURL(path, moduleURL = import.meta.url) {
  if (typeof path !== 'string' || !/^assets\/[\w./-]+$/.test(path) || path.split('/').includes('..')) throw new Error('invalid_asset_path');
  return new URL('../../' + path, moduleURL).href;
}
export const cssAssetURL = path => `url("${appAssetURL(path)}")`;

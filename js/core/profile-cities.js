// Approved original generated city art. Purchases remain independent of PRO+.
export const CITY_COVER_PRICE = 299;
export const PROFILE_CITY_CATALOG = Object.freeze({
  chongqing: Object.freeze({ location: 'Chongqing · Yuzhong', generated: true }),
  moscow: Object.freeze({ location: 'Moscow City', generated: true }),
  dubai: Object.freeze({ location: 'Dubai · Downtown', generated: true }),
  hongkong: Object.freeze({ location: 'Hong Kong · Victoria Harbour', generated: true }),
});
export const CITY_PROFILE_COVERS = Object.freeze(Object.keys(PROFILE_CITY_CATALOG));
// Keep old receipts readable without rewriting or charging the original ledger.
export const LEGACY_CITY_COVERS = Object.freeze(['tokyo']);
export const canonicalCityCover = cover => cover === 'tokyo' ? 'hongkong' : cover;
export const cityCoverOwned = (cover, owned = []) => CITY_PROFILE_COVERS.includes(cover) && Array.isArray(owned) && owned.some(value => canonicalCityCover(value) === cover);

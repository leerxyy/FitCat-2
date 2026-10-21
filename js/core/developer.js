export const DEVELOPER_KEY = 'fitcat_developer_v1';
export const LEGACY_ACHIEVEMENTS_KEY = 'fitcat_achievements_v1';

export function readDeveloperRole(storage) {
  const read = key => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
  const current = read(DEVELOPER_KEY);
  // An explicit new value takes precedence over the retired badge collection.
  if (typeof current?.enabled === 'boolean') return current.enabled;
  return read(LEGACY_ACHIEVEMENTS_KEY)?.developer === true;
}

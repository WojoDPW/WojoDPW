// Small per-browser preferences that have no business living in Firestore
// (an API key you paste in yourself, a UI preference). Plain localStorage,
// wrapped defensively since it can throw in a locked-down browser context.

const PREFIX = 'big-house-blueprint';
const OLD_PREFIX = 'jeffs-cool-app'; // pre-rename key; read as a fallback only

export function getLocalSetting(key, fallback = null) {
  try {
    const value = localStorage.getItem(`${PREFIX}:${key}`);
    if (value !== null) return value;
    const legacyValue = localStorage.getItem(`${OLD_PREFIX}:${key}`);
    if (legacyValue !== null) {
      setLocalSetting(key, legacyValue); // migrate it forward so this is one-time
      return legacyValue;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function setLocalSetting(key, value) {
  try {
    localStorage.setItem(`${PREFIX}:${key}`, value);
  } catch {
    // Ignore — worst case the preference doesn't persist this session.
  }
}

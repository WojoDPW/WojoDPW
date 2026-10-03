// Small per-browser preferences that have no business living in Firestore
// (an API key you paste in yourself, a UI preference). Plain localStorage,
// wrapped defensively since it can throw in a locked-down browser context.

export function getLocalSetting(key, fallback = null) {
  try {
    const value = localStorage.getItem(`jeffs-cool-app:${key}`);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function setLocalSetting(key, value) {
  try {
    localStorage.setItem(`jeffs-cool-app:${key}`, value);
  } catch {
    // Ignore — worst case the preference doesn't persist this session.
  }
}

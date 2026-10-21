export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'go-go-gas-theme';
export const MAP_THEME_STORAGE_KEY = 'go-go-gas-map-theme';
const THEME_EVENT = 'go-go-gas-theme-change';

// Runs before the body is painted. No saved choice (including invalid data) means light.
export const themeInitializationScript = `(() => {
  let theme = 'light';
  try { if (localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === 'dark') theme = 'dark'; } catch {}
  document.documentElement.dataset.theme = theme;
  let mapTheme = 'light';
  try { if (localStorage.getItem(${JSON.stringify(MAP_THEME_STORAGE_KEY)}) === 'dark') mapTheme = 'dark'; } catch {}
  document.documentElement.dataset.mapTheme = mapTheme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#171717' : '#ffffff';
})();`;

export const getTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

export const getMapTheme = (): Theme =>
  document.documentElement.dataset.mapTheme === 'dark' ? 'dark' : 'light';

export const getServerTheme = (): Theme => 'light';

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#171717' : '#ffffff';
};

export const setTheme = (theme: Theme) => {
  applyTheme(theme);
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {
    // Storage can be unavailable; retain the choice for this session.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
};

export const setMapTheme = (theme: Theme) => {
  document.documentElement.dataset.mapTheme = theme;
  try { localStorage.setItem(MAP_THEME_STORAGE_KEY, theme); } catch {
    // Keep map appearance independent even when storage is unavailable.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
};

export const subscribeToTheme = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== MAP_THEME_STORAGE_KEY && event.key !== null) return;
    const theme = event.newValue === 'dark' ? 'dark' : 'light';
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(theme);
    if (event.key === MAP_THEME_STORAGE_KEY || event.key === null) document.documentElement.dataset.mapTheme = theme;
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
};

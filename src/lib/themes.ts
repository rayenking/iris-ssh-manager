import { useSettingsStore, type Theme } from '../stores/settingsStore';

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function getCurrentTheme(): Theme {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'iris-pink' ? 'iris-pink' : 'dark-minimal';
}

export function syncThemeFromSettings() {
  const theme = useSettingsStore.getState().theme;
  applyTheme(theme);
  return theme;
}

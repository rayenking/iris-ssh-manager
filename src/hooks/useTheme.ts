import { useEffect } from 'react';
import { applyTheme, getCurrentTheme } from '../lib/themes';
import { useSettingsStore } from '../stores/settingsStore';

export function useTheme() {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return {
    applyTheme,
    getCurrentTheme,
  };
}

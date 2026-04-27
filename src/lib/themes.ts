export type Theme = 'dark-minimal' | 'iris-pink';

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function getCurrentTheme(): Theme {
  const theme = document.documentElement.getAttribute('data-theme');
  return (theme === 'dark-minimal' || theme === 'iris-pink') ? theme : 'dark-minimal';
}

export const THEME_CATALOG: string[] = [
  'light',
  'dark',
  'light-neutral',
  'dark-neutral',
  'nord',
]

export const normalizeSavedTheme = (
  value: string,
  fallback: string,
  customThemeNames: string[] = [],
) => (THEME_CATALOG.includes(value) || customThemeNames.includes(value) ? value : fallback)

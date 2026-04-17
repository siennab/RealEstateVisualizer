export const THEMES = {
  cream: {
    name: 'Cream & Rose',
    bg: '#FEF6E4',
    land: '#FEF6E4',
    gridLine: 'rgba(23,44,102,0.05)',
    water: '#CFE6EA',
    waterDot: 'rgba(23,44,102,0.12)',
    waterLabel: '#6B8A96',
    park: '#D5E8C5',
    majorRoad: '#FFFFFF',
    minorRoad: 'rgba(23,44,102,0.08)',
    labelText: '#172C66',
    ink: '#172C66',
    inkSoft: 'rgba(23,44,102,0.6)',
    inkMuted: 'rgba(23,44,102,0.35)',
    accent: '#F582AE',
    accent2: '#8BD3DD',
    sheet: '#FFFFFF',
    chip: '#FFFFFF',
  },
  mint: {
    name: 'Mint Parlor',
    bg: '#EAF4EC',
    land: '#EAF4EC',
    gridLine: 'rgba(30,58,56,0.05)',
    water: '#B7D7CF',
    waterDot: 'rgba(30,58,56,0.12)',
    waterLabel: '#4C6B66',
    park: '#C5DBA9',
    majorRoad: '#FFFFFF',
    minorRoad: 'rgba(30,58,56,0.08)',
    labelText: '#1E3A38',
    ink: '#1E3A38',
    inkSoft: 'rgba(30,58,56,0.6)',
    inkMuted: 'rgba(30,58,56,0.35)',
    accent: '#E8743B',
    accent2: '#F4C95D',
    sheet: '#FFFFFF',
    chip: '#FFFFFF',
  },
  midnight: {
    name: 'Midnight Map',
    bg: '#1B2238',
    land: '#232B47',
    gridLine: 'rgba(255,255,255,0.04)',
    water: '#141A2E',
    waterDot: 'rgba(255,255,255,0.06)',
    waterLabel: '#6D7CA8',
    park: '#304054',
    majorRoad: 'rgba(255,255,255,0.22)',
    minorRoad: 'rgba(255,255,255,0.08)',
    labelText: '#E7ECF8',
    ink: '#F7F4EA',
    inkSoft: 'rgba(247,244,234,0.65)',
    inkMuted: 'rgba(247,244,234,0.35)',
    accent: '#F582AE',
    accent2: '#8BD3DD',
    sheet: '#2B3352',
    chip: '#2B3352',
  },
}

export function applyTheme(themeName) {
  const theme = THEMES[themeName] || THEMES.cream
  const root = document.documentElement
  root.style.setProperty('--theme-bg', theme.bg)
  root.style.setProperty('--theme-land', theme.land)
  root.style.setProperty('--theme-grid-line', theme.gridLine)
  root.style.setProperty('--theme-water', theme.water)
  root.style.setProperty('--theme-water-dot', theme.waterDot)
  root.style.setProperty('--theme-water-label', theme.waterLabel)
  root.style.setProperty('--theme-park', theme.park)
  root.style.setProperty('--theme-major-road', theme.majorRoad)
  root.style.setProperty('--theme-minor-road', theme.minorRoad)
  root.style.setProperty('--theme-label-text', theme.labelText)
  root.style.setProperty('--theme-ink', theme.ink)
  root.style.setProperty('--theme-ink-soft', theme.inkSoft)
  root.style.setProperty('--theme-ink-muted', theme.inkMuted)
  root.style.setProperty('--theme-accent', theme.accent)
  root.style.setProperty('--theme-accent2', theme.accent2)
  root.style.setProperty('--theme-sheet', theme.sheet)
  root.style.setProperty('--theme-chip', theme.chip)
}

'use client'

interface ThemeSelectorProps {
  theme: string
  onThemeChange: (theme: string) => void
}

export default function ThemeSelector({ theme, onThemeChange }: ThemeSelectorProps) {
  const themes = [
    'theme-pink',
    'theme-wine',
    'theme-disco',
    'theme-rainbow',
    'theme-cyan',
    'theme-green',
    'theme-purple',
    'theme-orange',
  ]

  const themeColors: Record<string, string> = {
    'theme-pink': 'bg-gradient-to-br from-rose-400 to-red-600',
    'theme-wine': 'bg-gradient-to-br from-red-700 to-red-900',
    'theme-disco': 'bg-gradient-to-br from-pink-500 via-purple-500 to-pink-600',
    'theme-rainbow': 'bg-gradient-to-r from-pink-500 via-yellow-400 via-green-400 via-blue-400 via-purple-500 to-pink-500 animate-pulse',
    'theme-cyan': 'bg-gradient-to-br from-cyan-400 to-cyan-600',
    'theme-green': 'bg-gradient-to-br from-green-400 to-green-600',
    'theme-purple': 'bg-gradient-to-br from-purple-400 to-purple-600',
    'theme-orange': 'bg-gradient-to-br from-orange-400 to-orange-600',
  }

  const handleThemeChange = () => {
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    onThemeChange(themes[nextIndex])
  }

  return (
    <button
      onClick={handleThemeChange}
      className={`${themeColors[theme]} h-10 w-10 rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95`}
      title="Click to change theme"
      aria-label="Change color theme"
    />
  )
}

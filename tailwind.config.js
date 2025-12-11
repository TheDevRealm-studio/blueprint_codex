/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'cyber-dark': '#020408', // Deepest background
        'cyber-panel': '#050A14', // Panel background
        'cyber-card': '#0A1020', // Card background
        'cyber-green': '#00FF9D', // Neon Green
        'cyber-purple': '#7C3AED', // Neon Purple
        'cyber-orange': '#F59E0B', // Neon Orange
        'cyber-blue': '#3B82F6', // Neon Blue
        'cyber-text': '#94A3B8', // Muted Text
        'cyber-text-bright': '#E2E8F0', // Bright Text

        // Legacy mappings for compatibility
        'ue-dark': '#020408',
        'ue-panel': '#050A14',
        'ue-header': '#0A1020',
        'ue-selected': '#00FF9D', // Selection becomes green
        'ue-text': '#94A3B8',
        'ue-text-bright': '#E2E8F0',
        'ue-accent': '#00FF9D', // Accent becomes green

        'brand-green': '#00FF9D',
        'brand-purple': '#7C3AED',
        'brand-orange': '#F59E0B',
        'brand-dark': '#020408',
        'brand-surface': '#050A14',
        'brand-text': '#94A3B8',
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'monospace'], // Default to mono for the cyber look
        mono: ['JetBrains Mono', 'monospace'],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.cyber-text'),
            h1: { color: theme('colors.cyber-green'), fontFamily: 'monospace' },
            h2: { color: theme('colors.cyber-purple'), fontFamily: 'monospace' },
            h3: { color: theme('colors.cyber-orange'), fontFamily: 'monospace' },
            strong: { color: theme('colors.cyber-text-bright') },
            code: { color: theme('colors.cyber-green'), backgroundColor: 'rgba(0, 255, 157, 0.1)' },
            blockquote: {
              borderLeftColor: theme('colors.cyber-purple'),
              color: theme('colors.cyber-text')
            },
            'ul > li::marker': { color: theme('colors.cyber-green') },
            a: { color: theme('colors.cyber-blue'), textDecoration: 'none' },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

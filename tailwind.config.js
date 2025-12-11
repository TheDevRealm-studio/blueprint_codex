/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ue-dark': '#151515', // UE5 Main Background
        'ue-panel': '#1E1E1E', // UE5 Panel Background
        'ue-header': '#262626', // UE5 Header/Toolbar
        'ue-selected': '#005FB8', // UE5 Selection Blue
        'ue-text': '#B0B0B0', // UE5 Standard Text
        'ue-text-bright': '#FFFFFF', // UE5 Bright Text
        'ue-accent': '#F08D49', // UE5 Orange Accent

        // Brand Palette (Legacy/Custom)
        'brand-green': '#10B981',
        'brand-purple': '#8B5CF6',
        'brand-orange': '#F59E0B',
        'brand-dark': '#151515',
        'brand-surface': '#1E1E1E',
        'brand-text': '#B0B0B0',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.gray.300'),
            h1: { color: theme('colors.brand-green') },
            h2: { color: theme('colors.brand-purple') },
            h3: { color: theme('colors.brand-orange') },
            strong: { color: theme('colors.white') },
            code: { color: theme('colors.brand-orange') },
            blockquote: {
              borderLeftColor: theme('colors.brand-purple'),
              color: theme('colors.gray.400')
            },
            'ul > li::marker': { color: theme('colors.brand-green') },
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

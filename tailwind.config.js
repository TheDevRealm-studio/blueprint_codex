/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'ue-dark': '#0A0F1C', // Updated to BG Dark
        'ue-panel': '#0F1419', // Updated to Surface Medium
        'ue-accent': '#10B981', // Updated to Primary Green

        // Brand Palette
        'brand-green': '#10B981',
        'brand-purple': '#8B5CF6',
        'brand-orange': '#F59E0B',
        'brand-dark': '#0A0F1C',
        'brand-surface': '#0F1419',
        'brand-text': '#64748B',
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

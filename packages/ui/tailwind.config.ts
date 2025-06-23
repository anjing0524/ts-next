import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}', // Path to UI package components
    // Include paths from apps that use this config
    // e.g., '../../apps/admin-portal/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class'],
  theme: {
    extend: {
      // Extend theme properties here
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config

import type { Config } from 'tailwindcss';
import sharedPreset from '@repo/tailwind-config/tailwind.preset';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    '@repo/ui/**/*.{ts,tsx}',
  ],

  presets: [sharedPreset],
};

export default config;

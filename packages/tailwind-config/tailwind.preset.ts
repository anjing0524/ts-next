import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * @repo/tailwind-config 公共 Tailwind 预设
 * 所有应用可通过在 tailwind.config.ts 中 `presets: [require('@repo/tailwind-config/tailwind.preset').default]`
 * 或 ESModule `import preset from '@repo/tailwind-config/tailwind.preset'` 引用。
 */
const preset: Config = {
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [tailwindcssAnimate],
};

export default preset;

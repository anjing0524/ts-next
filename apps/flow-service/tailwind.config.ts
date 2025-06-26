import type { Config } from 'tailwindcss';
import sharedPreset from '@repo/tailwind-config/tailwind.preset';

/**
 * Flow Service Tailwind CSS 配置
 * 继承共享的 Tailwind 预设配置
 */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    // 包含 @repo/ui 组件
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],

  presets: [sharedPreset],
};

export default config;
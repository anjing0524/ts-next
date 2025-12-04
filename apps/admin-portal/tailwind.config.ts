import type { Config } from 'tailwindcss';
import sharedPreset from '@repo/tailwind-config/tailwind.preset';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    '@repo/ui/**/*.{ts,tsx}',
  ],

  presets: [sharedPreset],

  // 增强的设计系统扩展 - 未来科技美学
  theme: {
    extend: {
      // 完整的语义颜色系统
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // 数据可视化调色板
        viridis: {
          50: '#f7fcfd',
          100: '#e0f3db',
          200: '#ccebc5',
          300: '#a8ddb5',
          400: '#7bccc4',
          500: '#4eb3d3',
          600: '#2b8cbe',
          700: '#0868ac',
          800: '#084081',
          900: '#081d58',
        },
        // 状态语义颜色
        success: {
          DEFAULT: '#10b981',
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        warning: {
          DEFAULT: '#f59e0b',
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        error: {
          DEFAULT: '#ef4444',
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        info: {
          DEFAULT: '#3b82f6',
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      // 独特的字体系统
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
        data: ['Clash Display', 'sans-serif'],
      },
      // 高级动画系统
      animation: {
        shimmer: 'shimmer 2s infinite linear',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        gradient: 'gradient 8s ease infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      // 自定义阴影系统
      boxShadow: {
        glow: '0 0 20px rgba(0, 245, 212, 0.5)',
        'glow-primary': '0 0 25px rgba(14, 165, 233, 0.4)',
        'card-hover': '0 10px 40px rgba(0, 0, 0, 0.15)',
        depth: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'inner-glow': 'inset 0 2px 4px 0 rgba(0, 245, 212, 0.2)',
      },
      // 自定义渐变
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-tech': 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        'gradient-neon': 'linear-gradient(90deg, #00f5d4 0%, #9d4edd 100%)',
      },
    },
  },
};

export default config;

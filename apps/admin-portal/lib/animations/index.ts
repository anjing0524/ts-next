/**
 * 动画配置库 - CSS动画替代方案
 * 由于项目未安装framer-motion，使用Tailwind CSS动画和CSS关键帧
 * Animation configuration library - CSS animation alternative
 * Since framer-motion is not installed, using Tailwind CSS animations and CSS keyframes
 */

// 标准动画类名配置 Standard animation class configurations
export const animations = {
  // 基础动画类 Base animation classes
  pulse: 'animate-pulse',
  'pulse-slow': 'animate-pulse-slow',
  shimmer: 'animate-shimmer',
  spin: 'animate-spin',
  'spin-slow': 'animate-spin-slow',
  float: 'animate-float',
  gradient: 'animate-gradient',
  'fade-in': 'animate-fade-in',
  'slide-up': 'animate-slide-up',

  // 组合动画 Combined animations
  'pulse-shimmer': 'animate-pulse animate-shimmer',
  'spin-pulse': 'animate-spin animate-pulse-slow',
} as const;

// 过渡持续时间配置 Transition duration configurations
export const transitionDurations = {
  fast: 'duration-150',
  normal: 'duration-300',
  slow: 'duration-500',
  slower: 'duration-700',
} as const;

// 缓动函数配置 Easing function configurations
export const easingFunctions = {
  linear: 'ease-linear',
  in: 'ease-in',
  out: 'ease-out',
  'in-out': 'ease-in-out',
} as const;

// 动画延迟配置 Animation delay configurations
export const animationDelays = {
  none: 'delay-0',
  short: 'delay-75',
  medium: 'delay-150',
  long: 'delay-300',
  longer: 'delay-500',
} as const;

// 预定义的动画变体 Predefined animation variants
export const fadeInUp = {
  initial: 'opacity-0 translate-y-4',
  animate: 'opacity-100 translate-y-0',
  transition: 'transition-all duration-300 ease-out',
} as const;

export const fadeIn = {
  initial: 'opacity-0',
  animate: 'opacity-100',
  transition: 'transition-opacity duration-300 ease-in-out',
} as const;

export const scaleIn = {
  initial: 'opacity-0 scale-95',
  animate: 'opacity-100 scale-100',
  transition: 'transition-all duration-300 ease-out',
} as const;

export const slideInLeft = {
  initial: 'opacity-0 -translate-x-4',
  animate: 'opacity-100 translate-x-0',
  transition: 'transition-all duration-300 ease-out',
} as const;

export const slideInRight = {
  initial: 'opacity-0 translate-x-4',
  animate: 'opacity-100 translate-x-0',
  transition: 'transition-all duration-300 ease-out',
} as const;

// 交错动画配置 Stagger animation configurations
export const staggerConfig = {
  container: 'opacity-0',
  item: 'opacity-0 translate-y-2',
  transition: 'transition-all duration-300 ease-out',
} as const;

// 页面过渡配置 Page transition configuration
export const pageTransition = {
  initial: 'opacity-0 translate-x-4',
  animate: 'opacity-100 translate-x-0',
  exit: 'opacity-0 -translate-x-4',
  transition: 'transition-all duration-300 ease-in-out',
} as const;

// 悬停效果配置 Hover effects configuration
export const hoverEffects = {
  scale: 'hover:scale-105 active:scale-95 transition-transform duration-200',
  lift: 'hover:-translate-y-1 active:translate-y-0 transition-transform duration-200',
  glow: 'hover:shadow-glow-primary transition-shadow duration-300',
} as const;

// 焦点效果配置 Focus effects configuration
export const focusEffects = {
  ring: 'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2',
  scale: 'focus:scale-105 transition-transform duration-200',
} as const;

// 加载动画配置 Loading animations configuration
export const loadingAnimations = {
  shimmer: {
    base: 'relative overflow-hidden',
    overlay: 'absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer',
  },
  pulse: {
    base: 'animate-pulse-slow',
    subtle: 'animate-pulse',
  },
} as const;

// 工具函数：组合动画类 Utility function: combine animation classes
export function combineAnimations(...animationClasses: string[]): string {
  return animationClasses.filter(Boolean).join(' ');
}

// 工具函数：创建交错延迟 Utility function: create staggered delays
export function getStaggerDelay(index: number, baseDelay: number = 50): string {
  const delay = index * baseDelay;
  if (delay <= 0) return '';
  if (delay <= 75) return 'delay-75';
  if (delay <= 150) return 'delay-150';
  if (delay <= 300) return 'delay-300';
  if (delay <= 500) return 'delay-500';
  return 'delay-1000';
}

// 工具函数：应用动画变体 Utility function: apply animation variant
export function applyVariant(
  variant: typeof fadeInUp | typeof fadeIn | typeof scaleIn | typeof slideInLeft | typeof slideInRight,
  isActive: boolean = true
): string {
  return isActive ? `${variant.animate} ${variant.transition}` : variant.initial;
}

// 骨架屏加载动画配置 Skeleton loading animations configuration
export const skeletonAnimations = {
  // 基础骨架动画 Base skeleton animations
  base: 'bg-gradient-to-r from-muted/50 to-muted/30 rounded-lg',

  // 闪烁效果 Shimmer effect
  shimmer: 'relative overflow-hidden',
  shimmerOverlay: 'absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer',

  // 变体 Variants
  text: 'h-4',
  card: 'h-48',
  avatar: 'h-12 w-12 rounded-full',
  table: 'h-8',
  chart: 'h-64',
  button: 'h-10 rounded-md',

  // 尺寸 Sizes
  sizes: {
    xs: 'h-2',
    sm: 'h-3',
    md: 'h-4',
    lg: 'h-6',
    xl: 'h-8',
    '2xl': 'h-12',
  },

  // 宽度 Widths
  widths: {
    full: 'w-full',
    '1/2': 'w-1/2',
    '1/3': 'w-1/3',
    '2/3': 'w-2/3',
    '1/4': 'w-1/4',
    '3/4': 'w-3/4',
    auto: 'w-auto',
  },
} as const;
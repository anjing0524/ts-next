import { cn } from '@repo/ui';
import { skeletonAnimations, combineAnimations } from '@/lib/animations';

interface SkeletonLoaderProps {
  /**
   * 骨架屏变体类型
   * Skeleton variant type
   * @default "text"
   */
  variant?: 'text' | 'card' | 'avatar' | 'table' | 'chart' | 'button';

  /**
   * 骨架屏数量
   * Number of skeleton items
   * @default 1
   */
  count?: number;

  /**
   * 额外的CSS类名
   * Additional CSS classes
   */
  className?: string;

  /**
   * 启用闪烁动画效果
   * Enable shimmer animation effect
   * @default true
   */
  shimmer?: boolean;

  /**
   * 启用脉动动画效果
   * Enable pulse animation effect
   * @default false
   */
  pulse?: boolean;

  /**
   * 骨架屏宽度（Tailwind宽度类）
   * Width of the skeleton (Tailwind width class)
   * @default "w-full"
   */
  width?: string;

  /**
   * 骨架屏高度（Tailwind高度类）
   * Height of the skeleton (Tailwind height class)
   * @default 根据变体自动设置
   */
  height?: string;

  /**
   * 圆角样式
   * Border radius style
   * @default 根据变体自动设置
   */
  rounded?: string;

  /**
   * ARIA标签用于无障碍访问
   * ARIA label for accessibility
   * @default "Loading content"
   */
  'aria-label'?: string;
}

export function SkeletonLoader({
  variant = 'text',
  count = 1,
  className,
  shimmer = true,
  pulse = false,
  width,
  height,
  rounded,
  'aria-label': ariaLabel = 'Loading content',
}: SkeletonLoaderProps) {
  // 根据变体确定高度 Determine height based on variant
  const getHeightClass = () => {
    if (height) return height;

    switch (variant) {
      case 'text':
        return skeletonAnimations.text;
      case 'card':
        return skeletonAnimations.card;
      case 'avatar':
        return skeletonAnimations.avatar;
      case 'table':
        return skeletonAnimations.table;
      case 'chart':
        return skeletonAnimations.chart;
      case 'button':
        return skeletonAnimations.button;
      default:
        return skeletonAnimations.text;
    }
  };

  // 根据变体确定圆角 Determine rounded style based on variant
  const getRoundedClass = () => {
    if (rounded) return rounded;

    switch (variant) {
      case 'avatar':
        return 'rounded-full';
      case 'button':
        return 'rounded-md';
      default:
        return 'rounded-lg';
    }
  };

  // 根据变体确定宽度 Determine width based on variant
  const getWidthClass = () => {
    if (width) return width;

    switch (variant) {
      case 'avatar':
        return 'w-12';
      default:
        return 'w-full';
    }
  };

  // 构建基础类名 Build base classes
  const baseClasses = cn(
    skeletonAnimations.base,
    getHeightClass(),
    getRoundedClass(),
    getWidthClass(),
    pulse ? 'animate-pulse-slow' : 'animate-pulse',
    className
  );

  // 闪烁覆盖层 Shimmer overlay
  const shimmerOverlay = shimmer && (
    <div
      className={cn(
        skeletonAnimations.shimmerOverlay,
        'pointer-events-none'
      )}
      aria-hidden="true"
    />
  );

  // 单个骨架屏项目 Single skeleton item
  const skeletonItem = (
    <div
      className={cn(baseClasses, shimmer && skeletonAnimations.shimmer)}
      role="status"
      aria-label={ariaLabel}
    >
      {shimmerOverlay}
      <span className="sr-only">{ariaLabel}</span>
    </div>
  );

  // 多个骨架屏 Multiple skeletons
  if (count > 1) {
    return (
      <div className="space-y-2" role="list" aria-label={`${count} loading items`}>
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} role="listitem">
            {skeletonItem}
          </div>
        ))}
      </div>
    );
  }

  return skeletonItem;
}

// 预配置的变体组件 Pre-configured variant components
export function TextSkeleton(props: Omit<SkeletonLoaderProps, 'variant'>) {
  return <SkeletonLoader variant="text" {...props} />;
}

export function CardSkeleton(props: Omit<SkeletonLoaderProps, 'variant'>) {
  return <SkeletonLoader variant="card" {...props} />;
}

export function AvatarSkeleton(props: Omit<SkeletonLoaderProps, 'variant'>) {
  return <SkeletonLoader variant="avatar" {...props} />;
}

export function TableSkeleton(props: Omit<SkeletonLoaderProps, 'variant'>) {
  return <SkeletonLoader variant="table" {...props} />;
}

export function ChartSkeleton(props: Omit<SkeletonLoaderProps, 'variant'>) {
  return <SkeletonLoader variant="chart" {...props} />;
}

export function ButtonSkeleton(props: Omit<SkeletonLoaderProps, 'variant'>) {
  return <SkeletonLoader variant="button" {...props} />;
}

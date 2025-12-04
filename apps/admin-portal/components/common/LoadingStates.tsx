/**
 * 加载状态组件集合
 * Loading states component collection
 * 提供各种页面和组件的加载状态
 * Provides loading states for various pages and components
 */

'use client';

import { cn } from '@repo/ui';
import {
  SkeletonLoader,
  CardSkeleton,
  TableSkeleton,
  TextSkeleton,
  ChartSkeleton
} from './SkeletonLoader';
import { animations, getStaggerDelay } from '@/lib/animations';

interface PageLoadingProps {
  /**
   * 加载消息
   * Loading message
   * @default "Loading..."
   */
  message?: string;

  /**
   * 显示加载指示器
   * Show loading indicator
   * @default true
   */
  showSpinner?: boolean;

  /**
   * 全屏模式
   * Fullscreen mode
   * @default true
   */
  fullscreen?: boolean;
}

export function PageLoading({
  message = 'Loading...',
  showSpinner = true,
  fullscreen = true,
}: PageLoadingProps) {
  const containerClasses = cn(
    'flex flex-col items-center justify-center bg-gradient-to-br from-background to-secondary/30',
    fullscreen && 'min-h-screen'
  );

  return (
    <div
      className={containerClasses}
      role="status"
      aria-label="Loading page"
    >
      {showSpinner && (
        <div className="relative mb-6">
          {/* 外圈 Outer ring */}
          <div className="w-16 h-16 border-4 border-primary/20 rounded-full" />
          {/* 内圈旋转 Inner spinning ring */}
          <div className={cn(
            'absolute inset-0 border-4 border-t-primary border-transparent rounded-full',
            animations['spin-slow']
          )} />
          {/* 中心点 Center dot */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-2 bg-primary rounded-full" />
          </div>
        </div>
      )}

      <div className={cn('text-center', animations.pulse)}>
        <p className="text-lg font-medium text-foreground mb-2">{message}</p>
        <p className="text-sm text-muted-foreground">
          Please wait while we prepare your dashboard
        </p>
      </div>

      {/* 背景动画 Background animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-r from-primary/5 to-transparent opacity-30 animate-gradient" />
      </div>
    </div>
  );
}

interface TableLoadingProps {
  /**
   * 列数
   * Number of columns
   * @default 5
   */
  columns?: number;

  /**
   * 行数
   * Number of rows
   * @default 10
   */
  rows?: number;

  /**
   * 显示表头
   * Show table header
   * @default true
   */
  showHeader?: boolean;

  /**
   * 启用交错动画
   * Enable staggered animation
   * @default true
   */
  staggered?: boolean;
}

export function TableLoading({
  columns = 5,
  rows = 10,
  showHeader = true,
  staggered = true,
}: TableLoadingProps) {
  return (
    <div className="w-full overflow-hidden" role="status" aria-label="Loading table data">
      {showHeader && (
        <div className="flex space-x-4 mb-4">
          {Array.from({ length: columns }).map((_, index) => (
            <div key={`header-${index}`} className="flex-1">
              <TextSkeleton
                className="h-6"
                shimmer={false}
                aria-label={`Loading column header ${index + 1}`}
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className={cn(
              'flex space-x-4',
              staggered && getStaggerDelay(rowIndex)
            )}
            style={{
              opacity: staggered ? 1 - (rowIndex * 0.05) : 1,
            }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={`cell-${rowIndex}-${colIndex}`} className="flex-1">
                <TableSkeleton
                  className={cn(
                    colIndex === 0 && 'w-20',
                    colIndex === columns - 1 && 'w-24'
                  )}
                  shimmer={rowIndex % 2 === 0} // 交替闪烁效果 Alternate shimmer effect
                  aria-label={`Loading table cell row ${rowIndex + 1}, column ${colIndex + 1}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface CardGridLoadingProps {
  /**
   * 卡片数量
   * Number of cards
   * @default 6
   */
  count?: number;

  /**
   * 列数配置
   * Column configuration
   * @default 3
   */
  columns?: 2 | 3 | 4;

  /**
   * 启用交错动画
   * Enable staggered animation
   * @default true
   */
  staggered?: boolean;
}

export function CardGridLoading({
  count = 6,
  columns = 3,
  staggered = true,
}: CardGridLoadingProps) {
  const gridClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div
      className={cn('grid gap-6', gridClasses[columns])}
      role="status"
      aria-label={`Loading ${count} cards`}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn('relative', staggered && getStaggerDelay(index, 100))}
        >
          <CardSkeleton
            className="h-48"
            shimmer={true}
            pulse={index % 2 === 0}
            aria-label={`Loading card ${index + 1}`}
          />

          {/* 卡片内容骨架 Card content skeleton */}
          <div className="absolute inset-0 p-6 flex flex-col justify-between pointer-events-none">
            <div>
              <TextSkeleton
                className="w-3/4 h-6 mb-4"
                shimmer={false}
                aria-label="Loading card title"
              />
              <TextSkeleton
                className="w-1/2 h-4 mb-2"
                shimmer={false}
                aria-label="Loading card description line 1"
              />
              <TextSkeleton
                className="w-2/3 h-4"
                shimmer={false}
                aria-label="Loading card description line 2"
              />
            </div>

            <div className="flex justify-between items-center">
              <TextSkeleton
                className="w-20 h-4"
                shimmer={false}
                aria-label="Loading card footer left"
              />
              <TextSkeleton
                className="w-10 h-4"
                shimmer={false}
                aria-label="Loading card footer right"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ChartLoadingProps {
  /**
   * 图表类型
   * Chart type
   * @default "line"
   */
  type?: 'line' | 'bar' | 'pie';

  /**
   * 图表高度（像素）
   * Chart height (pixels)
   * @default 300
   */
  height?: number;

  /**
   * 显示标题
   * Show title
   * @default true
   */
  showTitle?: boolean;
}

export function ChartLoading({
  type = 'line',
  height = 300,
  showTitle = true,
}: ChartLoadingProps) {
  const isBarChart = type === 'bar';
  const isPieChart = type === 'pie';

  return (
    <div
      className="relative rounded-lg border bg-card p-6"
      style={{ height: `${height}px` }}
      role="status"
      aria-label={`Loading ${type} chart`}
    >
      {showTitle && (
        <div className="flex justify-between items-center mb-6">
          <div className="space-y-2">
            <TextSkeleton
              className="w-40 h-6"
              shimmer={false}
              aria-label="Loading chart title"
            />
            <TextSkeleton
              className="w-32 h-4"
              shimmer={false}
              aria-label="Loading chart subtitle"
            />
          </div>
          <TextSkeleton
            className="w-24 h-10 rounded-md"
            shimmer={false}
            aria-label="Loading chart control"
          />
        </div>
      )}

      {/* 图表区域骨架 Chart area skeleton */}
      {isPieChart ? (
        // 饼图骨架 Pie chart skeleton
        <div className="absolute inset-6 flex items-center justify-center">
          <div className="relative w-48 h-48">
            <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
            <div className={cn(
              'absolute inset-8 border-4 border-t-primary border-transparent rounded-full',
              animations['spin-slow']
            )} />
          </div>
        </div>
      ) : (
        // 折线图/柱状图骨架 Line/bar chart skeleton
        <div className="absolute inset-x-6 bottom-6 top-20 flex items-end space-x-2">
          {Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'flex-1 bg-gradient-to-t from-primary/30 to-primary/10 rounded-t',
                animations.pulse,
                getStaggerDelay(index, 80)
              )}
              style={{
                height: `${Math.random() * 80 + 20}%`,
              }}
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* X轴标签 X-axis labels */}
      {!isPieChart && (
        <div className="absolute bottom-0 inset-x-6 flex justify-between text-xs text-muted-foreground">
          {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
            (label, index) => (
              <span key={index} aria-hidden="true">{label}</span>
            )
          )}
        </div>
      )}

      {/* 闪烁覆盖层 Shimmer overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer pointer-events-none" />
    </div>
  );
}

/**
 * 仪表板综合加载状态
 * Dashboard comprehensive loading state
 */
export function DashboardLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading dashboard">
      {/* 统计卡片加载 Stats cards loading */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={cn('relative', getStaggerDelay(index, 100))}
          >
            <CardSkeleton
              className="h-32"
              shimmer={true}
              aria-label={`Loading stats card ${index + 1}`}
            />
            <div className="absolute inset-0 p-6 pointer-events-none">
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <TextSkeleton
                    className="w-24 h-4"
                    shimmer={false}
                    aria-label="Loading stats label"
                  />
                  <TextSkeleton
                    className="w-16 h-8"
                    shimmer={false}
                    aria-label="Loading stats value"
                  />
                </div>
                <div
                  className="h-10 w-10 rounded-lg bg-primary/20"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-4">
                <TextSkeleton
                  className="w-32 h-3"
                  shimmer={false}
                  aria-label="Loading stats trend"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 主图表加载 Main chart loading */}
      <ChartLoading type="line" height={350} />

      {/* 最近活动表格加载 Recent activity table loading */}
      <div>
        <TextSkeleton
          className="w-48 h-8 mb-6"
          shimmer={false}
          aria-label="Loading recent activity title"
        />
        <TableLoading columns={4} rows={5} />
      </div>
    </div>
  );
}

/**
 * 内联加载指示器
 * Inline loading indicator
 */
export function InlineLoading({
  size = 'md',
  text,
}: {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-3',
    lg: 'w-8 h-8 border-4',
  };

  return (
    <div className="flex items-center space-x-2" role="status" aria-label="Loading">
      <div className="relative">
        <div className={cn(
          'border-primary/20 rounded-full',
          sizeClasses[size]
        )} />
        <div className={cn(
          'absolute inset-0 border-t-primary border-transparent rounded-full',
          animations.spin,
          sizeClasses[size]
        )} />
      </div>
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </div>
  );
}
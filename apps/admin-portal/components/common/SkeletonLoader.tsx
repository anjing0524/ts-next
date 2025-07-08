import { Skeleton } from '@repo/ui';

interface SkeletonLoaderProps {
  count?: number;
  className?: string;
}

export function SkeletonLoader({ count = 1, className }: SkeletonLoaderProps) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={className || 'h-8 w-full'} />
      ))}
    </div>
  );
}

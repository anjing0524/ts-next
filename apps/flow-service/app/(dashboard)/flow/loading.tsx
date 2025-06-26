import { Skeleton } from '@repo/ui';

export default function FlowLoading() {
  return (
    <div className="space-y-6 w-full">
      {/* 查询区域骨架屏 */}
      <div className="p-4 rounded-lg bg-background">
        <div className="flex flex-col space-y-4">
          <Skeleton className="h-8 w-[200px]" />
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-10 w-[200px]" />
            <Skeleton className="h-10 w-[200px]" />
            <Skeleton className="h-10 w-[100px]" />
          </div>
        </div>
      </div>

      {/* 统计表格骨架屏 */}
      <div className="rounded-lg bg-background">
        <div className="p-4">
          <div className="grid grid-cols-5 gap-4">
            {Array(5)
              .fill(0)
              .map((_, i) => (
                <Skeleton key={i} className="h-8" />
              ))}
          </div>
          <div className="mt-4 space-y-2">
            {Array(3)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="grid grid-cols-5 gap-4">
                  {Array(5)
                    .fill(0)
                    .map((_, j) => (
                      <Skeleton key={j} className="h-6" />
                    ))}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* DAG流程图骨架屏 */}
      <div className="bg-card rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/30">
          <Skeleton className="h-6 w-[150px]" />
          <Skeleton className="h-4 w-[300px] mt-2" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    </div>
  );
}

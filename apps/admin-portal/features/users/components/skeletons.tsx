/**
 * 用户列表骨架屏 (User List Loading Skeleton)
 *
 * Suspense 边界的加载状态回退
 * Loading state fallback for Suspense boundary
 */

export function UserListSkeleton() {
  return (
    <div className="space-y-4">
      {/* 表头骨架 (Table header skeleton) */}
      <div className="overflow-x-auto border rounded">
        <div className="h-12 bg-gray-200 rounded animate-pulse" />

        {/* 行骨架 (Row skeletons) */}
        <div className="space-y-2 p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>

      {/* 分页信息骨架 (Pagination info skeleton) */}
      <div className="flex justify-between items-center">
        <div className="h-6 bg-gray-200 rounded w-64 animate-pulse" />
        <div className="h-6 bg-gray-200 rounded w-32 animate-pulse" />
      </div>
    </div>
  );
}

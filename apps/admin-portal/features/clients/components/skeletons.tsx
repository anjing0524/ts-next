export function ClientListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border rounded">
        <div className="h-12 bg-gray-200 rounded animate-pulse" />
        <div className="space-y-2 p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div className="h-6 bg-gray-200 rounded w-64 animate-pulse" />
        <div className="h-6 bg-gray-200 rounded w-32 animate-pulse" />
      </div>
    </div>
  );
}

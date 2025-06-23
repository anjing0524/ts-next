// app/(dashboard)/admin/layout.tsx
import React, { Suspense } from 'react';
import AdminSidebar from '@/components/admin/sidebar'; // Placeholder
import AdminHeader from '@/components/admin/header';   // Placeholder
// import { AuthProvider } from '@/context/AuthContext'; // If using context instead of hook directly in components

/**
 * 后台管理界面的主布局 (Main Layout for the Admin Dashboard Area)
 *
 * 此布局包含一个侧边栏、一个顶部导航栏和一个主内容区域。
 * This layout includes a sidebar, a top navigation bar, and a main content area.
 *
 * @param children - React子组件，将在此布局的内容区域中呈现。
 *                 (React children components that will be rendered in the content area of this layout.)
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // <AuthProvider> // Wrap with AuthProvider if using context
    <div className="flex h-screen bg-gray-100 dark:bg-slate-900">
      {/* 侧边栏 (Sidebar) */}
      {/* 使用Suspense，因为Sidebar内部可能会使用useAuth，其中包含useEffect */}
      <Suspense fallback={<div className="w-64 bg-white dark:bg-slate-800 p-4">加载侧边栏...</div>}>
        <AdminSidebar />
      </Suspense>

      {/* 主内容区 (Main Content Area) */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部导航栏 (Header) */}
        <Suspense fallback={<div className="h-16 bg-white dark:bg-slate-800 shadow">加载页头...</div>}>
          <AdminHeader />
        </Suspense>

        {/* 页面内容 (Page Content) */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-slate-900 p-6">
          {children}
        </main>
      </div>
    </div>
    // </AuthProvider>
  );
}

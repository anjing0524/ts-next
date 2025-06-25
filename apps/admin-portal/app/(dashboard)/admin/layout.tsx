// app/(dashboard)/admin/layout.tsx
"use client"; // This layout now needs to be a Client Component for hooks and state

import React, { useState, useEffect, Suspense } from 'react';
import {
  SiteHeader,
  AppSidebar,
  MenuItem, // Assuming MenuItem is exported from @repo/ui/components (via app-sidebar)
  Drawer,
  DrawerContent
} from '@repo/ui/components';
import { useMobile } from '@repo/ui/hooks';
import { useAuth } from '@/hooks/useAuth'; // For user data and logout
import { cn } from '@repo/ui/utils'; // Use cn from shared ui package

/**
 * 后台管理界面的主布局 (Main Layout for the Admin Dashboard Area)
 * 改造后的布局，支持响应式侧边栏和动态菜单。
 * (Revised layout, supports responsive sidebar and dynamic menu.)
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useMobile(); // Hook to detect mobile viewport
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const { user, isLoading: isUserLoading, logout } = useAuth(); // Auth hook

  // Fetch menu items on component mount (client-side)
  useEffect(() => {
    async function fetchMenuItems() {
      try {
        const res = await fetch('/api/menu'); // Relative URL for client-side fetch
        if (!res.ok) {
          console.error('Failed to fetch menu items:', res.status, await res.text());
          setMenuItems([]); // Set to empty on error
          return;
        }
        const data = await res.json();
        setMenuItems(data as MenuItem[]);
      } catch (error) {
        console.error('Error fetching menu items:', error);
        setMenuItems([]); // Set to empty on error
      }
    }
    fetchMenuItems();
  }, []); // Empty dependency array means this runs once on mount

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(prev => !prev);
  };

  // Prepare user data for SiteHeader -> UserNav
  const userDataForHeader = user ? {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatar, // Assuming useAuth user object has an 'avatar' field
    email: user.email,
  } : undefined;

  // Fallback for Suspense while auth or menu is loading critical parts
  // This specific fallback might be too simple, customize as needed.
  const sidebarLoadingFallback = (
    <div className={cn("w-64 p-4 bg-background dark:bg-slate-800 border-r dark:border-slate-700 print:hidden", isMobile && "w-72")}>
      <div className="mb-4 px-4 text-lg font-semibold tracking-tight">导航菜单</div>
      {[...Array(5)].map((_, i) => (
          <div key={i} className="h-9 my-1 bg-muted rounded animate-pulse" />
      ))}
    </div>
  );


  return (
    // Consider if AuthProvider is needed here, original had it commented.
    // If useAuth works without it, then it's fine.
    <div className="flex min-h-screen w-full flex-col bg-muted/40 dark:bg-muted"> {/* Changed dark mode to dark:bg-muted */}
      <SiteHeader
        brandName="管理后台"
        user={userDataForHeader}
        onLogout={logout}
        isUserLoading={isUserLoading}
        onMobileMenuToggle={handleMobileMenuToggle} // Pass toggle handler
      />

      <div className="flex flex-1">
        {isMobile ? (
          <Drawer open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            {/* DrawerTrigger is part of SiteHeader's mobile button */}
            <DrawerContent side="left" className="p-0 w-72 bg-card dark:bg-card"> {/* Use bg-card for drawer content consistency */}
              <Suspense fallback={sidebarLoadingFallback}>
                 <AppSidebar
                    menuItems={menuItems}
                    headerText="导航菜单" // Mobile menu header
                    className="h-full" // Sidebar takes full height of drawer
                    onItemClick={() => setIsMobileMenuOpen(false)} // Close drawer on item click
                 />
              </Suspense>
            </DrawerContent>
          </Drawer>
        ) : (
          // Desktop sidebar
          <Suspense fallback={sidebarLoadingFallback}>
            <AppSidebar
              menuItems={menuItems}
              headerText="管理导航" // Desktop menu header
              className="w-64 hidden md:block bg-card dark:bg-card border-r border-border print:hidden" // Use bg-card and border-border
            />
          </Suspense>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 print:p-0"> {/* Adjusted padding */}
          {children}
        </main>
      </div>
    </div>
  );
}

// components/admin/header.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui';
import { LogOut, UserCircle, Settings, Menu as MenuIcon } from 'lucide-react'; // MenuIcon for mobile
import { useAuth } from '@/hooks/useAuth'; // Placeholder auth hook
// import { Sheet, SheetContent, SheetTrigger } from '@repo/ui'; // For mobile sidebar
// import AdminSidebar from './sidebar'; // To embed sidebar in sheet for mobile

/**
 * 后台管理界面的顶部导航栏 (Header for the Admin Dashboard)
 *
 * 包含用户信息、登出按钮，以及可能的移动端菜单触发器。
 * Includes user information, logout button, and potentially a mobile menu trigger.
 */
export default function AdminHeader() {
  const { user, logout, isLoading } = useAuth(); // Using the placeholder auth hook
  // const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    try {
      await logout(); // Call the logout function from useAuth
      // router.push('/login') is handled by useAuth's logout
    } catch (error) {
      console.error('Logout failed:', error);
      // Handle logout error display if needed
    }
  };

  if (isLoading) {
    return (
      <header className="flex items-center justify-between h-16 px-4 md:px-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          管理中心 (Admin Center)
        </div>
        <div className="h-8 w-24 bg-gray-200 dark:bg-slate-700 rounded animate-pulse"></div>{' '}
        {/* User info placeholder */}
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between h-16 px-4 md:px-6 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
      {/* Mobile Menu Trigger - uncomment and implement if Sheet is used for mobile sidebar */}
      {/*
      <div className="md:hidden">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon">
              <MenuIcon className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <AdminSidebar />
          </SheetContent>
        </Sheet>
      </div>
      */}

      {/* Desktop: Logo or breadcrumbs can go here if sidebar is persistent */}
      <div className="hidden md:block text-lg font-semibold text-slate-900 dark:text-slate-50">
        管理中心 (Admin Center)
      </div>

      {user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.avatar || undefined} alt={`@${user.username}`} />
                <AvatarFallback>
                  {user.displayName
                    ? user.displayName.charAt(0).toUpperCase()
                    : user.username.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none text-slate-900 dark:text-slate-50">
                  {user.displayName || user.username}
                </p>
                <p className="text-xs leading-none text-slate-500 dark:text-slate-400">
                  {/* Could display role or email if available */}
                  {/* {user.email || '管理员 (Administrator)'} */}
                  用户ID (User ID): {user.id}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/profile" className="flex items-center cursor-pointer">
                <UserCircle className="mr-2 h-4 w-4" />
                <span>个人资料 (Profile)</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/settings" className="flex items-center cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>设置 (Settings)</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="flex items-center cursor-pointer text-red-600 dark:text-red-400 hover:!text-red-700 dark:hover:!text-red-500"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>登出 (Log out)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="outline" asChild>
          <Link href="/login">登录 (Login)</Link>
        </Button>
      )}
    </header>
  );
}

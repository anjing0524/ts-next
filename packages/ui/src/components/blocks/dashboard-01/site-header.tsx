'use client'; // Now a client component

import * as React from 'react';
import { cn } from '../../../lib/utils';
// import { MainNav } from "./nav-main"; // Assuming MainNav might be used
import { UserNav } from './user-nav';
import { Button } from '../../ui/button';
import { Menu as MenuIcon } from 'lucide-react'; // Hamburger icon

interface UserDataForHeader {
  id?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
}

interface SiteHeaderProps extends React.HTMLAttributes<HTMLElement> {
  brandName?: React.ReactNode;
  user?: UserDataForHeader;
  onLogout?: () => Promise<void> | void;
  isUserLoading?: boolean;
  onMobileMenuToggle?: () => void; // Callback to toggle mobile menu
  // mainNavItems?: any[];
}

export function SiteHeader({
  className,
  brandName = '管理中心', // Admin Center
  user,
  onLogout,
  isUserLoading,
  onMobileMenuToggle,
  ...props
}: SiteHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
      {...props}
    >
      <div className="container mx-auto flex h-14 max-w-screen-2xl items-center px-4">
        {/* Mobile Menu Toggle Button */}
        {onMobileMenuToggle && (
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 md:hidden" // Only show on mobile (screens smaller than md)
            onClick={onMobileMenuToggle}
            aria-label="Toggle menu"
          >
            <MenuIcon className="h-6 w-6" />
          </Button>
        )}
        {typeof brandName === 'string' ? (
          <div className="mr-4 font-bold flex items-center">{brandName}</div> // Show brand on mobile too if toggle is present
        ) : (
          <div className="mr-4 flex items-center">{brandName}</div>
        )}
        {/* <MainNav className="mx-6 hidden md:flex" /> */}{' '}
        {/* Hide MainNav on mobile for now, can be part of drawer */}
        <div className="flex flex-1 items-center justify-end space-x-4">
          <UserNav user={user} onLogout={onLogout} isLoading={isUserLoading} />
        </div>
      </div>
    </header>
  );
}

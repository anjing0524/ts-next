"use client"; // For DropdownMenu interaction

import * as React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "../../avatar"; // from packages/ui
import { Button } from "../../button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../dropdown-menu"; // from packages/ui
import * as LucideIcons from "lucide-react"; // For icons

// Define a simple user type for props
interface UserNavProps {
  user?: {
    id?: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    email?: string; // Optional
  };
  onLogout?: () => Promise<void> | void;
  isLoading?: boolean;
}

export function UserNav({ user, onLogout, isLoading }: UserNavProps) {
  if (isLoading) {
    return <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />; // Skeleton for avatar
  }

  if (!user) {
    // Optional: Render a login button or nothing if user is not available
    // For now, keeping it simple and assuming it's only rendered if user exists,
    // or SiteHeader handles the no-user state.
    // This component is primarily for when a user *is* present.
    return null;
  }

  const userInitial = user.displayName
    ? user.displayName.charAt(0).toUpperCase()
    : user.username
    ? user.username.charAt(0).toUpperCase()
    : "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={`@${user.username || 'user'}`} />}
            <AvatarFallback>{userInitial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.displayName || user.username}
            </p>
            {user.email && (
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile" className="flex items-center cursor-pointer w-full"> {/* Ensure links in admin-portal context */}
              <LucideIcons.UserCircle className="mr-2 h-4 w-4" />
              <span>个人资料</span> {/* Profile */}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/admin/system/general" className="flex items-center cursor-pointer w-full"> {/* Example settings link */}
              <LucideIcons.Settings className="mr-2 h-4 w-4" />
              <span>系统设置</span> {/* Settings */}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {onLogout && (
          <DropdownMenuItem onClick={onLogout} className="flex items-center cursor-pointer text-destructive dark:text-red-500 focus:text-destructive focus:dark:text-red-500">
            <LucideIcons.LogOut className="mr-2 h-4 w-4" />
            <span>登出</span> {/* Log out */}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

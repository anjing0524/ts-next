'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from "@repo/ui";
import { LucideIcon } from 'lucide-react';

interface MenuItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  isCollapsed: boolean;
  onClick?: () => void;
}

export function MenuItem({
  href,
  icon: Icon,
  label,
  isActive,
  isCollapsed,
  onClick,
}: MenuItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative flex items-center rounded-lg px-3 py-2.5 transition-all duration-300',
        'hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        isActive
          ? 'bg-primary/15 text-primary shadow-md shadow-primary/20'
          : 'text-muted-foreground hover:text-foreground',
        isCollapsed ? 'justify-center' : 'justify-start space-x-3'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      {/* 活动状态指示器 */}
      {isActive && (
        <div className="absolute -left-2 h-6 w-1 rounded-full bg-primary" />
      )}

      {/* 图标 */}
      <div className={cn(
        'relative flex items-center justify-center',
        'transition-transform duration-300 group-hover:scale-110',
        isActive && 'text-primary'
      )}>
        <Icon className="h-5 w-5" />

        {/* 图标光晕效果 */}
        {isActive && (
          <div className="absolute inset-0 -z-10 h-6 w-6 rounded-full bg-primary/20 blur-sm" />
        )}
      </div>

      {/* 标签 - 折叠时隐藏 */}
      {!isCollapsed && (
        <span className="font-medium transition-all duration-300">
          {label}
        </span>
      )}

      {/* 工具提示 - 折叠时显示 */}
      {isCollapsed && (
        <div className="absolute left-full ml-2 hidden rounded-md bg-popover px-3 py-2 text-sm font-medium text-popover-foreground shadow-lg group-hover:block">
          {label}
        </div>
      )}
    </Link>
  );
}
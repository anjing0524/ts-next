'use client';

import React, { useState } from 'react';
import { cn } from "@repo/ui";
import { Button } from "@repo/ui";
import { Sheet, SheetContent, SheetTrigger } from "@repo/ui";
import { Menu } from 'lucide-react';
import { EnhancedSidebar } from './EnhancedSidebar';

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <EnhancedSidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden fixed top-4 left-4 z-50"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <EnhancedSidebar
            isCollapsed={false}
            onToggleCollapse={handleToggleCollapse}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center border-b bg-background px-6 lg:px-8">
          <div className="flex flex-1 items-center justify-between">
            <div className="lg:hidden" /> {/* Spacer for mobile menu button */}
            <div className="flex items-center space-x-4">
              {/* 可以在这里添加面包屑导航或其他头部内容 */}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={cn(
          "flex-1 overflow-auto p-6 lg:p-8 transition-all duration-500",
          isCollapsed ? "lg:ml-20" : "lg:ml-64"
        )}>
          {children}
        </main>
      </div>
    </div>
  );
}